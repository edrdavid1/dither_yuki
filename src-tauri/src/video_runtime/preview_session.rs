use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStderr, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;

use dashmap::DashMap;

use super::decode::{effective_preview_scale, preview_dimensions};
use super::types::{
    VideoFrameRequestV1,
    VideoPreviewSessionRequestV1,
    VideoPreviewSessionResponseV1,
    VideoTransportMode,
};
use crate::video_processing::{
    build_video_proxy,
    check_ffmpeg_presence,
    probe_video_file_metadata,
    resolve_media_binary_path,
};

#[derive(Debug, Clone)]
pub struct DecodedPreviewFrame {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

struct PreviewSession {
    source_path: PathBuf,
    active_path: PathBuf,
    proxy_path: Option<PathBuf>,
    source_width: u32,
    source_height: u32,
    preview_width: u32,
    preview_height: u32,
    fps: f64,
    proxy_mode: bool,
    child: Option<Child>,
    stdout: Option<BufReader<ChildStdout>>,
    current_frame: Option<usize>,
    duration_seconds: f64,
    estimated_frame_count: u64,
}

#[derive(Debug, Clone)]
struct SeekPreviewSnapshot {
    active_path: PathBuf,
    fps: f64,
    preview_width: u32,
    preview_height: u32,
}

static PREVIEW_SESSIONS: OnceLock<DashMap<String, Arc<Mutex<PreviewSession>>>> = OnceLock::new();

fn preview_sessions() -> &'static DashMap<String, Arc<Mutex<PreviewSession>>> {
    PREVIEW_SESSIONS.get_or_init(DashMap::new)
}

fn probe_input_pix_fmt(input_path: &Path) -> Result<String, String> {
    let ffprobe = resolve_media_binary_path("ffprobe")?;
    let input = input_path
        .to_str()
        .ok_or_else(|| format!("Invalid UTF-8 in input path: {}", input_path.display()))?;

    let output = Command::new(&ffprobe)
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=pix_fmt",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            input,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe for pix_fmt: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe pix_fmt probe failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let pix_fmt = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if pix_fmt.is_empty() {
        return Err("ffprobe returned empty pix_fmt".to_string());
    }

    Ok(pix_fmt)
}

fn sanitize_proxy_dimension(value: u32) -> Option<u32> {
    if value < 2 {
        None
    } else if value % 2 == 0 {
        Some(value)
    } else {
        Some(value - 1)
    }
}

fn compute_proxy_dimensions(width: u32, height: u32) -> Option<(u32, u32)> {
    let scale = effective_preview_scale(Some("fast"), Some(0.25));
    let (raw_width, raw_height) = preview_dimensions(width, height, scale);
    let proxy_width = sanitize_proxy_dimension(raw_width)?;
    let proxy_height = sanitize_proxy_dimension(raw_height)?;

    if proxy_width >= width && proxy_height >= height {
        return None;
    }

    Some((proxy_width, proxy_height))
}

fn hash_proxy_path(source_path: &Path, preview_width: u32, preview_height: u32) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    source_path.to_string_lossy().hash(&mut hasher);
    preview_width.hash(&mut hasher);
    preview_height.hash(&mut hasher);

    if let Ok(metadata) = fs::metadata(source_path) {
        metadata.len().hash(&mut hasher);
        if let Ok(modified) = metadata.modified() {
            if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                duration.as_secs().hash(&mut hasher);
                duration.subsec_nanos().hash(&mut hasher);
            }
        }
    }

    let hash = hasher.finish();
    let stem = source_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("video")
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '-' })
        .collect::<String>();

    std::env::temp_dir()
        .join("dither-yuki-preview-proxies")
        .join(format!("{}-{}x{}-{:016x}.mp4", stem.trim_matches('-'), preview_width, preview_height, hash))
}

fn spawn_preview_stderr_logger(context: String, stderr: ChildStderr) {
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    let lowered = trimmed.to_ascii_lowercase();
                    if lowered.contains("invalid nal unit")
                        || lowered.contains("missing picture")
                        || lowered.contains("unexpectedeof")
                        || lowered.contains("corrupt")
                        || lowered.contains("error")
                    {
                        log::warn!("[preview_session] {} ffmpeg stderr: {}", context, trimmed);
                    } else {
                        log::debug!("[preview_session] {} ffmpeg stderr: {}", context, trimmed);
                    }
                }
                Err(error) => {
                    log::warn!("[preview_session] {} failed to read ffmpeg stderr: {}", context, error);
                    break;
                }
            }
        }
    });
}

fn probe_preview_source(input_path: &Path, width: u32, height: u32, fps: f64) -> Result<(u32, u32, f64, f64, u64), String> {
    if width > 0 && height > 0 && fps > 0.0 {
        // Still probe for duration if missing
        let metadata = probe_video_file_metadata(
            input_path
                .to_str()
                .ok_or_else(|| format!("Invalid UTF-8 in preview input path: {}", input_path.display()))?,
        )?;
        return Ok((width, height, fps, metadata.duration_seconds, metadata.estimated_frame_count));
    }

    let metadata = probe_video_file_metadata(
        input_path
            .to_str()
            .ok_or_else(|| format!("Invalid UTF-8 in preview input path: {}", input_path.display()))?,
    )?;

    let resolved_width = if width > 0 { width } else { metadata.width };
    let resolved_height = if height > 0 { height } else { metadata.height };
    let resolved_fps = if fps > 0.0 { fps } else { metadata.fps };

    Ok((
        resolved_width.max(1),
        resolved_height.max(1),
        resolved_fps.max(0.000_001),
        metadata.duration_seconds,
        metadata.estimated_frame_count,
    ))
}

fn build_preview_session(
    video_id: &str,
    input_path: &str,
    fps: f64,
    width: u32,
    height: u32,
) -> Result<PreviewSession, String> {
    check_ffmpeg_presence()?;

    let source_path = PathBuf::from(input_path.trim());
    if !source_path.is_file() {
        return Err(format!("Input file does not exist: {}", source_path.display()));
    }

    let (source_width, source_height, source_fps, duration_seconds, estimated_frame_count) = 
        probe_preview_source(&source_path, width, height, fps)?;
    
    // Skip proxy creation - decode scaling is more reliable
    let (preview_width, preview_height, proxy_path, active_path, proxy_mode) =
        (
            source_width,
            source_height,
            None,
            source_path.clone(),
            false,
        );

    Ok(PreviewSession {
        source_path,
        active_path,
        proxy_path,
        source_width,
        source_height,
        preview_width,
        preview_height,
        fps: source_fps,
        proxy_mode,
        child: None,
        stdout: None,
        current_frame: None,
        duration_seconds,
        estimated_frame_count,
    })
}

fn ensure_preview_session_handle(
    video_id: &str,
    input_path: Option<&str>,
    fps: Option<f64>,
    width: u32,
    height: u32,
) -> Result<Arc<Mutex<PreviewSession>>, String> {
    if let Some(entry) = preview_sessions().get(video_id) {
        let handle: Arc<Mutex<PreviewSession>> = Arc::clone(entry.value());
        drop(entry);

        let needs_refresh = {
            let session = handle
                .lock()
                .map_err(|_| "Preview session lock poisoned".to_string())?;
            session.needs_refresh(input_path, fps, width, height)
        };

        if !needs_refresh {
            return Ok(handle);
        }
    }

    let input_path = input_path.ok_or_else(|| {
        format!("input_path is required to prepare preview session for {video_id}")
    })?;

    let handle = Arc::new(Mutex::new(build_preview_session(
        video_id,
        input_path,
        fps.unwrap_or(0.0),
        width,
        height,
    )?));

    preview_sessions().insert(video_id.to_string(), Arc::clone(&handle));
    Ok(handle)
}

impl PreviewSession {
    fn needs_refresh(
        &self,
        input_path: Option<&str>,
        fps: Option<f64>,
        width: u32,
        height: u32,
    ) -> bool {
        let Some(input_path) = input_path else {
            return false;
        };

        let trimmed = input_path.trim();
        let expected_path = Path::new(trimmed);
        if expected_path != self.source_path.as_path() {
            return true;
        }

        if width > 0 && width != self.source_width {
            return true;
        }

        if height > 0 && height != self.source_height {
            return true;
        }

        if let Some(fps) = fps {
            if fps > 0.0 && (fps - self.fps).abs() > 0.001 {
                return true;
            }
        }

        false
    }

    fn info(&self, video_id: &str) -> VideoPreviewSessionResponseV1 {
        VideoPreviewSessionResponseV1 {
            version: 1,
            video_id: video_id.to_string(),
            input_path: self.source_path.to_string_lossy().to_string(),
            active_path: self.active_path.to_string_lossy().to_string(),
            preview_path: self.proxy_path.as_ref().map(|path| path.to_string_lossy().to_string()),
            preview_width: self.preview_width,
            preview_height: self.preview_height,
            proxy_mode: self.proxy_mode,
            duration_seconds: self.duration_seconds,
            estimated_frame_count: self.estimated_frame_count,
        }
    }

    fn seek_snapshot_for(&self, frame_index: usize) -> Option<SeekPreviewSnapshot> {
        let current = self.current_frame?;
        if frame_index > current && frame_index <= current.saturating_add(10) {
            return None;
        }

        Some(SeekPreviewSnapshot {
            active_path: self.active_path.clone(),
            fps: self.fps,
            preview_width: self.preview_width,
            preview_height: self.preview_height,
        })
    }

    fn shutdown(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.stdout = None;
        self.current_frame = None;
    }

    fn spawn_decoder(&mut self, frame_index: usize) -> Result<(), String> {
        let ffmpeg = resolve_media_binary_path("ffmpeg")?;
        let timestamp = if self.fps > 0.0 {
            frame_index as f64 / self.fps
        } else {
            0.0
        };
        let timestamp = format!("{timestamp:.6}");
        let vf_filter = format!(
            "format=rgba,scale={}:{}:flags=lanczos",
            self.preview_width,
            self.preview_height
        );
        let input = self
            .active_path
            .to_str()
            .ok_or_else(|| format!("Invalid UTF-8 in preview source path: {}", self.active_path.display()))?;

        match probe_input_pix_fmt(&self.active_path) {
            Ok(pix_fmt) => println!("pix_fmt = {}", pix_fmt),
            Err(error) => log::warn!(
                "[preview_session] failed to probe input pix_fmt for {}: {}",
                self.active_path.display(),
                error
            ),
        }

        let mut child = Command::new(&ffmpeg)
            .args([
                "-hide_banner",
                "-loglevel", "warning",
                "-ss", &timestamp,
                "-accurate_seek",
                "-i", input,
                "-fflags", "+genpts+discardcorrupt+nobuffer",
                "-flags", "+low_delay",
                "-an", "-sn", "-dn",
                "-vf", &vf_filter,
                "-f", "rawvideo",
                "-pix_fmt", "rgba",
                "pipe:1",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Failed to start preview decoder: {error}"))?;

        if let Some(stderr) = child.stderr.take() {
            spawn_preview_stderr_logger(self.active_path.display().to_string(), stderr);
        }

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Preview decoder stdout is unavailable".to_string())?;

        self.child = Some(child);
        self.stdout = Some(BufReader::new(stdout));
        self.current_frame = None;
        Ok(())
    }

    fn restart_decoder(&mut self, frame_index: usize) -> Result<(), String> {
        self.shutdown();
        self.spawn_decoder(frame_index)
    }

    fn read_frame_bytes(&mut self) -> Result<Vec<u8>, String> {
        let expected_len = (self.preview_width as usize)
            .checked_mul(self.preview_height as usize)
            .and_then(|pixels| pixels.checked_mul(4))
            .ok_or_else(|| "Preview frame dimensions overflow".to_string())?;

        let stdout = self
            .stdout
            .as_mut()
            .ok_or_else(|| "Preview decoder stdout is not available".to_string())?;

        let mut bytes = vec![0u8; expected_len];
        stdout
            .read_exact(&mut bytes)
            .map_err(|error| format!("Failed to read preview frame bytes: {error}"))?;
        Ok(bytes)
    }

    fn decode_frame(&mut self, frame_index: usize) -> Result<DecodedPreviewFrame, String> {
        let mut should_restart = false;

        if let Some(current) = self.current_frame {
            if frame_index > current && frame_index <= current + 10 {
                let frames_to_skip = frame_index - current - 1;
                for _ in 0..frames_to_skip {
                    if self.read_frame_bytes().is_err() {
                        should_restart = true;
                        break;
                    }
                }
                if !should_restart {
                    self.current_frame = Some(frame_index - 1);
                }
            } else if frame_index != current + 1 {
                should_restart = true;
            }
        } else {
            should_restart = true;
        }

        if should_restart {
            self.restart_decoder(frame_index)?;
        }

        match self.read_frame_bytes() {
            Ok(rgba) => {
                self.current_frame = Some(frame_index);
                Ok(DecodedPreviewFrame {
                    width: self.preview_width,
                    height: self.preview_height,
                    rgba,
                })
            }
            Err(first_error) => {
                self.restart_decoder(frame_index)?;
                let rgba = self.read_frame_bytes().map_err(|second_error| {
                    format!("{first_error}; retry also failed: {second_error}")
                })?;
                self.current_frame = Some(frame_index);
                Ok(DecodedPreviewFrame {
                    width: self.preview_width,
                    height: self.preview_height,
                    rgba,
                })
            }
        }
    }
}

impl Drop for PreviewSession {
    fn drop(&mut self) {
        self.shutdown();
    }
}

pub fn prepare_preview_session(
    request: VideoPreviewSessionRequestV1,
) -> Result<VideoPreviewSessionResponseV1, String> {
    let session = ensure_preview_session_handle(
        &request.video_id,
        Some(request.input_path.as_str()),
        Some(request.fps),
        request.width,
        request.height,
    )?;
    let session = session
        .lock()
        .map_err(|_| "Preview session lock poisoned".to_string())?;
    Ok(session.info(&request.video_id))
}

pub fn release_preview_session(video_id: &str) -> Result<(), String> {
    if let Some((_, session)) = preview_sessions().remove(video_id) {
        if let Ok(mut session) = session.lock() {
            session.shutdown();
        }
    }

    Ok(())
}

pub fn preview_input_path(video_id: &str) -> Option<String> {
    let entry = preview_sessions().get(video_id)?;
    let handle: Arc<Mutex<PreviewSession>> = Arc::clone(entry.value());
    drop(entry);
    let session = handle.lock().ok()?;
    Some(session.active_path.to_string_lossy().to_string())
}

pub fn decode_fast_preview(
    request: &VideoFrameRequestV1,
) -> Result<DecodedPreviewFrame, String> {
    let input_path = request
        .input_path
        .as_deref()
        .ok_or_else(|| "input_path is required for preview decoding".to_string())?;

    let session = ensure_preview_session_handle(
        &request.video_id,
        Some(input_path),
        request.fps,
        request.width,
        request.height,
    )?;

    if matches!(request.transport_mode, Some(VideoTransportMode::Scrub)) {
        let seek_snapshot = {
            let session = session
                .lock()
                .map_err(|_| "Preview session lock poisoned".to_string())?;
            session.seek_snapshot_for(request.frame_index)
        };

        if let Some(snapshot) = seek_snapshot {
            match decode_seek_preview_frame(&snapshot, request.frame_index) {
                Ok(frame) => return Ok(frame),
                Err(error) => {
                    log::warn!(
                        "[preview_session] seek decoder failed for {} @ frame {}: {}",
                        request.video_id,
                        request.frame_index,
                        error
                    );
                }
            }
        }
    }

    let mut session = session
        .lock()
        .map_err(|_| "Preview session lock poisoned".to_string())?;
    session.decode_frame(request.frame_index)
}

fn decode_seek_preview_frame(
    snapshot: &SeekPreviewSnapshot,
    frame_index: usize,
) -> Result<DecodedPreviewFrame, String> {
    check_ffmpeg_presence()?;

    let ffmpeg = resolve_media_binary_path("ffmpeg")?;
    let timestamp = if snapshot.fps > 0.0 {
        frame_index as f64 / snapshot.fps
    } else {
        0.0
    };
    let vf_filter = format!(
        "format=rgba,scale={}:{}:flags=lanczos",
        snapshot.preview_width,
        snapshot.preview_height
    );

    let input = snapshot
        .active_path
        .to_str()
        .ok_or_else(|| format!("Invalid UTF-8 in preview source path: {}", snapshot.active_path.display()))?;

    match probe_input_pix_fmt(&snapshot.active_path) {
        Ok(pix_fmt) => println!("pix_fmt = {}", pix_fmt),
        Err(error) => log::warn!(
            "[preview_session] failed to probe seek input pix_fmt for {}: {}",
            snapshot.active_path.display(),
            error
        ),
    }

    let output = Command::new(&ffmpeg)
        .args([
            "-hide_banner",
            "-loglevel",
            "info",
            "-hwaccel",
            "none",
            "-flags2",
            "+export_mvs",
            "-fflags",
            "+genpts+discardcorrupt",
            "-avoid_negative_ts",
            "make_zero",
            "-flags",
            "+low_delay",
            "-analyzeduration",
            "10M",
            "-probesize",
            "10M",
            "-ss",
            &format!("{timestamp:.6}"),
            "-thread_queue_size",
            "4096",
            "-i",
            input,
            "-an",
            "-sn",
            "-dn",
            "-vsync",
            "0",
            "-vf",
            &vf_filter,
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgba",
            "-flush_packets",
            "1",
            "-",
        ])
        .output()
        .map_err(|error| format!("Failed to run preview seek decoder: {error}"))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Preview seek decoder failed: {err}"));
    }

    let expected_len = (snapshot.preview_width as usize)
        .checked_mul(snapshot.preview_height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| "Preview frame dimensions overflow".to_string())?;

    if output.stdout.len() != expected_len {
        return Err(format!(
            "Preview seek decoder size mismatch: got {}, expected {}",
            output.stdout.len(),
            expected_len
        ));
    }

    Ok(DecodedPreviewFrame {
        width: snapshot.preview_width,
        height: snapshot.preview_height,
        rgba: output.stdout,
    })
}
