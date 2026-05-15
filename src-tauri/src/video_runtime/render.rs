use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

use rayon::prelude::*;

use crate::image_engine::{
    process_single_video_frame_with_animation, prepare_video_layers,
    TemporalVariationConfig, AnimationTrack,
};
use crate::video_processing::{
    encode_video_from_png, probe_video_fps,
    VideoEncodingOptions, resolve_encoding_options, list_png_files_sorted,
    read_png_rgba, write_png_rgba, DEFAULT_FPS,
    check_ffmpeg_presence, check_ffprobe_presence, resolve_media_binary_path,
};

use super::job::VideoJobService;
use super::types::VideoRenderJobRequestV1;
use super::layer_tracks::apply_layer_tracks;

/// Run real video render job with v2 job tracking
pub fn run_video_render_job_v2(
    service: &VideoJobService,
    job_id: &str,
    request: VideoRenderJobRequestV1,
) -> Result<(), String> {
    check_ffmpeg_presence()?;
    check_ffprobe_presence()?;
    // Get input/output paths from request
    let input_path = request
        .input_path
        .as_ref()
        .ok_or("input_path is required for v2 render")?;
    let output_path = request
        .output_path
        .as_ref()
        .ok_or("output_path is required for v2 render")?;

    let input_path = PathBuf::from(input_path);
    let output_path = PathBuf::from(output_path);

    if !input_path.is_file() {
        return Err(format!("Input file does not exist: {}", input_path.display()));
    }

    // Create output directory if needed
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output dir {}: {e}", parent.display()))?;
    }

    // Create temp directories
    let temp_root = std::env::temp_dir().join(format!("dyuki-v2-{}", job_id));
    let input_frames_dir = temp_root.join("input_frames");
    let output_frames_dir = temp_root.join("output_frames");
    
    fs::create_dir_all(&input_frames_dir)
        .map_err(|e| format!("Failed to create temp input frames dir: {e}"))?;
    fs::create_dir_all(&output_frames_dir)
        .map_err(|e| format!("Failed to create temp output frames dir: {e}"))?;

    // Update progress: extracting frames
    let _ = service.update_progress(job_id, 0);

    // Check cancellation
    if is_job_cancelled(service, job_id) {
        let _ = fs::remove_dir_all(&temp_root);
        return Ok(());
    }

    // Extract frames
    let _total_frames = extract_frames_to_png_with_fps(job_id, &input_path, &input_frames_dir, request.fps)?;

    if is_job_cancelled(service, job_id) {
        let _ = fs::remove_dir_all(&temp_root);
        return Ok(());
    }

    // Get frame files
    let frame_files = list_png_files_sorted(&input_frames_dir)?;
    if frame_files.is_empty() {
        let _ = fs::remove_dir_all(&temp_root);
        return Err("No frames extracted from input video".to_string());
    }

    let first = read_png_rgba(&frame_files[0])?;
    let width = first.0;
    let height = first.1;

    // Prepare layers and tracks
    let layers = request.layers.clone().unwrap_or_default();
    let tracks = request.tracks.as_ref().map(|t| t.as_slice()).unwrap_or(&[]);
    let temporal = TemporalVariationConfig::default();
    let anim_tracks: Vec<AnimationTrack> = vec![]; // These are different from LayerTracks

    // Resolve encoding options
    let source_fps = probe_video_fps(&input_path).unwrap_or(DEFAULT_FPS);
    let encoding_opts = VideoEncodingOptions {
        fps: Some(request.fps),
        codec: None,
        preset: None,
        crf: None,
        pix_fmt: None,
    };
    let encoding = resolve_encoding_options(Some(encoding_opts), source_fps)?;

    // Update total frames in job
    {
        let mut guard = service.jobs.lock().map_err(|_| "Lock poisoned")?;
        if let Some(job) = guard.get_mut(job_id) {
            job.total_frames = frame_files.len();
        }
    }

    // Process frames in parallel
    let completed = AtomicUsize::new(0);
    let total = frame_files.len();

    let result: Result<(), String> = frame_files
        .par_iter()
        .enumerate()
        .try_for_each(|(index, in_path)| {
            // Check cancellation
            if is_job_cancelled(service, job_id) {
                return Err("Video processing cancelled".to_string());
            }

            let (w, h, data) = read_png_rgba(in_path)?;
            if w != width || h != height {
                return Err(format!(
                    "Frame dimensions mismatch: got {}x{}, expected {}x{}",
                    w, h, width, height
                ));
            }

            // Apply Layer Tracks to get specific layer setup for this frame
            let frame_layers = apply_layer_tracks(&layers, tracks, index);
            let prepared_frame_layers = prepare_video_layers(&frame_layers)?;

            // Process frame with layers
            let processed = process_single_video_frame_with_animation(
                width,
                height,
                &data,
                &prepared_frame_layers,
                &temporal,
                &anim_tracks,
                index as u32,
                total as u32,
            )?;

            // Write output frame
            let out_path = output_frames_dir.join(format!("frame_{:06}.png", index + 1));
            write_png_rgba(&out_path, width, height, &processed)?;

            // Update progress every 8 frames or on last
            let done = completed.fetch_add(1, Ordering::Relaxed) + 1;
            if done == total || done % 8 == 0 {
                let _ = service.update_progress(job_id, done);
            }

            Ok(())
        });

    // Handle processing result
    match result {
        Ok(_) => {
            if is_job_cancelled(service, job_id) {
                let _ = fs::remove_dir_all(&temp_root);
                return Ok(());
            }

            // Update progress to full
            let _ = service.update_progress(job_id, total);

            // Encode video
            let keep_audio = request.keep_audio.unwrap_or(true);
            if let Err(err) = encode_video_from_png(
                job_id,
                &input_path,
                &output_frames_dir,
                &output_path,
                keep_audio,
                &encoding,
            ) {
                let _ = fs::remove_dir_all(&temp_root);
                return Err(err);
            }

            // Update output path in job
            {
                let mut guard = service.jobs.lock().map_err(|_| "Lock poisoned")?;
                if let Some(job) = guard.get_mut(job_id) {
                    job.output_path = Some(output_path.to_string_lossy().to_string());
                }
            }
        }
        Err(e) => {
            let _ = fs::remove_dir_all(&temp_root);
            return Err(e);
        }
    }

    // Cleanup
    let _ = fs::remove_dir_all(&temp_root);

    Ok(())
}

fn is_job_cancelled(service: &VideoJobService, job_id: &str) -> bool {
    match service.jobs.lock() {
        Ok(guard) => {
            if let Some(job) = guard.get(job_id) {
                job.status == "cancelled"
            } else {
                false
            }
        }
        Err(_) => false,
    }
}

/// Extract frames with optional FPS limit
fn extract_frames_to_png_with_fps(
    _job_id: &str,
    input_path: &PathBuf,
    output_dir: &PathBuf,
    target_fps: f64,
) -> Result<usize, String> {
    check_ffmpeg_presence()?;
    // Use ffmpeg to extract frames at target FPS
    let probe_fps = probe_video_fps(input_path).unwrap_or(DEFAULT_FPS);

    // Only downsample when the target FPS is below the source FPS.
    // When target_fps is equal/higher, leave the source timing alone instead of
    // emitting an invalid filter expression like `fps=fps`.
    let vf_filter = (target_fps < probe_fps)
        .then(|| format!("fps={:.6}", target_fps));

    let output_pattern = output_dir.join("frame_%06d.png");
    let ffmpeg = resolve_media_binary_path("ffmpeg")?;

    let mut cmd = std::process::Command::new(&ffmpeg);
    cmd.arg("-y")
        .arg("-i")
        .arg(input_path)
        .arg("-pix_fmt")
        .arg("rgba");

    if let Some(vf_filter) = vf_filter.as_deref() {
        cmd.arg("-vf").arg(vf_filter);
    }

    cmd.arg(&output_pattern);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run ffmpeg ({}): {e}", ffmpeg.display()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg failed: {}", stderr));
    }

    // Count extracted frames
    let entries = fs::read_dir(output_dir)
        .map_err(|e| format!("Failed to read output dir: {e}"))?;
    
    let count = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "png")
                .unwrap_or(false)
        })
        .count();

    Ok(count)
}
