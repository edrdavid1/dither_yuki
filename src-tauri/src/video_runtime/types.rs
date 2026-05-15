use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VideoProcessingBackend {
    Cpu,
    Gpu,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VideoTransportMode {
    Playback,
    Scrub,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VideoFrameStreamStatus {
    Ready,
    Waiting,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoFrameRequestV1 {
    pub version: u32,
    pub video_id: String,
    pub frame_index: usize,
    pub quality_mode: Option<String>,
    pub scale: Option<f32>,
    pub width: u32,
    pub height: u32,
    pub frame_rgba: Option<Vec<u8>>,
    pub input_path: Option<String>,
    pub fps: Option<f64>,
    pub layer_snapshot_hash: Option<String>,
    pub layer_payload: Vec<crate::image_engine::EffectLayer>,
    pub layer_tracks: Option<Vec<LayerTrack>>,
    pub processing_backend: Option<VideoProcessingBackend>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport_request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport_mode: Option<VideoTransportMode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoFrameResponseV1 {
    pub version: u32,
    pub video_id: String,
    pub frame_index: usize,
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    pub cache_hit: bool,
    pub processing_ms: f64,
    pub backend_used: VideoProcessingBackend,
    pub fallback_used: bool,
    pub requested_index: usize,
    pub produced_index: usize,
    pub ffmpeg_errors: bool,
    pub pts: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_status: Option<VideoFrameStreamStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoFrameResponseMetaV1 {
    pub version: u32,
    pub video_id: String,
    pub frame_index: usize,
    pub width: u32,
    pub height: u32,
    pub cache_hit: bool,
    pub processing_ms: f64,
    pub backend_used: VideoProcessingBackend,
    pub fallback_used: bool,
    pub requested_index: usize,
    pub produced_index: usize,
    pub ffmpeg_errors: bool,
    pub pts: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_status: Option<VideoFrameStreamStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transport_request_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoPreviewSessionRequestV1 {
    pub version: u32,
    pub video_id: String,
    pub input_path: String,
    pub fps: f64,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoPreviewSessionResponseV1 {
    pub version: u32,
    pub video_id: String,
    pub input_path: String,
    pub active_path: String,
    pub preview_path: Option<String>,
    pub preview_width: u32,
    pub preview_height: u32,
    pub proxy_mode: bool,
    pub duration_seconds: f64,
    pub estimated_frame_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayerRange {
    pub start_frame: usize,
    pub end_frame: usize,
    pub enabled: Option<bool>,
    pub opacity01: Option<f32>,
    pub intensity: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_in_frame: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_out_frame: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayerKeyframe {
    pub frame: usize,
    pub opacity01: Option<f32>,
    pub intensity: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayerTrack {
    pub layer_id: String,
    pub disable_outside_ranges: Option<bool>,
    pub ranges: Vec<LayerRange>,
    pub keyframes: Vec<LayerKeyframe>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoRenderJobRequestV1 {
    pub version: u32,
    pub video_id: String,
    pub start_frame: usize,
    pub end_frame: usize,
    pub fps: f64,
    pub output_format: String,
    // Extended fields for full video processing
    pub input_path: Option<String>,
    pub output_path: Option<String>,
    pub layers: Option<Vec<crate::image_engine::EffectLayer>>,
    pub tracks: Option<Vec<LayerTrack>>,
    pub keep_audio: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoRenderJobResponseV1 {
    pub version: u32,
    pub job_id: String,
    pub status: String,
    pub current_frame: usize,
    pub total_frames: usize,
    pub output_path: Option<String>,
}

