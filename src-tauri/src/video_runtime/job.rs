use std::collections::HashMap;
use std::sync::{mpsc, Mutex, Arc};
use std::thread;
use std::time::Duration;
use uuid::Uuid;

use super::types::{VideoRenderJobRequestV1, VideoRenderJobResponseV1};

struct PendingJob {
    request: VideoRenderJobRequestV1,
    response: VideoRenderJobResponseV1,
}

pub struct VideoJobService {
    pub(crate) jobs: Mutex<HashMap<String, VideoRenderJobResponseV1>>,
    pending: Mutex<Vec<PendingJob>>,
    sender: Mutex<mpsc::Sender<String>>,
}

impl VideoJobService {
    pub fn new() -> Arc<Self> {
        let (tx, rx) = mpsc::channel::<String>();
        let service = Arc::new(Self {
            jobs: Mutex::new(HashMap::new()),
            pending: Mutex::new(Vec::new()),
            sender: Mutex::new(tx),
        });
        
        // Spawn background worker thread
        let service_clone = Arc::clone(&service);
        thread::spawn(move || {
            Self::worker_loop(service_clone, rx);
        });
        
        service
    }
    
    fn worker_loop(service: Arc<Self>, rx: mpsc::Receiver<String>) {
        loop {
            // Wait for job notification or timeout
            match rx.recv_timeout(Duration::from_secs(5)) {
                Ok(_) | Err(mpsc::RecvTimeoutError::Timeout) => {
                    service.process_next_job();
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    break;
                }
            }
        }
    }
    
    fn process_next_job(&self) {
        let pending_job = match self.pending.lock() {
            Ok(mut guard) => {
                if guard.is_empty() {
                    return;
                }
                guard.remove(0)
            }
            Err(_) => return,
        };
        
        let job_id = pending_job.response.job_id.clone();
        
        // Update status to running
        {
            let Ok(mut guard) = self.jobs.lock() else { return };
            if let Some(job) = guard.get_mut(&job_id) {
                if job.status == "cancelled" {
                    return; // Skip cancelled jobs
                }
                job.status = "running".to_string();
            }
        }
        
        // Run real video render job
        match super::render::run_video_render_job_v2(self, &job_id, pending_job.request) {
            Ok(_) => {
                // Job completed successfully (or was cancelled)
                let Ok(mut guard) = self.jobs.lock() else { return };
                if let Some(job) = guard.get_mut(&job_id) {
                    if job.status != "cancelled" {
                        job.status = "completed".to_string();
                        // Ensure final progress is set
                        if job.current_frame < job.total_frames {
                            job.current_frame = job.total_frames;
                        }
                    }
                }
            }
            Err(err) => {
                // Job failed
                let Ok(mut guard) = self.jobs.lock() else { return };
                if let Some(job) = guard.get_mut(&job_id) {
                    if job.status != "cancelled" {
                        job.status = "failed".to_string();
                        eprintln!("Video render job {} failed: {}", job_id, err);
                    }
                }
            }
        }
    }

    pub fn enqueue(&self, request: VideoRenderJobRequestV1) -> Result<VideoRenderJobResponseV1, String> {
        let job_id = Uuid::new_v4().to_string();
        let total_frames = request
            .end_frame
            .saturating_sub(request.start_frame)
            .saturating_add(1);
        let response = VideoRenderJobResponseV1 {
            version: 1,
            job_id: job_id.clone(),
            status: "queued".to_string(),
            current_frame: 0,
            total_frames,
            output_path: request.output_path.clone(),
        };

        // Store in jobs map
        {
            let mut guard = self.jobs.lock().map_err(|_| "Video job service lock poisoned".to_string())?;
            guard.insert(job_id.clone(), response.clone());
        }
        
        // Add to pending queue
        {
            let mut guard = self.pending.lock().map_err(|_| "Video job service lock poisoned".to_string())?;
            guard.push(PendingJob { request, response: response.clone() });
        }
        
        // Notify worker thread
        if let Ok(sender) = self.sender.lock() {
            let _ = sender.send(job_id);
        }
        
        Ok(response)
    }

    pub fn cancel(&self, job_id: &str) -> Result<VideoRenderJobResponseV1, String> {
        let mut guard = self.jobs.lock().map_err(|_| "Video job service lock poisoned".to_string())?;
        let job = guard
            .get_mut(job_id)
            .ok_or_else(|| format!("Unknown job id: {job_id}"))?;
        job.status = "cancelled".to_string();
        Ok(job.clone())
    }

    pub fn get_progress(&self, job_id: &str) -> Result<VideoRenderJobResponseV1, String> {
        let guard = self.jobs.lock().map_err(|_| "Video job service lock poisoned".to_string())?;
        let job = guard
            .get(job_id)
            .ok_or_else(|| format!("Unknown job id: {job_id}"))?;
        Ok(job.clone())
    }

    pub fn list_jobs(&self) -> Vec<VideoRenderJobResponseV1> {
        match self.jobs.lock() {
            Ok(guard) => guard.values().cloned().collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn update_progress(&self, job_id: &str, current_frame: usize) -> Result<(), String> {
        let mut guard = self.jobs.lock().map_err(|_| "Video job service lock poisoned".to_string())?;
        let job = guard
            .get_mut(job_id)
            .ok_or_else(|| format!("Unknown job id: {job_id}"))?;
        job.current_frame = current_frame;
        if current_frame >= job.total_frames && job.status == "running" {
            job.status = "completed".to_string();
        }
        Ok(())
    }
}

