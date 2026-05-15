use std::sync::{Arc, OnceLock};

use super::{
    audio::AudioSyncService,
    cache::VideoCacheService,
    clock::MasterClockService,
    gpu::GpuProcessor,
    job::VideoJobService,
    priority_scheduler::PriorityScheduler,
    types::VideoProcessingBackend,
};

static CACHE: OnceLock<VideoCacheService> = OnceLock::new();
static JOBS: OnceLock<Arc<VideoJobService>> = OnceLock::new();
static PLAYBACK_STREAMS: OnceLock<dashmap::DashMap<String, Arc<crate::video_runtime::playback_stream::PlaybackStream>>> = OnceLock::new();

#[derive(Default, Clone)]
pub struct PlaybackEffectParams {
    pub layer_payload: Vec<crate::image_engine::EffectLayer>,
    pub layer_tracks: Vec<crate::video_runtime::types::LayerTrack>,
    pub layer_snapshot_hash: String,
    pub quality_mode: String,
    pub scale: f32,
}
static EFFECT_PARAMS: OnceLock<dashmap::DashMap<String, Arc<PlaybackEffectParams>>> = OnceLock::new();
static GPU: OnceLock<Option<Arc<GpuProcessor>>> = OnceLock::new();
static CLOCK: OnceLock<Arc<MasterClockService>> = OnceLock::new();
static SCHEDULER: OnceLock<Arc<PriorityScheduler>> = OnceLock::new();
static AUDIO: OnceLock<Arc<AudioSyncService>> = OnceLock::new();

pub fn scheduler_service() -> &'static Arc<PriorityScheduler> {
    SCHEDULER.get_or_init(PriorityScheduler::new)
}

pub fn audio_service() -> &'static Arc<AudioSyncService> {
    AUDIO.get_or_init(|| Arc::new(AudioSyncService::new()))
}

pub(super) fn cache_service() -> &'static VideoCacheService {
    CACHE.get_or_init(|| VideoCacheService::new(300))
}

pub(super) fn job_service() -> Arc<VideoJobService> {
    JOBS.get_or_init(VideoJobService::new).clone()
}

pub(super) fn gpu_processor() -> Option<Arc<GpuProcessor>> {
    GPU.get_or_init(|| {
        pollster::block_on(async {
            match GpuProcessor::new().await {
                Ok(processor) => Some(Arc::new(processor)),
                Err(error) => {
                    log::error!("GPU initialization failed: {}", error);
                    None
                }
            }
        })
    })
    .clone()
}

/// Returns the singleton `MasterClockService`. Panics if not yet initialized.
pub fn clock_service() -> &'static Arc<MasterClockService> {
    CLOCK.get().expect("MasterClockService not initialized — call init_clock_service first")
}

/// Initialize the `MasterClockService` singleton with the given `AppHandle`.
/// Must be called once during app setup before any transport commands are invoked.
pub fn init_clock_service(app_handle: tauri::AppHandle) {
    CLOCK.get_or_init(|| Arc::new(MasterClockService::new(app_handle)));
}

pub fn playback_streams() -> &'static dashmap::DashMap<String, Arc<crate::video_runtime::playback_stream::PlaybackStream>> {
    PLAYBACK_STREAMS.get_or_init(dashmap::DashMap::new)
}

pub fn playback_effect_params() -> &'static dashmap::DashMap<String, Arc<PlaybackEffectParams>> {
    EFFECT_PARAMS.get_or_init(dashmap::DashMap::new)
}
