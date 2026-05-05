use std::collections::HashMap;
use std::fs;
use std::io::BufWriter;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::ImageEncoder;
use serde::{Deserialize, Serialize};

use crate::image_engine::{
    export_frames_pack, process_single_video_frame_with_animation, prepare_video_layers,
    AnimationRenderMode, AnimationTrack, EffectLayer, TemporalVariationConfig,
    VideoFrameBatchResult,
};

const DEFAULT_FPS: f64 = 30.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyStatus {
    pub ffmpeg_available: bool,
    pub ffmpeg_version: Option<String>,
    pub ffmpeg_source: Option<String>,
    pub ffprobe_available: bool,
    pub ffprobe_version: Option<String>,
    pub ffprobe_source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoEncodingOptions {
    pub fps: Option<f64>,
    pub codec: Option<String>,
    pub preset: Option<String>,
    pub crf: Option<u8>,
    pub pix_fmt: Option<String>,
}

#[derive(Debug, Clone)]
struct ResolvedVideoEncodingOptions {
    fps: f64,
    codec: String,
    preset: Option<String>,
    crf: Option<u8>,
    pix_fmt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessVideoFileRequest {
    pub input_path: String,
    pub output_path: String,
    pub layers: Vec<EffectLayer>,
    pub temporal: Option<TemporalVariationConfig>,
    pub tracks: Option<Vec<AnimationTrack>>,
    pub keep_audio: Option<bool>,
    pub encoding: Option<VideoEncodingOptions>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessVideoFileBytesRequest {
    pub original_name: Option<String>,
    pub file_bytes: Vec<u8>,
    pub output_path: String,
    pub layers: Vec<EffectLayer>,
    pub temporal: Option<TemporalVariationConfig>,
    pub tracks: Option<Vec<AnimationTrack>>,
    pub keep_audio: Option<bool>,
    pub encoding: Option<VideoEncodingOptions>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessStillAnimationFileRequest {
    pub output_path: String,
    pub width: u32,
    pub height: u32,
    pub frame: Vec<u8>,
    pub frame_count: u32,
    pub layers: Vec<EffectLayer>,
    pub temporal: Option<TemporalVariationConfig>,
    pub tracks: Option<Vec<AnimationTrack>>,
    pub mode: Option<AnimationRenderMode>,
    pub quick_stride: Option<u32>,
    pub encoding: Option<VideoEncodingOptions>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum VideoJobStatus {
    Queued,
    Running,
    Completed,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoJobProgress {
    pub job_id: String,
    pub status: VideoJobStatus,
    pub current_frame: usize,
    pub total_frames: usize,
    pub cancellation_requested: bool,
    pub output_path: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportVideoFramesPackFromFileRequest {
    pub name: Option<String>,
    pub processed_frames_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportVideoFramesPackFromFileResult {
    pub file_name: String,
    pub file_extension: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoFileMetadata {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub duration_seconds: f64,
    pub estimated_frame_count: u64,
    pub has_audio: bool,
}

static VIDEO_JOBS: OnceLock<Mutex<HashMap<String, VideoJobProgress>>> = OnceLock::new();
static JOB_COUNTER: AtomicU64 = AtomicU64::new(1);

fn jobs() -> &'static Mutex<HashMap<String, VideoJobProgress>> {
    VIDEO_JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn start_video_file_job(request: ProcessVideoFileRequest) -> Result<String, String> {
    validate_request(&request)?;
    ensure_media_tools_available()?;

    let job_id = next_job_id();
    {
        let mut map = jobs()
            .lock()
            .map_err(|_| "Failed to acquire video jobs lock".to_string())?;
        map.insert(
            job_id.clone(),
            VideoJobProgress {
                job_id: job_id.clone(),
                status: VideoJobStatus::Queued,
                current_frame: 0,
                total_frames: 0,
                cancellation_requested: false,
                output_path: None,
                message: Some("Queued".to_string()),
            },
        );
    }

    let worker_job_id = job_id.clone();
    thread::spawn(move || {
        if let Err(err) = run_video_job(&worker_job_id, request) {
            let _ = update_job(
                worker_job_id.as_str(),
                VideoJobStatus::Failed,
                None,
                None,
                None,
                Some(err),
            );
        }
    });

    Ok(job_id)
}

pub fn start_video_file_job_from_bytes(request: ProcessVideoFileBytesRequest) -> Result<String, String> {
    if request.file_bytes.is_empty() {
        return Err("file_bytes cannot be empty".to_string());
    }

    if request.output_path.trim().is_empty() {
        return Err("output_path cannot be empty".to_string());
    }

    let extension = request
        .original_name
        .as_deref()
        .and_then(|name| Path::new(name).extension().and_then(|ext| ext.to_str()))
        .map(|ext| ext.to_ascii_lowercase())
        .filter(|ext| !ext.is_empty())
        .unwrap_or_else(|| "mp4".to_string());

    let temp_input = std::env::temp_dir().join(format!(
        "dyuki-input-{}.{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0),
        extension
    ));

    fs::write(&temp_input, &request.file_bytes)
        .map_err(|e| format!("Failed to write temp input file {}: {e}", temp_input.display()))?;

    let converted = ProcessVideoFileRequest {
        input_path: temp_input.to_string_lossy().to_string(),
        output_path: request.output_path,
        layers: request.layers,
        temporal: request.temporal,
        tracks: request.tracks,
        keep_audio: request.keep_audio,
        encoding: request.encoding,
    };

    start_video_file_job(converted)
}

pub fn get_video_job_progress(job_id: &str) -> Result<VideoJobProgress, String> {
    let map = jobs()
        .lock()
        .map_err(|_| "Failed to acquire video jobs lock".to_string())?;
    map.get(job_id)
        .cloned()
        .ok_or_else(|| format!("Video job not found: {job_id}"))
}

pub fn start_still_animation_file_job(
    request: ProcessStillAnimationFileRequest,
) -> Result<String, String> {
    validate_still_animation_file_request(&request)?;
    ensure_media_tools_available()?;

    let job_id = next_job_id();
    {
        let mut map = jobs()
            .lock()
            .map_err(|_| "Failed to acquire video jobs lock".to_string())?;
        map.insert(
            job_id.clone(),
            VideoJobProgress {
                job_id: job_id.clone(),
                status: VideoJobStatus::Queued,
                current_frame: 0,
                total_frames: request.frame_count as usize,
                cancellation_requested: false,
                output_path: None,
                message: Some("Queued".to_string()),
            },
        );
    }

    let worker_job_id = job_id.clone();
    thread::spawn(move || {
        if let Err(err) = run_still_animation_job(&worker_job_id, request) {
            let _ = update_job(
                worker_job_id.as_str(),
                VideoJobStatus::Failed,
                None,
                None,
                None,
                Some(err),
            );
        }
    });

    Ok(job_id)
}

pub fn cancel_video_job(job_id: &str) -> Result<VideoJobProgress, String> {
    let mut map = jobs()
        .lock()
        .map_err(|_| "Failed to acquire video jobs lock".to_string())?;

    let Some(job) = map.get_mut(job_id) else {
        return Err(format!("Video job not found: {job_id}"));
    };

    match job.status {
        VideoJobStatus::Completed | VideoJobStatus::Failed | VideoJobStatus::Cancelled => {
            return Ok(job.clone());
        }
        VideoJobStatus::Queued | VideoJobStatus::Running => {
            job.cancellation_requested = true;
            job.message = Some("Cancellation requested".to_string());
        }
    }

    Ok(job.clone())
}

pub fn export_video_frames_pack_from_dir(
    request: ExportVideoFramesPackFromFileRequest,
) -> Result<ExportVideoFramesPackFromFileResult, String> {
    let dir = PathBuf::from(&request.processed_frames_dir);
    if !dir.is_dir() {
        return Err(format!(
            "processed_frames_dir is not a directory: {}",
            dir.display()
        ));
    }

    let mut files = list_png_files_sorted(&dir)?;
    if files.is_empty() {
        return Err("No processed PNG frames found".to_string());
    }

    let first = read_png_rgba(&files[0])?;
    let width = first.0;
    let height = first.1;

    let mut frames = Vec::with_capacity(files.len());
    frames.push(first.2);

    for path in files.drain(1..) {
        let (w, h, data) = read_png_rgba(&path)?;
        if w != width || h != height {
            return Err(format!(
                "Inconsistent frame dimensions in {}: got {}x{}, expected {}x{}",
                path.display(),
                w,
                h,
                width,
                height
            ));
        }
        frames.push(data);
    }

    let batch = VideoFrameBatchResult {
        width,
        height,
        frame_count: frames.len(),
        processed_frames: frames,
    };

    let name = request.name.unwrap_or_else(|| "video-export".to_string());
    let pack = export_frames_pack(&batch, &name)?;

    Ok(ExportVideoFramesPackFromFileResult {
        file_name: pack.file_name,
        file_extension: pack.file_extension,
        bytes: pack.bytes,
    })
}

pub fn probe_video_file_metadata(input_path: &str) -> Result<VideoFileMetadata, String> {
    let path = PathBuf::from(input_path);
    if !path.is_file() {
        return Err(format!("Input file does not exist: {}", path.display()));
    }

    ensure_media_tools_available()?;

    let input = path
        .to_str()
        .ok_or_else(|| "Invalid UTF-8 in input path".to_string())?;

    let ffprobe = resolve_binary_path("ffprobe")?;
    let out = Command::new(&ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,avg_frame_rate,r_frame_rate",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1",
            input,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {e}"))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("ffprobe failed: {stderr}"));
    }

    let text = String::from_utf8_lossy(&out.stdout);
    let mut width: Option<u32> = None;
    let mut height: Option<u32> = None;
    let mut fps: Option<f64> = None;
    let mut duration: Option<f64> = None;

    for line in text.lines().map(str::trim).filter(|l| !l.is_empty()) {
        if let Some(v) = line.strip_prefix("width=") {
            width = v.parse::<u32>().ok();
        } else if let Some(v) = line.strip_prefix("height=") {
            height = v.parse::<u32>().ok();
        } else if let Some(v) = line.strip_prefix("avg_frame_rate=") {
            fps = parse_ffprobe_rate(v);
        } else if let Some(v) = line.strip_prefix("r_frame_rate=") {
            if fps.is_none() {
                fps = parse_ffprobe_rate(v);
            }
        } else if let Some(v) = line.strip_prefix("duration=") {
            duration = v.parse::<f64>().ok();
        }
    }

    let width = width.ok_or_else(|| "Could not parse video width".to_string())?;
    let height = height.ok_or_else(|| "Could not parse video height".to_string())?;
    let fps = fps.unwrap_or(DEFAULT_FPS);
    let duration_seconds = duration.unwrap_or(0.0).max(0.0);
    let estimated_frame_count = (duration_seconds * fps).round().max(0.0) as u64;

    let has_audio = probe_has_audio(input).unwrap_or(false);

    Ok(VideoFileMetadata {
        width,
        height,
        fps,
        duration_seconds,
        estimated_frame_count,
        has_audio,
    })
}

fn probe_has_audio(input: &str) -> Result<bool, String> {
    let ffprobe = resolve_binary_path("ffprobe")?;
    let out = Command::new(&ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=index",
            "-of",
            "csv=p=0",
            input,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe for audio stream: {e}"))?;

    if !out.status.success() {
        return Ok(false);
    }

    Ok(!String::from_utf8_lossy(&out.stdout).trim().is_empty())
}

fn run_video_job(job_id: &str, request: ProcessVideoFileRequest) -> Result<(), String> {
    let input_path = PathBuf::from(&request.input_path);
    if !input_path.is_file() {
        return Err(format!("Input file does not exist: {}", input_path.display()));
    }

    let output_path = PathBuf::from(&request.output_path);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output dir {}: {e}", parent.display()))?;
    }

    let temp_root = std::env::temp_dir().join(format!("dyuki-video-{}", job_id));
    let input_frames_dir = temp_root.join("input_frames");
    let output_frames_dir = temp_root.join("output_frames");
    fs::create_dir_all(&input_frames_dir)
        .map_err(|e| format!("Failed to create temp input frames dir: {e}"))?;
    fs::create_dir_all(&output_frames_dir)
        .map_err(|e| format!("Failed to create temp output frames dir: {e}"))?;

    update_job(
        job_id,
        VideoJobStatus::Running,
        Some(0),
        Some(0),
        None,
        Some("Extracting frames".to_string()),
    )?;

    if mark_cancelled_if_requested(job_id, 0, 0)? {
        let _ = fs::remove_dir_all(&temp_root);
        return Ok(());
    }

    if let Err(err) = extract_frames_to_png(job_id, &input_path, &input_frames_dir) {
        if err == "Video processing cancelled" {
            update_job(
                job_id,
                VideoJobStatus::Cancelled,
                Some(0),
                Some(0),
                None,
                Some("Cancelled".to_string()),
            )?;
            let _ = fs::remove_dir_all(&temp_root);
            return Ok(());
        }
        return Err(err);
    }

    let frame_files = list_png_files_sorted(&input_frames_dir)?;
    if frame_files.is_empty() {
        return Err("No frames extracted from input video".to_string());
    }

    let first = read_png_rgba(&frame_files[0])?;
    let width = first.0;
    let height = first.1;

    let prepared_layers = prepare_video_layers(&request.layers)?;
    let temporal = request.temporal.unwrap_or_default();
    let tracks = request.tracks.unwrap_or_default();
    let source_fps = probe_video_fps(&input_path).unwrap_or(DEFAULT_FPS);
    let encoding = resolve_encoding_options(request.encoding, source_fps)?;

    update_job(
        job_id,
        VideoJobStatus::Running,
        Some(0),
        Some(frame_files.len()),
        None,
        Some("Processing frames".to_string()),
    )?;

    if mark_cancelled_if_requested(job_id, 0, frame_files.len())? {
        let _ = fs::remove_dir_all(&temp_root);
        return Ok(());
    }

    {
        use rayon::prelude::*;

        let completed = AtomicUsize::new(0);
        let parallel_result: Result<(), String> = frame_files
            .par_iter()
            .enumerate()
            .try_for_each(|(index, in_path)| {
                if is_cancel_requested(job_id)? {
                    return Err("Video processing cancelled".to_string());
                }

                let (w, h, data) = read_png_rgba(in_path)?;
                if w != width || h != height {
                    return Err(format!(
                        "Frame dimensions mismatch in {}: got {}x{}, expected {}x{}",
                        in_path.display(),
                        w,
                        h,
                        width,
                        height
                    ));
                }

                let processed = process_single_video_frame_with_animation(
                    width,
                    height,
                    &data,
                    &prepared_layers,
                    &temporal,
                    &tracks,
                    index as u32,
                    frame_files.len() as u32,
                )?;

                let out_path = output_frames_dir.join(format!("frame_{:06}.png", index + 1));
                write_png_rgba(&out_path, width, height, &processed)?;

                let done = completed.fetch_add(1, Ordering::Relaxed) + 1;
                if done == frame_files.len() || done % 8 == 0 {
                    let _ = update_job(
                        job_id,
                        VideoJobStatus::Running,
                        Some(done),
                        Some(frame_files.len()),
                        None,
                        None,
                    );
                }

                Ok(())
            });

        if let Err(err) = parallel_result {
            if err == "Video processing cancelled" {
                update_job(
                    job_id,
                    VideoJobStatus::Cancelled,
                    None,
                    Some(frame_files.len()),
                    None,
                    Some("Cancelled".to_string()),
                )?;
                let _ = fs::remove_dir_all(&temp_root);
                return Ok(());
            }

            return Err(err);
        }
    }

    update_job(
        job_id,
        VideoJobStatus::Running,
        Some(frame_files.len()),
        Some(frame_files.len()),
        None,
        Some(format!(
            "Encoding output video ({:.3} fps, {})",
            encoding.fps, encoding.codec
        )),
    )?;

    if mark_cancelled_if_requested(job_id, frame_files.len(), frame_files.len())? {
        let _ = fs::remove_dir_all(&temp_root);
        return Ok(());
    }

    let keep_audio = request.keep_audio.unwrap_or(true);
    if let Err(err) = encode_video_from_png(
        job_id,
        &input_path,
        &output_frames_dir,
        &output_path,
        keep_audio,
        &encoding,
    ) {
        if err == "Video processing cancelled" {
            update_job(
                job_id,
                VideoJobStatus::Cancelled,
                Some(frame_files.len()),
                Some(frame_files.len()),
                None,
                Some("Cancelled".to_string()),
            )?;
            let _ = fs::remove_dir_all(&temp_root);
            return Ok(());
        }
        return Err(err);
    }

    update_job(
        job_id,
        VideoJobStatus::Completed,
        Some(frame_files.len()),
        Some(frame_files.len()),
        Some(output_path.to_string_lossy().to_string()),
        Some("Completed".to_string()),
    )?;

    // Best effort cleanup.
    let _ = fs::remove_dir_all(&temp_root);

    Ok(())
}

fn run_still_animation_job(
    job_id: &str,
    request: ProcessStillAnimationFileRequest,
) -> Result<(), String> {
    let output_path = PathBuf::from(&request.output_path);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output dir {}: {e}", parent.display()))?;
    }

    let temp_root = std::env::temp_dir().join(format!("dyuki-still-anim-{}", job_id));
    let output_frames_dir = temp_root.join("output_frames");
    fs::create_dir_all(&output_frames_dir)
        .map_err(|e| format!("Failed to create temp output frames dir: {e}"))?;

    let prepared_layers = prepare_video_layers(&request.layers)?;
    let temporal = request.temporal.unwrap_or_default();
    let tracks = request.tracks.unwrap_or_default();

    let mode = request.mode.unwrap_or(AnimationRenderMode::Rendered);
    let quick_stride = request.quick_stride.unwrap_or(2).max(1);
    let frame_indices: Vec<u32> = match mode {
        AnimationRenderMode::Rendered => (0..request.frame_count).collect(),
        AnimationRenderMode::Quick => (0..request.frame_count).step_by(quick_stride as usize).collect(),
    };

    let output_fps = resolve_output_fps(&request.encoding, mode, quick_stride)?;
    let encoding = resolve_encoding_options(request.encoding, output_fps)?;

    update_job(
        job_id,
        VideoJobStatus::Running,
        Some(0),
        Some(frame_indices.len()),
        None,
        Some("Rendering still-image animation".to_string()),
    )?;

    for (render_idx, timeline_idx) in frame_indices.iter().enumerate() {
        if mark_cancelled_if_requested(job_id, render_idx, frame_indices.len())? {
            let _ = fs::remove_dir_all(&temp_root);
            return Ok(());
        }

        let processed = process_single_video_frame_with_animation(
            request.width,
            request.height,
            &request.frame,
            &prepared_layers,
            &temporal,
            &tracks,
            *timeline_idx,
            request.frame_count.max(1),
        )?;

        let out_path = output_frames_dir.join(format!("frame_{:06}.png", render_idx + 1));
        write_png_rgba(&out_path, request.width, request.height, &processed)?;

        update_job(
            job_id,
            VideoJobStatus::Running,
            Some(render_idx + 1),
            Some(frame_indices.len()),
            None,
            None,
        )?;
    }

    update_job(
        job_id,
        VideoJobStatus::Running,
        Some(frame_indices.len()),
        Some(frame_indices.len()),
        None,
        Some(format!(
            "Encoding still animation ({:.3} fps, {})",
            encoding.fps, encoding.codec
        )),
    )?;

    if mark_cancelled_if_requested(job_id, frame_indices.len(), frame_indices.len())? {
        let _ = fs::remove_dir_all(&temp_root);
        return Ok(());
    }

    if let Err(err) = encode_video_from_png_sequence(
        job_id,
        &output_frames_dir,
        &output_path,
        &encoding,
    ) {
        if err == "Video processing cancelled" {
            update_job(
                job_id,
                VideoJobStatus::Cancelled,
                Some(frame_indices.len()),
                Some(frame_indices.len()),
                None,
                Some("Cancelled".to_string()),
            )?;
            let _ = fs::remove_dir_all(&temp_root);
            return Ok(());
        }
        return Err(err);
    }

    update_job(
        job_id,
        VideoJobStatus::Completed,
        Some(frame_indices.len()),
        Some(frame_indices.len()),
        Some(output_path.to_string_lossy().to_string()),
        Some("Completed".to_string()),
    )?;

    let _ = fs::remove_dir_all(&temp_root);
    Ok(())
}

fn extract_frames_to_png(job_id: &str, input: &Path, output_dir: &Path) -> Result<(), String> {
    run_ffmpeg(&[
        "-y",
        "-i",
        input
            .to_str()
            .ok_or_else(|| "Invalid UTF-8 in input path".to_string())?,
        "-vsync",
        "0",
        "-compression_level",
        "1",
        output_dir
            .join("frame_%06d.png")
            .to_str()
            .ok_or_else(|| "Invalid UTF-8 in output dir".to_string())?,
    ], Some(job_id))
}

fn encode_video_from_png(
    job_id: &str,
    source_video: &Path,
    frames_dir: &Path,
    output_video: &Path,
    keep_audio: bool,
    encoding: &ResolvedVideoEncodingOptions,
) -> Result<(), String> {
    if is_gif_output(output_video) {
        return encode_gif_from_png_sequence(Some(job_id), frames_dir, output_video, encoding.fps);
    }

    let pattern = frames_dir
        .join("frame_%06d.png")
        .to_str()
        .ok_or_else(|| "Invalid UTF-8 in frames path".to_string())?
        .to_string();

    let fps = format_fps(encoding.fps);

    let mut args = vec![
        "-y".to_string(),
        "-framerate".to_string(),
        fps,
        "-i".to_string(),
        pattern,
    ];

    if keep_audio {
        args.extend([
            "-i".to_string(),
            source_video
                .to_str()
                .ok_or_else(|| "Invalid UTF-8 in source path".to_string())?
                .to_string(),
            "-map".to_string(),
            "0:v:0".to_string(),
            "-map".to_string(),
            "1:a?".to_string(),
        ]);
    }

    args.extend(["-c:v".to_string(), encoding.codec.clone()]);

    if codec_supports_preset_crf(&encoding.codec) {
        if let Some(preset) = &encoding.preset {
            args.extend(["-preset".to_string(), preset.clone()]);
        }

        if let Some(crf) = encoding.crf {
            args.extend(["-crf".to_string(), crf.to_string()]);
        }
    }

    args.extend(["-pix_fmt".to_string(), encoding.pix_fmt.clone()]);

    if keep_audio {
        args.extend([
            "-c:a".to_string(),
            "copy".to_string(),
            "-shortest".to_string(),
        ]);
    }

    args.push(
        output_video
            .to_str()
            .ok_or_else(|| "Invalid UTF-8 in output path".to_string())?
            .to_string(),
    );

    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    run_ffmpeg(&refs, Some(job_id))
}

fn encode_video_from_png_sequence(
    job_id: &str,
    frames_dir: &Path,
    output_video: &Path,
    encoding: &ResolvedVideoEncodingOptions,
) -> Result<(), String> {
    if is_gif_output(output_video) {
        return encode_gif_from_png_sequence(Some(job_id), frames_dir, output_video, encoding.fps);
    }

    let pattern = frames_dir
        .join("frame_%06d.png")
        .to_str()
        .ok_or_else(|| "Invalid UTF-8 in frames path".to_string())?
        .to_string();

    let fps = format_fps(encoding.fps);
    let mut args = vec![
        "-y".to_string(),
        "-framerate".to_string(),
        fps,
        "-i".to_string(),
        pattern,
        "-c:v".to_string(),
        encoding.codec.clone(),
    ];

    if codec_supports_preset_crf(&encoding.codec) {
        if let Some(preset) = &encoding.preset {
            args.extend(["-preset".to_string(), preset.clone()]);
        }

        if let Some(crf) = encoding.crf {
            args.extend(["-crf".to_string(), crf.to_string()]);
        }
    }

    args.extend(["-pix_fmt".to_string(), encoding.pix_fmt.clone()]);
    args.push(
        output_video
            .to_str()
            .ok_or_else(|| "Invalid UTF-8 in output path".to_string())?
            .to_string(),
    );

    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    run_ffmpeg(&refs, Some(job_id))
}

fn is_gif_output(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("gif"))
        .unwrap_or(false)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GifExportResult {
    pub file_name: String,
    pub file_extension: String,
    pub bytes: Vec<u8>,
}

pub fn export_gif_from_frames(
    name: Option<String>,
    width: u32,
    height: u32,
    frames: Vec<Vec<u8>>,
    fps: Option<f64>,
) -> Result<GifExportResult, String> {
    if width == 0 || height == 0 {
        return Err("width/height must be > 0".to_string());
    }

    if frames.is_empty() {
        return Err("frames cannot be empty".to_string());
    }

    let expected_len = (width as usize)
        .checked_mul(height as usize)
        .and_then(|px| px.checked_mul(4))
        .ok_or_else(|| "Frame size overflow".to_string())?;

    for (index, frame) in frames.iter().enumerate() {
        if frame.len() != expected_len {
            return Err(format!(
                "Invalid RGBA frame length at index {}: got {}, expected {}",
                index,
                frame.len(),
                expected_len
            ));
        }
    }

    ensure_media_tools_available()?;

    let export_name = name.unwrap_or_else(|| "animation-export".to_string());
    let slug = slugify_name(&export_name);

    let temp_root = std::env::temp_dir().join(format!(
        "dyuki-gif-export-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    let frames_dir = temp_root.join("frames");
    fs::create_dir_all(&frames_dir)
        .map_err(|e| format!("Failed to create temp frames dir: {e}"))?;

    for (index, frame) in frames.iter().enumerate() {
        let path = frames_dir.join(format!("frame_{:06}.png", index + 1));
        write_png_rgba(&path, width, height, frame)?;
    }

    let output_path = temp_root.join(format!("{}.gif", slug));
    let target_fps = fps.unwrap_or(DEFAULT_FPS).max(1.0);

    let encode_result = encode_gif_from_png_sequence(None, &frames_dir, &output_path, target_fps);
    if let Err(err) = encode_result {
        let _ = fs::remove_dir_all(&temp_root);
        return Err(err);
    }

    let bytes = fs::read(&output_path)
        .map_err(|e| format!("Failed to read generated GIF {}: {e}", output_path.display()))?;

    let _ = fs::remove_dir_all(&temp_root);

    Ok(GifExportResult {
        file_name: format!("{}.gif", slug),
        file_extension: "gif".to_string(),
        bytes,
    })
}

fn encode_gif_from_png_sequence(
    cancel_job_id: Option<&str>,
    frames_dir: &Path,
    output_gif: &Path,
    fps: f64,
) -> Result<(), String> {
    let pattern = frames_dir
        .join("frame_%06d.png")
        .to_str()
        .ok_or_else(|| "Invalid UTF-8 in frames path".to_string())?
        .to_string();

    let palette_path = output_gif.with_extension("gif-palette.png");
    let palette = palette_path
        .to_str()
        .ok_or_else(|| "Invalid UTF-8 in palette path".to_string())?
        .to_string();

    let fps = format_fps(fps);

    let palettegen = vec![
        "-y".to_string(),
        "-framerate".to_string(),
        fps.clone(),
        "-i".to_string(),
        pattern.clone(),
        "-vf".to_string(),
        "palettegen=stats_mode=diff".to_string(),
        palette.clone(),
    ];
    let palettegen_refs: Vec<&str> = palettegen.iter().map(String::as_str).collect();
    run_ffmpeg(&palettegen_refs, cancel_job_id)?;

    let paletteuse = vec![
        "-y".to_string(),
        "-framerate".to_string(),
        fps,
        "-i".to_string(),
        pattern,
        "-i".to_string(),
        palette.clone(),
        "-lavfi".to_string(),
        "paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle".to_string(),
        output_gif
            .to_str()
            .ok_or_else(|| "Invalid UTF-8 in output path".to_string())?
            .to_string(),
    ];
    let paletteuse_refs: Vec<&str> = paletteuse.iter().map(String::as_str).collect();
    let result = run_ffmpeg(&paletteuse_refs, cancel_job_id);

    let _ = fs::remove_file(&palette_path);
    result
}

fn slugify_name(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if ch.is_whitespace() || ch == '-' || ch == '_' {
            if !out.ends_with('-') {
                out.push('-');
            }
        }
    }

    let slug = out.trim_matches('-').to_string();
    if slug.is_empty() {
        "animation-export".to_string()
    } else {
        slug
    }
}

fn run_ffmpeg(args: &[&str], cancel_job_id: Option<&str>) -> Result<(), String> {
    let ffmpeg = resolve_binary_path("ffmpeg")?;
    let mut child = Command::new(&ffmpeg)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run ffmpeg ({}): {e}", ffmpeg.display()))?;

    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|e| format!("Failed to wait for ffmpeg: {e}"))?
        {
            if status.success() {
                return Ok(());
            }

            let mut stderr_buf = Vec::new();
            if let Some(mut stderr) = child.stderr.take() {
                let _ = stderr.read_to_end(&mut stderr_buf);
            }

            let stderr = String::from_utf8_lossy(&stderr_buf);
            return Err(format!("ffmpeg failed: {stderr}"));
        }

        if let Some(job_id) = cancel_job_id {
            if is_cancel_requested(job_id)? {
                let _ = child.kill();
                let _ = child.wait_with_output();
                return Err("Video processing cancelled".to_string());
            }
        }

        thread::sleep(Duration::from_millis(100));
    }
}

fn ensure_media_tools_available() -> Result<(), String> {
    let status = check_dependencies();

    if !status.ffmpeg_available {
        return Err("FFmpeg not found (neither sidecar nor system PATH)".to_string());
    }

    if !status.ffprobe_available {
        return Err("FFprobe not found (neither sidecar nor system PATH)".to_string());
    }

    Ok(())
}

pub fn check_dependencies() -> DependencyStatus {
    let ffmpeg_path = resolve_binary_path("ffmpeg").ok();
    let ffprobe_path = resolve_binary_path("ffprobe").ok();

    let (ffmpeg_available, ffmpeg_version) = match ffmpeg_path.as_ref() {
        Some(path) => probe_tool_version(path),
        None => (false, None),
    };
    let (ffprobe_available, ffprobe_version) = match ffprobe_path.as_ref() {
        Some(path) => probe_tool_version(path),
        None => (false, None),
    };

    DependencyStatus {
        ffmpeg_available,
        ffmpeg_version,
        ffmpeg_source: ffmpeg_path.as_ref().map(|path| detect_binary_source(path)),
        ffprobe_available,
        ffprobe_version,
        ffprobe_source: ffprobe_path.as_ref().map(|path| detect_binary_source(path)),
    }
}

fn probe_tool_version(path: &Path) -> (bool, Option<String>) {
    match Command::new(path).arg("-version").output() {
        Ok(output) if output.status.success() => {
            let first_line = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .map(|line| line.trim().to_string());
            (true, first_line)
        }
        _ => (false, None),
    }
}

fn detect_binary_source(path: &Path) -> String {
    if path.is_absolute() {
        "sidecar".to_string()
    } else {
        "system".to_string()
    }
}

fn resolve_binary_path(binary: &str) -> Result<PathBuf, String> {
    if let Some(sidecar_path) = resolve_sidecar_path(binary) {
        return Ok(sidecar_path);
    }

    // Fallback to system-installed binary in PATH.
    Ok(PathBuf::from(binary))
}

fn resolve_sidecar_path(binary: &str) -> Option<PathBuf> {
    // Tauri v2 keeps sidecars near executable/resources depending on target.
    // We probe the common runtime bundle locations first.
    let current_exe = std::env::current_exe().ok()?;
    let exe_dir = current_exe.parent()?;
    let resources_dir = exe_dir.parent().map(|p| p.join("Resources"));

    let mut candidates = vec![binary.to_string(), platform_binary_name(binary)];
    candidates.extend(target_suffixed_binary_names(binary));

    let search_dirs = [Some(exe_dir.to_path_buf()), resources_dir];

    for dir in search_dirs.into_iter().flatten() {
        for name in &candidates {
            let direct = dir.join(name);
            if direct.is_file() {
                return Some(direct);
            }
        }

        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                    if file_name == binary
                        || file_name == platform_binary_name(binary)
                        || file_name.starts_with(&format!("{binary}-"))
                    {
                        return Some(path);
                    }
                }
            }
        }
    }

    None
}

fn platform_binary_name(binary: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        format!("{binary}.exe")
    }

    #[cfg(not(target_os = "windows"))]
    {
        binary.to_string()
    }
}

fn target_suffixed_binary_names(binary: &str) -> Vec<String> {
    let mut names = Vec::new();

    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    names.push(format!("{binary}-aarch64-apple-darwin"));

    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    names.push(format!("{binary}-x86_64-apple-darwin"));

    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    names.push(format!("{binary}-x86_64-unknown-linux-gnu"));

    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    names.push(format!("{binary}-aarch64-unknown-linux-gnu"));

    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    names.push(format!("{binary}-x86_64-pc-windows-msvc.exe"));

    names
}

fn update_job(
    job_id: &str,
    status: VideoJobStatus,
    current_frame: Option<usize>,
    total_frames: Option<usize>,
    output_path: Option<String>,
    message: Option<String>,
) -> Result<(), String> {
    let mut map = jobs()
        .lock()
        .map_err(|_| "Failed to acquire video jobs lock".to_string())?;

    let Some(job) = map.get_mut(job_id) else {
        return Err(format!("Video job not found: {job_id}"));
    };

    job.status = status;
    if let Some(cur) = current_frame {
        job.current_frame = cur;
    }
    if let Some(total) = total_frames {
        job.total_frames = total;
    }
    if let Some(path) = output_path {
        job.output_path = Some(path);
    }
    if let Some(msg) = message {
        job.message = Some(msg);
    }

    Ok(())
}

fn is_cancel_requested(job_id: &str) -> Result<bool, String> {
    let map = jobs()
        .lock()
        .map_err(|_| "Failed to acquire video jobs lock".to_string())?;

    let Some(job) = map.get(job_id) else {
        return Err(format!("Video job not found: {job_id}"));
    };

    Ok(job.cancellation_requested)
}

fn mark_cancelled_if_requested(job_id: &str, current: usize, total: usize) -> Result<bool, String> {
    if !is_cancel_requested(job_id)? {
        return Ok(false);
    }

    update_job(
        job_id,
        VideoJobStatus::Cancelled,
        Some(current),
        Some(total),
        None,
        Some("Cancelled".to_string()),
    )?;

    Ok(true)
}

fn resolve_encoding_options(
    provided: Option<VideoEncodingOptions>,
    fallback_fps: f64,
) -> Result<ResolvedVideoEncodingOptions, String> {
    let provided = provided.unwrap_or(VideoEncodingOptions {
        fps: None,
        codec: None,
        preset: None,
        crf: None,
        pix_fmt: None,
    });

    let fps = provided.fps.unwrap_or(fallback_fps);
    if !fps.is_finite() || fps <= 0.0 {
        return Err(format!("Invalid FPS value: {fps}"));
    }

    let codec = provided.codec.unwrap_or_else(|| {
        if cfg!(target_os = "macos") {
            "h264_videotoolbox".to_string()
        } else {
            "libx264".to_string()
        }
    });
    if codec.trim().is_empty() {
        return Err("encoding.codec cannot be empty".to_string());
    }

    let preset = provided
        .preset
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty());

    if let Some(crf) = provided.crf {
        if crf > 51 {
            return Err("encoding.crf must be in range 0..=51".to_string());
        }
    }

    let default_pix_fmt = if codec.eq_ignore_ascii_case("h264_videotoolbox") {
        "nv12"
    } else {
        "yuv420p"
    };

    let pix_fmt = provided
        .pix_fmt
        .unwrap_or_else(|| default_pix_fmt.to_string())
        .trim()
        .to_string();

    if pix_fmt.is_empty() {
        return Err("encoding.pix_fmt cannot be empty".to_string());
    }

    Ok(ResolvedVideoEncodingOptions {
        fps,
        codec,
        preset,
        crf: provided.crf,
        pix_fmt,
    })
}

fn codec_supports_preset_crf(codec: &str) -> bool {
    !codec.to_ascii_lowercase().contains("videotoolbox")
}

fn format_fps(fps: f64) -> String {
    format!("{:.6}", fps)
}

fn probe_video_fps(path: &Path) -> Result<f64, String> {
    let input = path
        .to_str()
        .ok_or_else(|| "Invalid UTF-8 in input path".to_string())?;

    let ffprobe = resolve_binary_path("ffprobe")?;
    let output = Command::new(&ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=avg_frame_rate,r_frame_rate",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            input,
        ])
        .output()
        .map_err(|e| format!("ffprobe not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines().map(str::trim).filter(|l| !l.is_empty()) {
        if let Some(fps) = parse_ffprobe_rate(line) {
            if fps.is_finite() && fps > 0.0 {
                return Ok(fps);
            }
        }
    }

    Err("Unable to parse FPS from ffprobe output".to_string())
}

fn parse_ffprobe_rate(raw: &str) -> Option<f64> {
    if let Some((num_raw, den_raw)) = raw.split_once('/') {
        let num = num_raw.trim().parse::<f64>().ok()?;
        let den = den_raw.trim().parse::<f64>().ok()?;
        if den.abs() < f64::EPSILON {
            return None;
        }
        return Some(num / den);
    }

    raw.trim().parse::<f64>().ok()
}

fn validate_request(request: &ProcessVideoFileRequest) -> Result<(), String> {
    if request.input_path.trim().is_empty() {
        return Err("input_path cannot be empty".to_string());
    }
    if request.output_path.trim().is_empty() {
        return Err("output_path cannot be empty".to_string());
    }
    if request.layers.is_empty() {
        return Err("layers cannot be empty".to_string());
    }

    if let Some(tracks) = &request.tracks {
        for track in tracks {
            if track.end_frame < track.start_frame {
                return Err(format!(
                    "Animation track '{}' has invalid range: start_frame={} end_frame={}",
                    track.id, track.start_frame, track.end_frame
                ));
            }
        }
    }

    if let Some(encoding) = &request.encoding {
        if let Some(fps) = encoding.fps {
            if !fps.is_finite() || fps <= 0.0 {
                return Err(format!("encoding.fps must be > 0, got {fps}"));
            }
        }

        if let Some(crf) = encoding.crf {
            if crf > 51 {
                return Err("encoding.crf must be in range 0..=51".to_string());
            }
        }
    }

    Ok(())
}

fn validate_still_animation_file_request(
    request: &ProcessStillAnimationFileRequest,
) -> Result<(), String> {
    if request.output_path.trim().is_empty() {
        return Err("output_path cannot be empty".to_string());
    }

    if request.width == 0 || request.height == 0 {
        return Err("width/height must be > 0".to_string());
    }

    if request.frame_count == 0 {
        return Err("frame_count must be > 0".to_string());
    }

    if request.layers.is_empty() {
        return Err("layers cannot be empty".to_string());
    }

    let expected_len = (request.width as usize)
        .checked_mul(request.height as usize)
        .and_then(|px| px.checked_mul(4))
        .ok_or_else(|| "Frame size overflow".to_string())?;

    if request.frame.len() != expected_len {
        return Err(format!(
            "Invalid RGBA frame length: got {}, expected {}",
            request.frame.len(),
            expected_len
        ));
    }

    if let Some(stride) = request.quick_stride {
        if stride == 0 {
            return Err("quick_stride must be > 0".to_string());
        }
    }

    if let Some(tracks) = &request.tracks {
        for track in tracks {
            if track.end_frame < track.start_frame {
                return Err(format!(
                    "Animation track '{}' has invalid range: start_frame={} end_frame={}",
                    track.id, track.start_frame, track.end_frame
                ));
            }
        }
    }

    if let Some(encoding) = &request.encoding {
        if let Some(fps) = encoding.fps {
            if !fps.is_finite() || fps <= 0.0 {
                return Err(format!("encoding.fps must be > 0, got {fps}"));
            }
        }

        if let Some(crf) = encoding.crf {
            if crf > 51 {
                return Err("encoding.crf must be in range 0..=51".to_string());
            }
        }
    }

    Ok(())
}

fn resolve_output_fps(
    encoding: &Option<VideoEncodingOptions>,
    mode: AnimationRenderMode,
    quick_stride: u32,
) -> Result<f64, String> {
    if let Some(opts) = encoding {
        if let Some(fps) = opts.fps {
            if !fps.is_finite() || fps <= 0.0 {
                return Err(format!("encoding.fps must be > 0, got {fps}"));
            }
            return Ok(fps);
        }
    }

    Ok(match mode {
        AnimationRenderMode::Rendered => DEFAULT_FPS,
        AnimationRenderMode::Quick => DEFAULT_FPS / quick_stride.max(1) as f64,
    })
}

fn next_job_id() -> String {
    let n = JOB_COUNTER.fetch_add(1, Ordering::Relaxed);
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("video-job-{ts}-{n}")
}

fn list_png_files_sorted(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    let read = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read frame dir {}: {e}", dir.display()))?;

    for entry in read {
        let entry = entry.map_err(|e| format!("Failed to read frame dir entry: {e}"))?;
        let path = entry.path();
        if path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("png"))
            .unwrap_or(false)
        {
            files.push(path);
        }
    }

    files.sort();
    Ok(files)
}

fn read_png_rgba(path: &Path) -> Result<(u32, u32, Vec<u8>), String> {
    let img = image::open(path)
        .map_err(|e| format!("Failed to open image {}: {e}", path.display()))?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    Ok((w, h, rgba.into_raw()))
}

fn write_png_rgba(path: &Path, width: u32, height: u32, rgba: &[u8]) -> Result<(), String> {
    let expected_len = (width as usize)
        .checked_mul(height as usize)
        .and_then(|px| px.checked_mul(4))
        .ok_or_else(|| format!("Invalid frame dimensions {}x{}", width, height))?;

    if rgba.len() != expected_len {
        return Err(format!(
            "Invalid RGBA buffer for {}x{}: got {}, expected {}",
            width,
            height,
            rgba.len(),
            expected_len
        ));
    }

    let file = fs::File::create(path)
        .map_err(|e| format!("Failed to create image {}: {e}", path.display()))?;
    let writer = BufWriter::new(file);
    let encoder = PngEncoder::new_with_quality(writer, CompressionType::Fast, FilterType::NoFilter);

    encoder
        .write_image(rgba, width, height, image::ExtendedColorType::Rgba8)
        .map_err(|e| format!("Failed to save image {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn request_validation_works() {
        let bad = ProcessVideoFileRequest {
            input_path: "".to_string(),
            output_path: "out.mp4".to_string(),
            layers: vec![],
            temporal: None,
            tracks: None,
            keep_audio: None,
            encoding: None,
        };
        assert!(validate_request(&bad).is_err());
    }

    #[test]
    fn still_animation_validation_works() {
        let bad = ProcessStillAnimationFileRequest {
            output_path: "".to_string(),
            width: 4,
            height: 4,
            frame: vec![0; 4 * 4 * 4],
            frame_count: 12,
            layers: vec![EffectLayer {
                id: "layer-1".to_string(),
                algorithm: "Bayer 2x2".to_string(),
                enabled: true,
                intensity: 50.0,
                blend_mode: None,
                opacity: None,
                palette_name: Some("Grayscale".to_string()),
                palette: None,
                contrast: None,
                brightness: None,
                saturation: None,
                pixel_size: None,
                blur: None,
                sharpness: None,
                noise: None,
                glitch_type: None,
                sort_by: None,
                masking: None,
                threshold_min: None,
                threshold_max: None,
                direction_angle: None,
                sort_length: None,
                block_size: None,
                chaos: None,
                quantization: None,
                red_shift_x: None,
                red_shift_y: None,
                green_shift_x: None,
                green_shift_y: None,
                blue_shift_x: None,
                blue_shift_y: None,
                global_rgb_shift_intensity: None,
                slice_count: None,
                max_offset: None,
                randomness: None,
                scanline_thickness: None,
                scanline_gap: None,
                flicker: None,
                curvature: None,
                snap_to_palette: None,
                palette_mix: None,
                global_seed: None,
            }],
            temporal: None,
            tracks: None,
            mode: None,
            quick_stride: None,
            encoding: None,
        };

        assert!(validate_still_animation_file_request(&bad).is_err());
    }

    #[test]
    fn parse_ffprobe_fraction_rate() {
        let fps = parse_ffprobe_rate("30000/1001").unwrap();
        assert!((fps - 29.970).abs() < 0.01);
    }

    #[test]
    fn resolve_encoding_uses_defaults() {
        let resolved = resolve_encoding_options(None, 23.976).unwrap();
        assert!((resolved.fps - 23.976).abs() < 0.0001);
        if cfg!(target_os = "macos") {
            assert_eq!(resolved.codec, "h264_videotoolbox");
            assert_eq!(resolved.pix_fmt, "nv12");
        } else {
            assert_eq!(resolved.codec, "libx264");
            assert_eq!(resolved.pix_fmt, "yuv420p");
        }
    }

    #[test]
    fn list_png_sorted_is_stable() {
        let root = std::env::temp_dir().join(format!(
            "dyuki-test-png-list-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&root).unwrap();

        fs::write(root.join("frame_000002.png"), b"x").unwrap();
        fs::write(root.join("frame_000001.png"), b"x").unwrap();

        let files = list_png_files_sorted(&root).unwrap();
        assert!(files[0].to_string_lossy().ends_with("frame_000001.png"));
        assert!(files[1].to_string_lossy().ends_with("frame_000002.png"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn next_job_id_is_non_empty() {
        let id = next_job_id();
        assert!(!id.is_empty());
    }

    #[test]
    #[ignore = "manual benchmark"]
    fn benchmark_90s_video_job_release_path() {
        let workspace_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("workspace root")
            .to_path_buf();
        let input_path = workspace_root.join("downloads/video-benchmark-90s.mp4");
        assert!(
            input_path.is_file(),
            "Benchmark clip not found: {}",
            input_path.display()
        );

        let output_path = std::env::temp_dir().join(format!(
            "dyuki-bench-90s-{}.mp4",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        ));

        let request = ProcessVideoFileRequest {
            input_path: input_path.to_string_lossy().to_string(),
            output_path: output_path.to_string_lossy().to_string(),
            layers: vec![EffectLayer {
                id: "bench-layer-1".to_string(),
                algorithm: "Bayer 2x2".to_string(),
                enabled: true,
                intensity: 72.0,
                blend_mode: None,
                opacity: None,
                palette_name: Some("Grayscale".to_string()),
                palette: None,
                contrast: None,
                brightness: None,
                saturation: None,
                pixel_size: None,
                blur: None,
                sharpness: None,
                noise: None,
                glitch_type: None,
                sort_by: None,
                masking: None,
                threshold_min: None,
                threshold_max: None,
                direction_angle: None,
                sort_length: None,
                block_size: None,
                chaos: None,
                quantization: None,
                red_shift_x: None,
                red_shift_y: None,
                green_shift_x: None,
                green_shift_y: None,
                blue_shift_x: None,
                blue_shift_y: None,
                global_rgb_shift_intensity: None,
                slice_count: None,
                max_offset: None,
                randomness: None,
                scanline_thickness: None,
                scanline_gap: None,
                flicker: None,
                curvature: None,
                snap_to_palette: None,
                palette_mix: None,
                global_seed: None,
            }],
            temporal: None,
            tracks: None,
            keep_audio: Some(true),
            encoding: Some(VideoEncodingOptions {
                fps: None,
                codec: None,
                preset: None,
                crf: None,
                pix_fmt: None,
            }),
        };

        let meta = probe_video_file_metadata(
            input_path
                .to_str()
                .expect("utf8 path"),
        )
        .expect("probe metadata should succeed");

        let started = Instant::now();
        let job_id = start_video_file_job(request).expect("job should start");

        loop {
            let progress = get_video_job_progress(&job_id).expect("progress should exist");
            match progress.status {
                VideoJobStatus::Completed => break,
                VideoJobStatus::Failed => {
                    panic!(
                        "Benchmark job failed at {}/{}: {}",
                        progress.current_frame,
                        progress.total_frames,
                        progress.message.unwrap_or_else(|| "unknown error".to_string())
                    );
                }
                VideoJobStatus::Cancelled => {
                    panic!("Benchmark job was unexpectedly cancelled");
                }
                VideoJobStatus::Queued | VideoJobStatus::Running => {
                    std::thread::sleep(Duration::from_millis(500));
                }
            }
        }

        let elapsed = started.elapsed();
        let elapsed_secs = elapsed.as_secs_f64().max(0.001);
        let realtime_factor = meta.duration_seconds / elapsed_secs;

        println!(
            "BENCHMARK_90S_RESULT elapsed_s={:.3} clip_s={:.3} realtime_factor={:.3} output={}",
            elapsed_secs,
            meta.duration_seconds,
            realtime_factor,
            output_path.display()
        );

        assert!(output_path.is_file(), "Expected output file at {}", output_path.display());

        let _ = fs::remove_file(output_path);
    }
}
