// AudioSyncService — audio playback synchronized to the master clock.
// Requirements: 4.1–4.7
//
// Uses `rodio` for audio playback. Audio is extracted from the source video
// via FFmpeg into a temporary WAV file, then loaded into a rodio Sink.
//
// rodio::Sink does not support seeking directly. The workaround is to stop
// the current sink, re-open the WAV file, and skip (drain) samples up to the
// target position before resuming playback.

use std::fs;
use std::io::BufReader;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::video_processing::resolve_media_binary_path;
use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink, Source};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSyncState {
    pub active: bool,
    pub position_secs: f64,
    pub drift_ms: f64,
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

struct AudioState {
    active: bool,
    position_secs: f64,
    drift_ms: f64,
    /// Path to the extracted temporary WAV file.
    temp_wav_path: Option<PathBuf>,
    /// The video_id this audio belongs to.
    video_id: Option<String>,
    /// FPS used for frame→seconds conversion.
    fps: f64,
    /// Whether the sink is currently playing.
    playing: bool,
    /// The frame at which playback started (used to track position).
    start_frame: usize,
    /// Wall-clock instant when playback started (for position estimation).
    play_started_at: Option<std::time::Instant>,
}

impl Default for AudioState {
    fn default() -> Self {
        Self {
            active: false,
            position_secs: 0.0,
            drift_ms: 0.0,
            temp_wav_path: None,
            video_id: None,
            fps: 24.0,
            playing: false,
            start_frame: 0,
            play_started_at: None,
        }
    }
}

// ---------------------------------------------------------------------------
// AudioSyncService
// ---------------------------------------------------------------------------

pub struct AudioSyncService {
    state: Arc<Mutex<AudioState>>,
    /// The rodio output stream must be kept alive for the duration of playback.
    /// We store it behind a Mutex so we can replace it on re-init.
    _stream: Mutex<Option<OutputStream>>,
    stream_handle: Mutex<Option<OutputStreamHandle>>,
    sink: Mutex<Option<Arc<Sink>>>,
}

impl AudioSyncService {
    pub fn new() -> Self {
        let (stream_opt, handle_opt) = match OutputStream::try_default() {
            Ok((stream, handle)) => (Some(stream), Some(handle)),
            Err(e) => {
                log::error!("[AudioSyncService] Failed to open audio output stream: {e}");
                (None, None)
            }
        };

        Self {
            state: Arc::new(Mutex::new(AudioState::default())),
            _stream: Mutex::new(stream_opt),
            stream_handle: Mutex::new(handle_opt),
            sink: Mutex::new(None),
        }
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /// Extract audio from `input_path` using FFmpeg and load it into rodio.
    /// If FFmpeg is unavailable or extraction fails, the service operates in
    /// video-only mode (Requirement 4.7).
    pub fn load_audio(&self, video_id: &str, input_path: &str) -> Result<(), String> {
        // Build a stable temp path based on video_id so we can reuse it.
        let temp_dir = std::env::temp_dir().join("dither-yuki-audio");
        fs::create_dir_all(&temp_dir)
            .map_err(|e| format!("Failed to create audio temp dir: {e}"))?;

        let safe_id: String = video_id
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
            .collect();
        let wav_path = temp_dir.join(format!("{safe_id}.wav"));

        // Check if the file actually has audio streams before attempting extraction.
        let meta = crate::video_processing::probe_video_file_metadata(input_path).map_err(|e| {
            format!("Failed to probe video metadata for audio check: {e}")
        })?;

        if !meta.has_audio {
            log::info!("[AudioSyncService] Video {video_id} has no audio streams. Skipping extraction.");
            let mut st = self.state.lock().expect("audio state lock poisoned");
            st.active = false;
            st.video_id = Some(video_id.to_string());
            st.temp_wav_path = None;
            return Ok(());
        }

        let ffmpeg = resolve_media_binary_path("ffmpeg")?;

        // Extract audio with FFmpeg: mono, 44100 Hz, PCM s16le WAV.
        let status = Command::new(&ffmpeg)
            .args([
                "-y",
                "-fflags", "+genpts+discardcorrupt",
                "-flags", "+low_delay",
                "-i", input_path,
                "-vn",
                "-acodec", "pcm_s16le",
                "-ar", "44100",
                "-ac", "1",
                wav_path.to_str().unwrap_or(""),
            ])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .output();

        let output = match status {
            Ok(o) => o,
            Err(e) => {
                return Err(format!("FFmpeg ({}) not available or failed to run: {e}", ffmpeg.display()));
            }
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "FFmpeg ({}) exited with status {} while extracting audio from {input_path}. Errors: {stderr}",
                ffmpeg.display(),
                output.status
            ));
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if !stderr.is_empty() {
            log::warn!("[AudioSyncService] Audio extraction had non-fatal warnings for {video_id}: {stderr}");
        }

        // Load the WAV into rodio.
        self.load_wav_into_sink(&wav_path)?;

        {
            let mut st = self.state.lock().expect("audio state lock poisoned");
            st.active = true;
            st.temp_wav_path = Some(wav_path);
            st.video_id = Some(video_id.to_string());
            st.playing = false;
            st.position_secs = 0.0;
        }

        log::info!("[AudioSyncService] Audio loaded for video_id={video_id}");
        Ok(())
    }

    /// Seek to `frame / fps` seconds and start playing.
    pub fn play_from_frame(&self, frame: usize, fps: f64) {
        let target_secs = frame as f64 / fps.max(1.0);
        if let Err(e) = self.seek_sink_to(target_secs) {
            log::warn!("[AudioSyncService] play_from_frame seek failed: {e}");
        }
        if let Some(sink) = self.sink.lock().expect("sink lock poisoned").as_ref() {
            sink.play();
        }
        let mut st = self.state.lock().expect("audio state lock poisoned");
        st.fps = fps;
        st.start_frame = frame;
        st.playing = true;
        st.play_started_at = Some(std::time::Instant::now());
        st.position_secs = target_secs;
    }

    /// Pause the sink.
    pub fn pause(&self) {
        if let Some(sink) = self.sink.lock().expect("sink lock poisoned").as_ref() {
            sink.pause();
        }
        let mut st = self.state.lock().expect("audio state lock poisoned");
        // Capture current position before pausing.
        if let Some(started_at) = st.play_started_at.take() {
            let elapsed = started_at.elapsed().as_secs_f64();
            st.position_secs += elapsed;
        }
        st.playing = false;
    }

    /// Seek to `frame / fps` seconds without changing play/pause state.
    pub fn seek_to_frame(&self, frame: usize, fps: f64) {
        let target_secs = frame as f64 / fps.max(1.0);
        if let Err(e) = self.seek_sink_to(target_secs) {
            log::warn!("[AudioSyncService] seek_to_frame failed: {e}");
        }
        let mut st = self.state.lock().expect("audio state lock poisoned");
        st.fps = fps;
        st.start_frame = frame;
        st.position_secs = target_secs;
        if st.playing {
            st.play_started_at = Some(std::time::Instant::now());
        }
    }

    /// Return a snapshot of the current audio sync state.
    pub fn get_state(&self) -> AudioSyncState {
        let st = self.state.lock().expect("audio state lock poisoned");
        // Estimate current position from wall clock if playing.
        let position_secs = if st.playing {
            if let Some(started_at) = st.play_started_at {
                st.position_secs + started_at.elapsed().as_secs_f64()
            } else {
                st.position_secs
            }
        } else {
            st.position_secs
        };
        AudioSyncState {
            active: st.active,
            position_secs,
            drift_ms: st.drift_ms,
        }
    }

    // -----------------------------------------------------------------------
    // Drift correction
    // -----------------------------------------------------------------------

    /// Spawn a background thread that every 100ms compares the audio position
    /// against the master clock frame. If |drift| > 40ms, it calls
    /// `clock_service().seek(audio_frame)` to resync.
    ///
    /// Requirements: 4.6
    pub fn start_drift_correction_thread(self: &Arc<Self>) {
        let service = Arc::clone(self);
        thread::spawn(move || {
            loop {
                thread::sleep(Duration::from_millis(100));

                let audio_state = service.get_state();
                if !audio_state.active {
                    continue;
                }

                // Get the master clock's current frame.
                let clock_result = std::panic::catch_unwind(|| {
                    crate::video_runtime::services::clock_service().get_state()
                });

                let clock_state = match clock_result {
                    Ok(s) => s,
                    Err(_) => continue, // clock not yet initialized
                };

                if !clock_state.playing {
                    continue;
                }

                let fps = clock_state.fps.max(1.0);
                let clock_secs = clock_state.frame as f64 / fps;
                let drift_ms = (audio_state.position_secs - clock_secs) * 1000.0;

                // Update drift in state.
                {
                    let mut st = service.state.lock().expect("audio state lock poisoned");
                    st.drift_ms = drift_ms;
                }

                // If drift exceeds 40ms, resync the master clock to the audio position.
                if drift_ms.abs() > 40.0 {
                    let audio_frame = (audio_state.position_secs * fps).round() as usize;
                    log::debug!(
                        "[AudioSyncService] Drift {drift_ms:.1}ms exceeds threshold; \
                         resyncing clock to frame {audio_frame}"
                    );
                    crate::video_runtime::services::clock_service().seek(audio_frame);
                }
            }
        });
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /// Load a WAV file into a new Sink, replacing any existing one.
    fn load_wav_into_sink(&self, wav_path: &PathBuf) -> Result<(), String> {
        let handle_guard = self.stream_handle.lock().expect("stream_handle lock poisoned");
        let handle = handle_guard
            .as_ref()
            .ok_or_else(|| "Audio output stream not available".to_string())?;

        let new_sink = Sink::try_new(handle)
            .map_err(|e| format!("Failed to create rodio Sink: {e}"))?;

        let file = fs::File::open(wav_path)
            .map_err(|e| format!("Failed to open WAV file {}: {e}", wav_path.display()))?;
        let source = Decoder::new(BufReader::new(file))
            .map_err(|e| format!("Failed to decode WAV file: {e}"))?;

        new_sink.append(source);
        new_sink.pause(); // Start paused; caller decides when to play.

        let mut sink_guard = self.sink.lock().expect("sink lock poisoned");
        *sink_guard = Some(Arc::new(new_sink));

        Ok(())
    }

    /// Seek the sink to `target_secs` by reloading the WAV and skipping samples.
    ///
    /// rodio does not support direct seeking, so we:
    /// 1. Stop and drop the current sink.
    /// 2. Create a new sink from the WAV file.
    /// 3. Use `rodio::Source::skip_duration` to advance to the target position.
    fn seek_sink_to(&self, target_secs: f64) -> Result<(), String> {
        let wav_path = {
            let st = self.state.lock().expect("audio state lock poisoned");
            st.temp_wav_path.clone()
        };

        let wav_path = match wav_path {
            Some(p) => p,
            None => return Ok(()), // No audio loaded yet; nothing to seek.
        };

        let handle_guard = self.stream_handle.lock().expect("stream_handle lock poisoned");
        let handle = handle_guard
            .as_ref()
            .ok_or_else(|| "Audio output stream not available".to_string())?;

        let new_sink = Sink::try_new(handle)
            .map_err(|e| format!("Failed to create rodio Sink for seek: {e}"))?;

        let file = fs::File::open(&wav_path)
            .map_err(|e| format!("Failed to open WAV file for seek: {e}"))?;
        let source = Decoder::new(BufReader::new(file))
            .map_err(|e| format!("Failed to decode WAV file for seek: {e}"))?;

        // Skip to the target position.
        let skip_dur = Duration::from_secs_f64(target_secs.max(0.0));
        let seeked_source = source.skip_duration(skip_dur);

        new_sink.append(seeked_source);
        new_sink.pause(); // Caller will call play() if needed.

        let mut sink_guard = self.sink.lock().expect("sink lock poisoned");
        *sink_guard = Some(Arc::new(new_sink));

        Ok(())
    }
}

impl Default for AudioSyncService {
    fn default() -> Self {
        Self::new()
    }
}

// SAFETY: `AudioSyncService` wraps `OutputStream` (which is `!Send + !Sync` on
// macOS due to CoreAudio internals) behind a `Mutex`. All access to the stream
// and sink goes through the mutex, so there are no data races. The stream is
// only ever used to create new `Sink` instances; it is never sent across threads
// directly. This is the standard workaround for using rodio in a multi-threaded
// context on macOS.
unsafe impl Send for AudioSyncService {}
unsafe impl Sync for AudioSyncService {}
