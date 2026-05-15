use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStderr, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

use crossbeam_queue::ArrayQueue;

use crate::video_processing::resolve_media_binary_path;

pub struct RawFrame {
    pub pts: f64,
    pub width: u32,
    pub height: u32,
    pub signature: u64,
    pub rgba: Vec<u8>,
}

pub fn frame_signature(bytes: &[u8]) -> u64 {
    // Lightweight sampled hash for runtime diagnostics (not cryptographic).
    let len = bytes.len();
    if len == 0 {
        return 0;
    }

    let mut hash: u64 = 0xcbf29ce484222325;
    let step = (len / 64).max(1);
    let mut i = 0usize;
    while i < len {
        hash ^= bytes[i] as u64;
        hash = hash.wrapping_mul(0x100000001b3);
        i = i.saturating_add(step);
    }

    // Mix edge bytes + length to reduce collisions for mostly-flat frames.
    for &b in bytes.iter().take(8) {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    for &b in bytes.iter().rev().take(8) {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash ^ (len as u64)
}

fn kill_and_reap_ffmpeg(video_id: &str, child: &mut std::process::Child, reason: &str) {
    if let Err(err) = child.kill() {
        log::warn!(
            "[playback_stream] {} failed to kill ffmpeg process during {}: {}",
            video_id,
            reason,
            err
        );
    }

    match child.wait() {
        Ok(status) => {
            log::info!(
                "[playback_stream] {} ffmpeg process reaped during {} with status {}",
                video_id,
                reason,
                status
            );
        }
        Err(err) => {
            log::warn!(
                "[playback_stream] {} failed to reap ffmpeg process during {}: {}",
                video_id,
                reason,
                err
            );
        }
    }
}

fn spawn_ffmpeg_stderr_logger(
    video_id: String,
    stderr: ChildStderr,
    decoder_last_error: Arc<Mutex<Option<String>>>,
    decoder_had_errors: Arc<AtomicBool>,
) {
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    decoder_had_errors.store(true, Ordering::Relaxed);
                    if let Ok(mut slot) = decoder_last_error.lock() {
                        *slot = Some(trimmed.to_string());
                    }

                    let lowered = trimmed.to_ascii_lowercase();
                    if lowered.contains("invalid nal unit")
                        || lowered.contains("missing picture")
                        || lowered.contains("unexpectedeof")
                        || lowered.contains("corrupt")
                        || lowered.contains("error")
                    {
                        log::warn!("[playback_stream] {} ffmpeg stderr: {}", video_id, trimmed);
                    } else {
                        log::debug!("[playback_stream] {} ffmpeg stderr: {}", video_id, trimmed);
                    }
                }
                Err(error) => {
                    log::warn!("[playback_stream] {} failed to read ffmpeg stderr: {}", video_id, error);
                    break;
                }
            }
        }
    });
}

fn probe_input_pix_fmt(input_path: &std::path::Path) -> Result<String, String> {
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

#[derive(Debug)]
pub enum StreamControl {
    SeekTo(f64),
    Stop,
}

pub struct PlaybackStream {
    pub video_id: String,
    ring_buf: Arc<ArrayQueue<RawFrame>>,
    control_tx: mpsc::Sender<StreamControl>,
    is_buffering: Arc<AtomicBool>,
    is_warmed: Arc<AtomicBool>,
    decoder_last_error: Arc<Mutex<Option<String>>>,
    decoder_had_errors: Arc<AtomicBool>,
    pub fps: f64,
}

impl PlaybackStream {
    pub fn new(
        video_id: String,
        path: String,
        fps: f64,
        width: u32,
        height: u32,
        start_pts: f64,
        total_duration: f64,
        quality_mode: Option<&str>,
        scale: Option<f32>,
    ) -> Result<Arc<Self>, String> {
        // Calculate effective dimensions based on quality mode
        let effective_scale = super::decode::effective_preview_scale(quality_mode, scale);
        let (effective_width, effective_height) = super::decode::preview_dimensions(width, height, effective_scale);
        
        // We need a decent buffer size. 16 frames is about 0.5s at 30fps.
        let ring_buf = Arc::new(ArrayQueue::new(16));
        let (control_tx, control_rx) = mpsc::channel();
        let is_buffering = Arc::new(AtomicBool::new(true));
        let is_warmed = Arc::new(AtomicBool::new(false));
        let decoder_last_error = Arc::new(Mutex::new(None));
        let decoder_had_errors = Arc::new(AtomicBool::new(false));

        let stream = Arc::new(Self {
            video_id: video_id.clone(),
            ring_buf: Arc::clone(&ring_buf),
            control_tx,
            is_buffering: Arc::clone(&is_buffering),
            is_warmed: Arc::clone(&is_warmed),
            decoder_last_error: Arc::clone(&decoder_last_error),
            decoder_had_errors: Arc::clone(&decoder_had_errors),
            fps,
        });

        spawn_decoder_thread(
            video_id,
            path,
            fps,
            effective_width,
            effective_height,
            start_pts,
            total_duration,
            Arc::clone(&ring_buf),
            control_rx,
            Arc::clone(&is_buffering),
            Arc::clone(&is_warmed),
            Arc::clone(&decoder_last_error),
            Arc::clone(&decoder_had_errors),
        );

        Ok(stream)
    }

    /// Pop the next available frame from the ring buffer in FIFO order.
    /// Does NOT match by PTS — the caller decides what to do with the frame.
    /// Returns `None` if the buffer is empty or still buffering.
    pub fn pop_next_frame(&self) -> Option<RawFrame> {
        if self.is_buffering.load(Ordering::Relaxed) {
            let len = self.ring_buf.len();
            if len >= 2 {
                // Enough frames buffered — clear the buffering flag and proceed.
                self.is_buffering.store(false, Ordering::Relaxed);
            } else {
                return None;
            }
        }

        let frame = self.ring_buf.pop()?;

        // If the buffer is now empty, signal that we need more frames.
        if self.ring_buf.is_empty() {
            self.is_buffering.store(true, Ordering::Relaxed);
        }

        Some(frame)
    }

    pub fn pop_frame(&self, target_pts: f64) -> Option<RawFrame> {
        let len = self.ring_buf.len();
        
        if self.is_buffering.load(Ordering::Relaxed) {
            if len >= 1 {
                self.is_buffering.store(false, Ordering::Relaxed);
            } else {
                return None;
            }
        }

        // tolerance of 1.5 frames to handle jitter/dropped frames
        let tolerance = 1.5 / self.fps;

        let mut last_frame = None;

        while let Some(frame) = self.ring_buf.pop() {
            if frame.pts < target_pts - tolerance {
                // Frame is too old, discard and keep looking
                last_frame = Some(frame);
                continue;
            } else if frame.pts > target_pts + tolerance {
                // We've overshot. In a real-time stream, we should probably 
                // return the last valid frame we saw or this "too new" one.
                // But for smoothness, if we have a last_frame, it's closer.
                if let Some(prev) = last_frame {
                    return Some(prev);
                }
                return Some(frame);
            } else {
                // Perfect hit or within tolerance
                if self.ring_buf.len() == 0 {
                    self.is_buffering.store(true, Ordering::Relaxed);
                }
                return Some(frame);
            }
        }

        self.is_buffering.store(true, Ordering::Relaxed);
        None
    }

    pub fn seek(&self, pts: f64) {
        // Clear queue
        while self.ring_buf.pop().is_some() {}
        self.is_buffering.store(true, Ordering::Relaxed);
        self.is_warmed.store(false, Ordering::Relaxed);
        let _ = self.control_tx.send(StreamControl::SeekTo(pts));
    }

    pub fn wait_for_buffering(&self, timeout_ms: u64) {
        // Wait until at least 5 frames are buffered or timeout expires
        let start = std::time::Instant::now();
        let timeout = Duration::from_millis(timeout_ms);
        while self.is_buffering.load(Ordering::Relaxed) && start.elapsed() < timeout {
            thread::sleep(Duration::from_millis(10));
        }
    }

    pub fn stop(&self) {
        let _ = self.control_tx.send(StreamControl::Stop);
    }

    pub fn buffered_len(&self) -> usize {
        self.ring_buf.len()
    }

    pub fn is_warmed(&self) -> bool {
        self.is_warmed.load(Ordering::Relaxed)
    }

    pub fn has_ffmpeg_errors(&self) -> bool {
        self.decoder_had_errors.load(Ordering::Relaxed)
    }
}

impl Drop for PlaybackStream {
    fn drop(&mut self) {
        self.stop();
    }
}

fn spawn_decoder_thread(
    video_id: String,
    path: String,
    fps: f64,
    width: u32,
    height: u32,
    mut current_pts: f64,
    total_duration: f64,
    ring_buf: Arc<ArrayQueue<RawFrame>>,
    control_rx: mpsc::Receiver<StreamControl>,
    _is_buffering: Arc<AtomicBool>,
    is_warmed: Arc<AtomicBool>,
    decoder_last_error: Arc<Mutex<Option<String>>>,
    decoder_had_errors: Arc<AtomicBool>,
) {
    thread::spawn(move || {
        log::info!(
            "[playback_stream] {} decoder thread starting with resolution {}x{} (fps={:.2})",
            video_id,
            width,
            height,
            fps
        );
        
        let mut child_process: Option<std::process::Child> = None;
        let mut stdout_reader: Option<ChildStdout> = None;
        let expected_len = (width as usize) * (height as usize) * 4;
        let mut buffer = vec![0u8; expected_len];
        let mut zero_frame_retries = 0usize;
        let mut valid_frame_count = 0usize;
        let mut consecutive_decoder_failures = 0usize;
        let mut decoded_frame_count = 0usize;
        
        // Target start PTS and Priming state
        let mut target_start_pts = current_pts;
        let mut is_priming = true;
        let mut stream_start_pts = current_pts;
        
        let mut last_restart_pts = current_pts;
        let mut restart_retry_count = 0;

        // Probe the ACTUAL file duration (it might be a proxy shorter than source)
        let actual_duration = match crate::video_processing::probe_video_file_metadata(&path) {
            Ok(meta) => meta.duration_seconds,
            Err(_) => total_duration, // fallback to provided duration
        };
        let effective_duration = actual_duration.min(total_duration);

        log::info!(
            "[playback_stream] {} starting decoder thread. path={}, target_start_pts={:.3}, effective_duration={:.3}",
            video_id,
            path,
            target_start_pts,
            effective_duration
        );

        let record_decoder_error = |message: String| {
            decoder_had_errors.store(true, Ordering::Relaxed);
            if let Ok(mut slot) = decoder_last_error.lock() {
                *slot = Some(message);
            }
        };

        let mut start_ffmpeg = |pts: f64| -> Result<(Child, ChildStdout, f64), String> {
            let priming_offset = 1.0;
            let seek_pts = (pts - priming_offset).max(0.0);
            
            let ffmpeg = match crate::video_processing::resolve_media_binary_path("ffmpeg") {
                Ok(p) => p,
                Err(e) => return Err(format!("Failed to resolve ffmpeg: {}", e)),
            };
            
            // Check if file exists
            if !Path::new(&path).exists() {
                return Err(format!("Input file does not exist: {}", path));
            }
            
            let file_size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            if file_size == 0 {
                return Err(format!("Input file is empty or unreadable: {}", path));
            }
            
            log::info!(
                "[playback_stream] {} starting ffmpeg from pts {:.6} (target {:.6})",
                video_id,
                seek_pts,
                pts
            );
            
            let canonical_input_path = match std::fs::canonicalize(&path) {
                Ok(p) => p,
                Err(e) => return Err(format!("Failed to canonicalize path: {}", e)),
            };

            let vf_filter = format!("format=rgba,scale={}:{}:flags=neighbor", width, height);

            let args = vec![
                "-hide_banner".to_string(),
                "-loglevel".to_string(), "warning".to_string(),
                "-ss".to_string(), format!("{:.6}", seek_pts),
                "-i".to_string(), canonical_input_path.to_string_lossy().to_string(),
                "-r".to_string(), format!("{:.6}", fps), 
                "-fflags".to_string(), "+genpts".to_string(),
                "-an".to_string(), "-sn".to_string(), "-dn".to_string(),
                "-vf".to_string(), vf_filter,
                "-f".to_string(), "rawvideo".to_string(),
                "-pix_fmt".to_string(), "rgba".to_string(),
                "pipe:1".to_string(),
            ];

            let mut child = Command::new(&ffmpeg)
                .args(&args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to spawn ffmpeg: {}", e))?;
            
            let stdout = child.stdout.take().ok_or("Failed to take stdout")?;
            let stderr = child.stderr.take().ok_or("Failed to take stderr")?;
            
            spawn_ffmpeg_stderr_logger(video_id.to_string(), stderr, Arc::clone(&decoder_last_error), Arc::clone(&decoder_had_errors));
            
            Ok((child, stdout, seek_pts))
        };

        // Initial start
        match start_ffmpeg(current_pts) {
            Ok((child, stdout, actual_pts)) => {
                child_process = Some(child);
                stdout_reader = Some(stdout);
                stream_start_pts = actual_pts;
                current_pts = actual_pts;
            }
            Err(error) => {
                log::error!("[playback_stream] {} failed to start ffmpeg: {}", video_id, error);
                record_decoder_error(error);
            }
        }

        loop {
            // Check for control messages
            if let Ok(msg) = control_rx.try_recv() {
                match msg {
                    StreamControl::Stop => {
                        if let Some(mut child) = child_process.take() {
                            kill_and_reap_ffmpeg(&video_id, &mut child, "stop");
                        }
                        break;
                    }
                    StreamControl::SeekTo(pts) => {
                        log::info!("[playback_stream] {} seeking to pts={:.6}", video_id, pts);
                        current_pts = pts;
                        target_start_pts = pts;
                        is_priming = true;
                        decoded_frame_count = 0;
                        last_restart_pts = pts;
                        restart_retry_count = 0;
                        zero_frame_retries = 0;
                        valid_frame_count = 0;
                        is_warmed.store(false, Ordering::Relaxed);
                        // Clear remaining buffer just in case
                        while ring_buf.pop().is_some() {}
                        match start_ffmpeg(current_pts) {
                            Ok((child, stdout, actual_pts)) => {
                                child_process = Some(child);
                                stdout_reader = Some(stdout);
                                stream_start_pts = actual_pts;
                                current_pts = actual_pts;
                            }
                            Err(error) => {
                                log::error!("[playback_stream] {} failed to seek: {}", video_id, error);
                                record_decoder_error(error);
                            }
                        }
                    }
                }
            }

            // If queue is full, yield and wait for frontend to consume
            if ring_buf.is_full() {
                thread::sleep(Duration::from_millis(1));
                continue;
            }

            // Read frame
            let mut read_success = false;
            if let Some(reader) = stdout_reader.as_mut() {
                match reader.read_exact(&mut buffer) {
                    Ok(()) => {
                    read_success = true;
                    consecutive_decoder_failures = 0;
                    }
                    Err(err) => {
                        log::error!("Failed to read frame from FFmpeg: {:?}", err);
                        if let Some(child) = child_process.as_mut() {
                            match child.try_wait() {
                                Ok(Some(status)) => {
                                    log::info!(
                                        "[playback_stream] {} ffmpeg process exited with status {} at pts {:.6}",
                                        video_id,
                                        status,
                                        current_pts
                                    );

                                    // EOF handling: if we are near the end of ACTUAL file, stop.
                                    if current_pts >= effective_duration - (0.5 / fps) {
                                        log::info!("[playback_stream] {} reached EOF at pts={:.6}. Stopping.", video_id, current_pts);
                                        child_process = None;
                                        stdout_reader = None;
                                        // Wait for a seek
                                        match control_rx.recv() {
                                            Ok(StreamControl::SeekTo(pts)) => {
                                                current_pts = pts;
                                                target_start_pts = pts;
                                                is_priming = true;
                                                decoded_frame_count = 0;
                                                last_restart_pts = pts;
                                                restart_retry_count = 0;
                                                while ring_buf.pop().is_some() {}
                                                match start_ffmpeg(current_pts) {
                                                    Ok((child, stdout, actual_pts)) => {
                                                        child_process = Some(child);
                                                        stdout_reader = Some(stdout);
                                                        stream_start_pts = actual_pts;
                                                        current_pts = actual_pts;
                                                    }
                                                    Err(err) => {
                                                        log::error!("[playback_stream] {} failed to resume after EOF: {}", video_id, err);
                                                        record_decoder_error(err);
                                                    }
                                                }
                                                continue;
                                            }
                                            Ok(StreamControl::Stop) => break,
                                            Err(_) => break,
                                        }
                                    }

                                    // If we are stuck in a restart loop at the same PTS, skip forward more aggressively.
                                    if (current_pts - last_restart_pts).abs() < 0.0001 {
                                        restart_retry_count += 1;
                                        if restart_retry_count > 3 {
                                            // 1 second skip to get out of bad GOP territory
                                            log::warn!("[playback_stream] {} stuck at pts={:.6}, skipping forward 1.0s to find next I-frame", video_id, current_pts);
                                            current_pts += 1.0;
                                            stream_start_pts = current_pts;
                                            decoded_frame_count = 0;
                                            restart_retry_count = 0;
                                        }
                                    } else {
                                        last_restart_pts = current_pts;
                                        restart_retry_count = 0;
                                    }

                                    consecutive_decoder_failures = consecutive_decoder_failures.saturating_add(1);
                                    
                                    // Reader belongs to a dead process now.
                                    stdout_reader = None;
                                    child_process = None;

                                    // Bounded auto-restart with backoff to avoid log storms.
                                    let restart_backoff_ms = (consecutive_decoder_failures.min(20) as u64) * 25;
                                    if restart_backoff_ms > 0 {
                                        thread::sleep(Duration::from_millis(restart_backoff_ms));
                                    }

                                    match start_ffmpeg(current_pts) {
                                        Ok((child, stdout, actual_pts)) => {
                                            child_process = Some(child);
                                            stdout_reader = Some(stdout);
                                            stream_start_pts = actual_pts;
                                            current_pts = actual_pts;
                                            log::warn!(
                                                "[playback_stream] {} restarted ffmpeg after decode failure at pts {:.6} (attempt {})",
                                                video_id,
                                                current_pts,
                                                consecutive_decoder_failures
                                            );
                                        }
                                        Err(restart_err) => {
                                            log::error!(
                                                "[playback_stream] {} failed to restart ffmpeg at pts {:.6} after decode failure: {}",
                                                video_id,
                                                current_pts,
                                                restart_err
                                            );
                                        }
                                    }
                                }
                                Ok(None) => {
                                    log::warn!(
                                        "[playback_stream] {} ffmpeg process still running after read_exact error at frame {}",
                                        video_id,
                                        current_pts
                                    );
                                    record_decoder_error(format!(
                                        "FFmpeg read_exact failed at frame {} while process still running: {:?}",
                                        current_pts,
                                        err
                                    ));
                                }
                                Err(wait_err) => {
                                    log::error!(
                                        "[playback_stream] {} failed to query ffmpeg process status at frame {}: {}",
                                        video_id,
                                        current_pts,
                                        wait_err
                                    );
                                    record_decoder_error(format!(
                                        "FFmpeg read_exact failed and process status query failed at frame {}: read_err={:?}, wait_err={}",
                                        current_pts,
                                        err,
                                        wait_err
                                    ));
                                }
                            }
                        } else if let Ok(mut slot) = decoder_last_error.lock() {
                            *slot = Some(format!(
                                "FFmpeg read_exact failed at frame {} with no active child process: {:?}",
                                current_pts,
                                err
                            ));
                            decoder_had_errors.store(true, Ordering::Relaxed);
                        }
                        log::warn!(
                            "[playback_stream] {} read_exact failed at pts {:.6}",
                            video_id,
                            current_pts
                        );
                    }
                }
            }

            if read_success {
                let frame_all_zero = buffer.iter().all(|&b| b == 0);
                if frame_all_zero {
                    zero_frame_retries = zero_frame_retries.saturating_add(1);
                    if let Ok(mut slot) = decoder_last_error.lock() {
                        *slot = Some(format!(
                            "FFmpeg returned all-zero frame at index {} (retry {}/{})",
                            current_pts,
                            zero_frame_retries,
                            5
                        ));
                    }
                    // Retry reads from the same pipe a few times before advancing frame index.
                    // Some decoders output several empty warm-up packets before valid RGBA bytes.
                    if zero_frame_retries <= 5 {
                        log::debug!(
                            "[playback_stream] {} all-zero frame at pts {:.6} (retry {}/5)",
                            video_id,
                            current_pts,
                            zero_frame_retries
                        );
                        thread::sleep(Duration::from_millis(1));
                        continue;
                    }

                    log::warn!(
                        "[playback_stream] {} all-zero frame persisted after retries at pts {:.6}. Advancing.",
                        video_id,
                        current_pts
                    );
                    zero_frame_retries = 0;
                    decoded_frame_count += 1;
                    current_pts = stream_start_pts + (decoded_frame_count as f64 / fps);
                    thread::sleep(Duration::from_millis(1));
                    continue;
                }

                zero_frame_retries = 0;
                
                valid_frame_count += 1;

                // Handle decoder priming: discard frames before target_start_pts
                if is_priming {
                    if current_pts < target_start_pts - (0.5 / fps) {
                        // Discard and advance
                        decoded_frame_count += 1;
                        current_pts = stream_start_pts + (decoded_frame_count as f64 / fps);
                        continue;
                    } else {
                        log::info!("[playback_stream] {} priming complete at pts {:.6} (target {:.6})", video_id, current_pts, target_start_pts);
                        is_priming = false;
                    }
                }

                if valid_frame_count == 1 {
                    log::info!("[playback_stream] {} first valid frame received at pts {:.6}", video_id, current_pts);
                }
                if valid_frame_count == 3 {
                    is_warmed.store(true, Ordering::Relaxed);
                    log::info!("[playback_stream] {} STREAM_WARMED after 3 valid frames", video_id);
                }

                let mut frame_to_push = RawFrame {
                    pts: current_pts,
                    width,
                    height,
                    signature: frame_signature(&buffer),
                    rgba: buffer.clone(),
                };

                // Push to queue, wait if somehow full
                while let Err(returned_frame) = ring_buf.push(frame_to_push) {
                    frame_to_push = returned_frame;
                    // Check if we need to stop/seek while waiting
                    if let Ok(msg) = control_rx.try_recv() {
                        match msg {
                            StreamControl::Stop => return,
                            StreamControl::SeekTo(pts) => {
                                log::info!("[playback_stream] {} seeking to pts={:.6}", video_id, pts);
                                current_pts = pts;
                                target_start_pts = pts;
                                is_priming = true;
                                decoded_frame_count = 0;
                                last_restart_pts = pts;
                                restart_retry_count = 0;
                                
                                if let Some(mut child) = child_process.take() {
                                    kill_and_reap_ffmpeg(&video_id, &mut child, "push-retry seek");
                                }
                                while ring_buf.pop().is_some() {}
                                match start_ffmpeg(current_pts) {
                                    Ok((child, stdout, actual_pts)) => {
                                        child_process = Some(child);
                                        stdout_reader = Some(stdout);
                                        stream_start_pts = actual_pts;
                                        current_pts = actual_pts;
                                    }
                                    Err(_) => return,
                                }
                                break; // Break out of push retry loop
                            }
                        }
                    }
                    thread::sleep(Duration::from_millis(1));
                }

                log::debug!(
                    "[playback_stream] {} Decoder pushed frame at pts {:.6}",
                    video_id, current_pts
                );
                decoded_frame_count += 1;
                current_pts = stream_start_pts + (decoded_frame_count as f64 / fps);
            } else {
                // EOF or error. For streaming, maybe wait for a seek or stop
                thread::sleep(Duration::from_millis(1));
            }
        }

        if let Some(mut child) = child_process.take() {
            kill_and_reap_ffmpeg(&video_id, &mut child, "thread shutdown");
        }
    });
}
