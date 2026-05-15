use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// Binary frame event emitted over the `frame_ready` Tauri event channel.
///
/// All metadata fields mirror `VideoFrameResponseV1`. The `rgba` field carries
/// the raw pixel bytes; Tauri 2.x serialises `Vec<u8>` as a base64 string in
/// the JSON event payload, which is significantly faster than a `Vec<number>`
/// JSON array for large RGBA buffers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryFrameEvent {
    pub video_id: String,
    pub frame_index: usize,
    pub width: u32,
    pub height: u32,
    pub cache_hit: bool,
    pub processing_ms: f64,
    pub backend_used: crate::video_runtime::types::VideoProcessingBackend,
    pub fallback_used: bool,
    pub quality_mode: String,
    pub scale: f32,
    pub requested_index: usize,
    pub produced_index: usize,
    pub ffmpeg_errors: bool,
    pub pts: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport_request_id: Option<String>,
    /// Raw RGBA bytes. Tauri serialises this as a base64 string on the wire.
    pub rgba: Vec<u8>,
}

/// Emit a `frame_ready` event carrying the processed frame and its metadata.
///
/// Returns `Ok(())` on success. Returns `Err(String)` if the Tauri event
/// emission fails (e.g. the window has been closed).
pub fn emit_frame_ready(app_handle: &AppHandle, event: BinaryFrameEvent) -> Result<(), String> {
    app_handle
        .emit("frame_ready", &event)
        .map_err(|e| format!("frame_transport: failed to emit frame_ready event: {e}"))
}
