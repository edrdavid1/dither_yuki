// Master Clock Service — Rust-side transport clock
// Emits `clock_tick` Tauri events on each frame tick.
// Requirements: 2.1–2.7

use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Serialisable snapshot of the transport state returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransportState {
    pub frame: usize,
    pub playing: bool,
    pub loop_enabled: bool,
    pub in_frame: usize,
    pub out_frame: usize,
    pub fps: f64,
    pub time_secs: f64,
}

/// Payload emitted with every `clock_tick` event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClockTickPayload {
    pub frame: usize,
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

struct ClockState {
    frame: usize,
    playing: bool,
    loop_enabled: bool,
    in_frame: usize,
    out_frame: usize,
    fps: f64,
    total_frames: usize,
    time_secs: f64,
}

impl Default for ClockState {
    fn default() -> Self {
        Self {
            frame: 0,
            playing: false,
            loop_enabled: false,
            in_frame: 0,
            out_frame: 0,
            fps: 24.0,
            total_frames: 0,
            time_secs: 0.0,
        }
    }
}

enum ClockControl {
    Play,
    Pause,
    Seek(usize),
    SetLoop(bool),
    SetInOut(usize, usize),
    SetFps(f64),
    SetTotalFrames(usize),
    Stop,
}

fn clamp_seek_frame(total_frames: usize, frame: usize) -> usize {
    if total_frames > 0 {
        frame.min(total_frames.saturating_sub(1))
    } else {
        frame
    }
}

// ---------------------------------------------------------------------------
// MasterClockService
// ---------------------------------------------------------------------------

pub struct MasterClockService {
    state: Arc<Mutex<ClockState>>,
    control_tx: std::sync::mpsc::Sender<ClockControl>,
}

impl MasterClockService {
    /// Create a new `MasterClockService` and spawn the worker thread.
    pub fn new(app_handle: AppHandle) -> Self {
        let state = Arc::new(Mutex::new(ClockState::default()));
        let (control_tx, control_rx) = std::sync::mpsc::channel::<ClockControl>();

        let state_worker = Arc::clone(&state);
        thread::spawn(move || {
            worker_loop(app_handle, state_worker, control_rx);
        });

        Self { state, control_tx }
    }

    // -----------------------------------------------------------------------
    // Control methods
    // -----------------------------------------------------------------------

    pub fn play(&self) {
        let _ = self.control_tx.send(ClockControl::Play);
    }

    pub fn pause(&self) {
        let _ = self.control_tx.send(ClockControl::Pause);
    }

    /// Update the transport position without restarting the playback stream.
    /// Used by `pull_next_playback_frame_binary` to keep the UI playhead in
    /// sync with the frame the stream actually produced.
    pub fn update_frame_from_stream(&self, frame: usize) {
        let mut s = self.state.lock().expect("clock state lock poisoned");
        s.frame = frame;
        s.time_secs = frame as f64 / s.fps.max(0.001);
    }

    pub fn seek(&self, frame: usize) {
        let clamped = {
            let mut state = self.state.lock().expect("clock state lock poisoned");
            let clamped = clamp_seek_frame(state.total_frames, frame);
            state.frame = clamped;
            state.time_secs = clamped as f64 / state.fps.max(0.001);
            clamped
        };

        let _ = self.control_tx.send(ClockControl::Seek(clamped));
    }

    pub fn set_loop(&self, enabled: bool) {
        let _ = self.control_tx.send(ClockControl::SetLoop(enabled));
    }

    pub fn set_in_out(&self, in_frame: usize, out_frame: usize) {
        let _ = self.control_tx.send(ClockControl::SetInOut(in_frame, out_frame));
    }

    pub fn set_fps(&self, fps: f64) {
        let _ = self.control_tx.send(ClockControl::SetFps(fps));
    }

    pub fn set_total_frames(&self, total_frames: usize) {
        let _ = self.control_tx.send(ClockControl::SetTotalFrames(total_frames));
    }

    /// Read a snapshot of the current transport state.
    pub fn get_state(&self) -> TransportState {
        let s = self.state.lock().expect("clock state lock poisoned");
        TransportState {
            frame: s.frame,
            playing: s.playing,
            loop_enabled: s.loop_enabled,
            in_frame: s.in_frame,
            out_frame: s.out_frame,
            fps: s.fps,
            time_secs: s.time_secs,
        }
    }
}

// ---------------------------------------------------------------------------
// Worker thread
// ---------------------------------------------------------------------------

fn worker_loop(
    app_handle: AppHandle,
    state: Arc<Mutex<ClockState>>,
    control_rx: std::sync::mpsc::Receiver<ClockControl>,
) {
    // Drain all pending control messages without blocking.
    let drain_controls = |state: &Arc<Mutex<ClockState>>| {
        while let Ok(msg) = control_rx.try_recv() {
            apply_control(state, msg);
        }
    };

    loop {
        // Process any pending control messages first.
        drain_controls(&state);

        let (playing, fps, frame, loop_enabled, in_frame, out_frame, total_frames) = {
            let s = state.lock().expect("clock state lock poisoned");
            (s.playing, s.fps, s.frame, s.loop_enabled, s.in_frame, s.out_frame, s.total_frames)
        };

        if !playing {
            // Not playing — block until a control message arrives.
            match control_rx.recv() {
                Ok(msg) => {
                    apply_control(&state, msg);
                }
                Err(_) => break, // sender dropped; exit thread
            }
            continue;
        }

        // Compute tick interval from FPS (clamp to sane range).
        let fps_clamped = fps.max(1.0).min(240.0);
        let tick_interval = Duration::from_secs_f64(1.0 / fps_clamped);
        let deadline = Instant::now() + tick_interval;

        // Emit the current frame.
        let _ = app_handle.emit("clock_tick", ClockTickPayload { frame });

        // Notify audio service to play from the current frame on the first tick
        // after a Play command. We detect this by checking if the sink is not
        // already playing (best-effort; audio service is tolerant of extra calls).
        {
            use crate::video_runtime::services::audio_service;
            let audio = audio_service();
            let audio_state = audio.get_state();
            if audio_state.active && !audio_state.position_secs.is_nan() {
                // Only call play_from_frame on the very first tick after play starts
                // to avoid re-seeking on every tick. We detect "just started" by
                // checking if the audio position is close to the expected frame.
                let expected_secs = frame as f64 / fps_clamped;
                let diff = (audio_state.position_secs - expected_secs).abs();
                if diff > 0.5 {
                    audio.play_from_frame(frame, fps_clamped);
                }
            }
        }

        // Advance frame.
        let next_frame = frame + 1;

        // Determine the effective out boundary.
        let effective_out = if out_frame > 0 {
            out_frame
        } else if total_frames > 0 {
            total_frames.saturating_sub(1)
        } else {
            usize::MAX
        };

        {
            let mut s = state.lock().expect("clock state lock poisoned");
            if loop_enabled && next_frame >= effective_out {
                // Loop wrap: jump back to in_frame.
                s.frame = in_frame;
            } else if !loop_enabled && next_frame >= effective_out {
                // Stop: reached the end without looping.
                s.frame = effective_out;
                s.playing = false;
                s.time_secs = s.frame as f64 / fps_clamped;
                drop(s);
                let _ = app_handle.emit("transport_stopped", ());
                continue; // Skip the rest of the loop
            } else {
                s.frame = next_frame;
            }
            s.time_secs = s.frame as f64 / fps_clamped;
        }

        // Sleep until the next tick deadline, draining controls while waiting.
        let now = Instant::now();
        if deadline > now {
            let sleep_dur = deadline - now;
            // Sleep in small slices so we can react to control messages quickly.
            let slice = Duration::from_millis(5);
            let mut remaining = sleep_dur;
            while remaining > Duration::ZERO {
                let nap = remaining.min(slice);
                thread::sleep(nap);
                remaining = remaining.saturating_sub(nap);
                drain_controls(&state);
            }
        }
    }
}

fn apply_control(state: &Arc<Mutex<ClockState>>, msg: ClockControl) {
    let mut s = state.lock().expect("clock state lock poisoned");
    match msg {
        ClockControl::Play => {
            s.playing = true;
        }
        ClockControl::Pause => {
            s.playing = false;
            drop(s);
            // Pause audio when the transport pauses.
            use crate::video_runtime::services::audio_service;
            let audio = audio_service();
            if audio.get_state().active {
                audio.pause();
            }
            return;
        }
        ClockControl::Seek(frame) => {
            // Clamp to [0, total_frames - 1] if total_frames is known.
            let clamped = clamp_seek_frame(s.total_frames, frame);
            s.frame = clamped;
            s.time_secs = clamped as f64 / s.fps;
            let fps = s.fps;
            drop(s);
            // Seek audio to the new position.
            use crate::video_runtime::services::audio_service;
            let audio = audio_service();
            if audio.get_state().active {
                audio.seek_to_frame(clamped, fps);
            }
            return;
        }
        ClockControl::SetLoop(enabled) => {
            s.loop_enabled = enabled;
        }
        ClockControl::SetInOut(in_frame, out_frame) => {
            s.in_frame = in_frame;
            s.out_frame = out_frame;
        }
        ClockControl::SetFps(fps) => {
            s.fps = fps;
        }
        ClockControl::SetTotalFrames(total) => {
            s.total_frames = total;
        }
        ClockControl::Stop => {
            s.playing = false;
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_state(frame: usize, playing: bool, loop_enabled: bool, in_frame: usize, out_frame: usize, fps: f64, total_frames: usize) -> Arc<Mutex<ClockState>> {
        Arc::new(Mutex::new(ClockState {
            frame,
            playing,
            loop_enabled,
            in_frame,
            out_frame,
            fps,
            total_frames,
            time_secs: frame as f64 / fps.max(0.001),
        }))
    }

    #[test]
    fn seek_clamps_to_total_frames() {
        let state = make_state(0, false, false, 0, 100, 24.0, 100);
        apply_control(&state, ClockControl::Seek(200));
        assert_eq!(state.lock().unwrap().frame, 99);
    }

    #[test]
    fn seek_without_total_frames_is_unclamped() {
        let state = make_state(0, false, false, 0, 0, 24.0, 0);
        apply_control(&state, ClockControl::Seek(9999));
        assert_eq!(state.lock().unwrap().frame, 9999);
    }

    #[test]
    fn clamp_seek_frame_matches_total_frames() {
        assert_eq!(clamp_seek_frame(100, 200), 99);
        assert_eq!(clamp_seek_frame(0, 200), 200);
    }

    #[test]
    fn set_fps_updates_fps() {
        let state = make_state(0, false, false, 0, 0, 24.0, 0);
        apply_control(&state, ClockControl::SetFps(60.0));
        assert!((state.lock().unwrap().fps - 60.0).abs() < f64::EPSILON);
    }

    #[test]
    fn set_loop_updates_flag() {
        let state = make_state(0, false, false, 0, 0, 24.0, 0);
        apply_control(&state, ClockControl::SetLoop(true));
        assert!(state.lock().unwrap().loop_enabled);
    }

    #[test]
    fn set_in_out_updates_bounds() {
        let state = make_state(0, false, false, 0, 0, 24.0, 0);
        apply_control(&state, ClockControl::SetInOut(10, 50));
        let s = state.lock().unwrap();
        assert_eq!(s.in_frame, 10);
        assert_eq!(s.out_frame, 50);
    }

    #[test]
    fn pause_stops_playing() {
        let state = make_state(0, true, false, 0, 0, 24.0, 0);
        apply_control(&state, ClockControl::Pause);
        assert!(!state.lock().unwrap().playing);
    }

    #[test]
    fn play_starts_playing() {
        let state = make_state(0, false, false, 0, 0, 24.0, 0);
        apply_control(&state, ClockControl::Play);
        assert!(state.lock().unwrap().playing);
    }
}
