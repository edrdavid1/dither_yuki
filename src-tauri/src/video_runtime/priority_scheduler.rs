use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use super::{
    api,
    services::job_service,
    types::{
        VideoFrameRequestV1, VideoFrameResponseV1, VideoRenderJobRequestV1,
        VideoRenderJobResponseV1,
    },
};

/// Priority levels for scheduler routing.
/// Higher numeric value = higher priority.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum JobPriority {
    Export = 0,
    Prefetch = 1,
    Interactive = 2,
}

/// Snapshot of the scheduler's current state, returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerState {
    pub interactive_queued: usize,
    pub prefetch_queued: usize,
    pub export_queued: usize,
    pub current_priority: Option<String>,
    pub current_job_id: Option<String>,
}

/// A thin routing layer that directs requests to the appropriate backend
/// based on their priority.
///
/// - Interactive requests are processed synchronously (highest priority).
/// - Prefetch requests are delegated to the existing prefetch service.
/// - Export requests are enqueued in the `VideoJobService`.
pub struct PriorityScheduler {
    /// Tracks whether an interactive request is currently running.
    interactive_running: Mutex<bool>,
}

impl PriorityScheduler {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            interactive_running: Mutex::new(false),
        })
    }

    /// Process a single video frame synchronously (interactive / highest priority).
    ///
    /// Interactive requests bypass the queue entirely and call `process_frame_v2`
    /// directly. An `AppHandle` may be provided to also emit the `frame_ready`
    /// binary transport event.
    pub fn submit_interactive(
        &self,
        request: VideoFrameRequestV1,
        app_handle: Option<&tauri::AppHandle>,
    ) -> Result<VideoFrameResponseV1, String> {
        // Mark interactive as running so callers can observe it via get_state().
        if let Ok(mut running) = self.interactive_running.lock() {
            *running = true;
        }

        let result = api::process_frame_v2(request, app_handle);

        if let Ok(mut running) = self.interactive_running.lock() {
            *running = false;
        }

        result
    }


    /// Enqueue a video render job (export / lowest priority).
    ///
    /// Delegates to `VideoJobService::enqueue`.
    pub fn submit_export(
        &self,
        request: VideoRenderJobRequestV1,
    ) -> Result<VideoRenderJobResponseV1, String> {
        job_service().enqueue(request)
    }

    /// Return a snapshot of the current scheduler state.
    ///
    /// Queue counts are mostly zero in this thin-routing implementation because
    /// the actual queuing is handled by the prefetch worker and `VideoJobService`.
    /// The `interactive_running` flag is reflected in `current_priority`.
    pub fn get_state(&self) -> SchedulerState {
        let interactive_running = self
            .interactive_running
            .lock()
            .map(|g| *g)
            .unwrap_or(false);

        let export_queued = {
            let svc = job_service();
            svc.list_jobs()
                .iter()
                .filter(|j| j.status == "queued" || j.status == "running")
                .count()
        };

        SchedulerState {
            interactive_queued: 0,
            prefetch_queued: 0,
            export_queued,
            current_priority: if interactive_running {
                Some("interactive".to_string())
            } else {
                None
            },
            current_job_id: None,
        }
    }
}
