use crate::image_engine;
use std::path::Path;

use super::{
    cache::cache_key,
    decode,
    frame_transport::{emit_frame_ready, BinaryFrameEvent},
    layer_tracks::resolve_decode_frame,
    preview_session,
    process,
    services::{cache_service, clock_service, gpu_processor, job_service},
    types::{VideoFrameRequestV1, VideoFrameResponseV1, VideoFrameStreamStatus, VideoProcessingBackend, VideoRenderJobRequestV1, VideoRenderJobResponseV1, VideoPreviewSessionResponseV1},
};

fn waiting_playback_response(video_id: &str, frame_index: usize, ffmpeg_errors: bool) -> VideoFrameResponseV1 {
    VideoFrameResponseV1 {
        version: 1,
        video_id: video_id.to_string(),
        frame_index,
        width: 0,
        height: 0,
        rgba: Vec::new(),
        cache_hit: false,
        processing_ms: 0.0,
        backend_used: VideoProcessingBackend::Cpu,
        fallback_used: false,
        requested_index: frame_index,
        produced_index: frame_index,
        ffmpeg_errors,
        stream_status: Some(VideoFrameStreamStatus::Waiting),
        pts: None,
    }
}

fn emit_binary_frame_event(
    app_handle: &tauri::AppHandle,
    request: &VideoFrameRequestV1,
    response: &VideoFrameResponseV1,
    quality_mode: &str,
    scale: f32,
) {
    let event = BinaryFrameEvent {
        video_id: response.video_id.clone(),
        frame_index: response.frame_index,
        width: response.width,
        height: response.height,
        cache_hit: response.cache_hit,
        processing_ms: response.processing_ms,
        backend_used: response.backend_used.clone(),
        fallback_used: response.fallback_used,
        quality_mode: quality_mode.to_string(),
        scale,
        requested_index: response.requested_index,
        produced_index: response.produced_index,
        ffmpeg_errors: response.ffmpeg_errors,
        transport_request_id: request.transport_request_id.clone(),
        rgba: response.rgba.clone(),
        pts: response.pts,
    };

    if let Err(error) = emit_frame_ready(app_handle, event) {
        log::warn!("Failed to emit frame_ready event: {}", error);
    }
}

/// Process a single video frame and, when an `AppHandle` is provided, also
/// emit the result as a `frame_ready` binary transport event.
///
/// The synchronous return value is always populated so callers that do not
/// listen for the event can still use the response directly (fallback path).
pub fn process_frame_v2(
    request: VideoFrameRequestV1,
    app_handle: Option<&tauri::AppHandle>,
) -> Result<VideoFrameResponseV1, String> {
    let quality_mode = request.quality_mode.as_deref().unwrap_or("fast");
    let scale = decode::effective_preview_scale(request.quality_mode.as_deref(), request.scale);
    let (target_width, target_height) = decode::preview_dimensions(request.width, request.height, scale);

    let key = cache_key(
        &request.video_id,
        request.frame_index,
        quality_mode,
        scale,
        request.layer_snapshot_hash.as_deref().unwrap_or("none"),
    );

    if let Some(entry) = cache_service().get(&key) {
        let ffmpeg_errors = super::services::playback_streams()
            .get(&request.video_id)
            .map(|s| s.has_ffmpeg_errors())
            .unwrap_or(false);

        let response = VideoFrameResponseV1 {
            version: 1,
            video_id: request.video_id.clone(),
            frame_index: request.frame_index,
            width: target_width,
            height: target_height,
            rgba: entry.rgba,
            cache_hit: true,
            processing_ms: 0.0,
            backend_used: entry.backend_used,
            fallback_used: entry.fallback_used,
            requested_index: request.frame_index,
            produced_index: entry.produced_index,
            ffmpeg_errors,
            stream_status: Some(VideoFrameStreamStatus::Ready),
            pts: None, // Or we could derive it if we had metadata here, but cache hit means it was previously processed
        };

        if let Some(app_handle) = app_handle {
            emit_binary_frame_event(app_handle, &request, &response, quality_mode, scale);
        }

        return Ok(response);
    }

    let started = std::time::Instant::now();
    let preferred_backend = request
        .processing_backend
        .clone()
        .unwrap_or(VideoProcessingBackend::Cpu);

    // Resolve the source frame index: if the active layer range has source-range
    // fields set, map the timeline frame to the corresponding source file frame.
    let decode_frame_index = resolve_decode_frame(
        request.layer_tracks.as_deref().unwrap_or(&[]),
        request.frame_index,
    );

    // Build a temporary request with the resolved frame index for decoding.
    // The original request.frame_index is kept for cache keys and the response.
    let decode_request = if decode_frame_index != request.frame_index {
        let mut r = request.clone();
        r.frame_index = decode_frame_index;
        std::borrow::Cow::Owned(r)
    } else {
        std::borrow::Cow::Borrowed(&request)
    };

    let mut last_decode_error: Option<String> = None;
    let mut frame: Option<Vec<u8>> = None;
    for attempt in 1..=3 {
        match decode::decode_rgba_from_request(&decode_request, target_width, target_height, quality_mode) {
            Ok(decoded) => {
                if decoded.len() != (target_width as usize) * (target_height as usize) * 4 {
                    last_decode_error = Some(format!(
                        "FRAME_EMPTY_PIPELINE: invalid frame buffer size on attempt {}: got={}, expected={}, video_id={}, frame_index={}, decode_frame_index={}, has_input_path={}, has_frame_rgba={}",
                        attempt,
                        decoded.len(),
                        (target_width as usize) * (target_height as usize) * 4,
                        request.video_id,
                        request.frame_index,
                        decode_frame_index,
                        request.input_path.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false),
                        request.frame_rgba.as_ref().map(|v| !v.is_empty()).unwrap_or(false)
                    ));
                } else if decoded.iter().all(|&b| b == 0) {
                    last_decode_error = Some(format!(
                        "FRAME_EMPTY_PIPELINE: decoded frame is all-zero on attempt {}: video_id={}, frame_index={}, decode_frame_index={}, size={}x{}, has_input_path={}, has_frame_rgba={}",
                        attempt,
                        request.video_id,
                        request.frame_index,
                        decode_frame_index,
                        target_width,
                        target_height,
                        request.input_path.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false),
                        request.frame_rgba.as_ref().map(|v| !v.is_empty()).unwrap_or(false)
                    ));
                } else {
                    frame = Some(decoded);
                    break;
                }
            }
            Err(err) => {
                let reason = if err.to_lowercase().contains("not available")
                    || err.to_lowercase().contains("not ready")
                    || err.to_lowercase().contains("read_exact")
                {
                    "FRAME_NOT_READY"
                } else {
                    "FRAME_EMPTY_PIPELINE"
                };
                last_decode_error = Some(format!(
                    "{}: decode failed on attempt {}: video_id={}, frame_index={}, decode_frame_index={}, size={}x{}, has_input_path={}, has_frame_rgba={}, error={}",
                    reason,
                    attempt,
                    request.video_id,
                    request.frame_index,
                    decode_frame_index,
                    target_width,
                    target_height,
                    request.input_path.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false),
                    request.frame_rgba.as_ref().map(|v| !v.is_empty()).unwrap_or(false),
                    err
                ));
            }
        }

        if attempt < 3 {
            std::thread::sleep(std::time::Duration::from_millis(4));
        }
    }

    let frame = frame.ok_or_else(|| {
        last_decode_error.unwrap_or_else(|| {
            format!(
                "FRAME_EMPTY_PIPELINE: decode failed after retries: video_id={}, frame_index={}, decode_frame_index={}, size={}x{}",
                request.video_id,
                request.frame_index,
                decode_frame_index,
                target_width,
                target_height
            )
        })
    })?;

    let (rgba, backend_used, fallback_used) = match preferred_backend {
        VideoProcessingBackend::Cpu => {
            let cpu_result = process::process_with_cpu(
                target_width,
                target_height,
                &frame,
                &request.layer_payload,
                request.layer_tracks.as_deref().unwrap_or(&[]),
                request.frame_index,
            )?;
            (cpu_result, VideoProcessingBackend::Cpu, false)
        }
        VideoProcessingBackend::Gpu => {
            if let Some(gpu) = gpu_processor() {
                match gpu.process_frame(target_width, target_height, &frame) {
                    Ok(gpu_result) => (gpu_result, VideoProcessingBackend::Gpu, false),
                    Err(error) => {
                        log::warn!("GPU processing failed, falling back to CPU: {}", error);
                        let cpu_result = process::process_with_cpu(
                            target_width,
                            target_height,
                            &frame,
                            &request.layer_payload,
                            request.layer_tracks.as_deref().unwrap_or(&[]),
                            request.frame_index,
                        )?;
                        (cpu_result, VideoProcessingBackend::Cpu, true)
                    }
                }
            } else {
                let cpu_result = process::process_with_cpu(
                    target_width,
                    target_height,
                    &frame,
                    &request.layer_payload,
                    request.layer_tracks.as_deref().unwrap_or(&[]),
                    request.frame_index,
                )?;
                (cpu_result, VideoProcessingBackend::Cpu, true)
            }
        }
    };

    let processing_ms = started.elapsed().as_secs_f64() * 1000.0;
    cache_service().put(
        key,
        super::cache::CacheEntry {
            rgba: rgba.clone(),
            backend_used: backend_used.clone(),
            fallback_used,
            produced_index: decode_frame_index,
        },
    );

    let ffmpeg_errors = super::services::playback_streams()
        .get(&request.video_id)
        .map(|s| s.has_ffmpeg_errors())
        .unwrap_or(false);

    let response = VideoFrameResponseV1 {
        version: 1,
        video_id: request.video_id.clone(),
        frame_index: request.frame_index,
        width: target_width,
        height: target_height,
        rgba,
        cache_hit: false,
        processing_ms,
        backend_used,
        fallback_used,
        requested_index: request.frame_index,
        produced_index: decode_frame_index,
        ffmpeg_errors,
        stream_status: Some(VideoFrameStreamStatus::Ready),
        pts: None,
    };

    if let Some(app_handle) = app_handle {
        emit_binary_frame_event(app_handle, &request, &response, quality_mode, scale);
    }

    Ok(response)
}

pub fn open_playback_stream(
    video_id: String,
    input_path: String,
    fps: f64,
    width: u32,
    height: u32,
    layer_payload: Vec<image_engine::EffectLayer>,
    layer_tracks: Vec<super::types::LayerTrack>,
    layer_snapshot_hash: String,
    quality_mode: Option<String>,
    scale: Option<f32>,
) -> Result<VideoPreviewSessionResponseV1, String> {
    let preview_response = preview_session::prepare_preview_session(super::types::VideoPreviewSessionRequestV1 {
        version: 1,
        video_id: video_id.clone(),
        input_path,
        fps,
        width,
        height,
    })?;

    if let Err(error) = crate::video_processing::validate_video_playback_source(Path::new(&preview_response.active_path)) {
        let _ = preview_session::release_preview_session(&video_id);
        return Err(error);
    }

    let stream = match crate::video_runtime::playback_stream::PlaybackStream::new(
        video_id.clone(),
        preview_response.active_path.clone(),
        fps,
        preview_response.preview_width,
        preview_response.preview_height,
        0.0,
        preview_response.duration_seconds,
        quality_mode.as_deref(),
        scale,
    ) {
        Ok(stream) => stream,
        Err(error) => {
            let _ = preview_session::release_preview_session(&video_id);
            return Err(error);
        }
    };

    // Wait for initial buffering (up to 1 second)
    stream.wait_for_buffering(1000);
    log::info!("[open_playback_stream] {} buffering complete", video_id);

    super::services::playback_streams().insert(video_id.clone(), stream);

    let params = std::sync::Arc::new(super::services::PlaybackEffectParams {
        layer_payload,
        layer_tracks,
        layer_snapshot_hash,
        quality_mode: quality_mode.unwrap_or_else(|| "fast".to_string()),
        scale: scale.unwrap_or(0.25),
    });
    super::services::playback_effect_params().insert(video_id, params);

    Ok(preview_response)
}

pub fn close_playback_stream(video_id: &str) -> Result<(), String> {
    super::services::playback_streams().remove(video_id);
    super::services::playback_effect_params().remove(video_id);
    preview_session::release_preview_session(video_id)?;
    Ok(())
}

pub fn update_playback_effect_params(
    video_id: String,
    layer_payload: Vec<image_engine::EffectLayer>,
    layer_tracks: Vec<super::types::LayerTrack>,
    layer_snapshot_hash: String,
    quality_mode: Option<String>,
    scale: Option<f32>,
) -> Result<(), String> {
    let params = std::sync::Arc::new(super::services::PlaybackEffectParams {
        layer_payload,
        layer_tracks,
        layer_snapshot_hash,
        quality_mode: quality_mode.unwrap_or_else(|| "fast".to_string()),
        scale: scale.unwrap_or(0.25),
    });
    super::services::playback_effect_params().insert(video_id, params);
    Ok(())
}

pub fn pull_next_playback_frame_binary(
    video_id: &str,
) -> Result<super::types::VideoFrameResponseV1, String> {
    // Read the current clock frame only as a fallback for the response metadata.
    // The stream drives the clock — not the other way around.
    let clock_frame = clock_service().get_state().frame;

    let Some(stream) = super::services::playback_streams().get(video_id).map(|stream| stream.clone()) else {
        return Ok(waiting_playback_response(video_id, clock_frame, false));
    };
    let ffmpeg_errors = stream.has_ffmpeg_errors();

    let Some(params) = super::services::playback_effect_params().get(video_id).map(|params| params.clone()) else {
        return Ok(waiting_playback_response(video_id, clock_frame, ffmpeg_errors));
    };

    if !stream.is_warmed() {
        return Ok(waiting_playback_response(video_id, clock_frame, ffmpeg_errors));
    }

    // Pop the next available frame from the ring buffer.
    // We do NOT match by PTS — the stream owns the timing.
    // A single short retry gives the decoder a chance to produce a frame
    // without blocking the RAF loop for more than ~5ms.
    let raw_frame = stream.pop_next_frame().or_else(|| {
        std::thread::sleep(std::time::Duration::from_millis(4));
        stream.pop_next_frame()
    });

    let Some(raw_frame) = raw_frame else {
        return Ok(waiting_playback_response(video_id, clock_frame, ffmpeg_errors));
    };

    // Derive the produced frame index from the stream's PTS.
    let produced_frame_index = (raw_frame.pts * stream.fps).round() as usize;

    // The stream drives the clock: update the master clock to the frame we
    // actually decoded so the UI playhead stays in sync with what's on screen.
    // We use update_frame_from_stream (not seek) to avoid restarting the stream.
    clock_service().update_frame_from_stream(produced_frame_index);

    let raw_all_zero = raw_frame.rgba.iter().all(|&b| b == 0);

    // Guard #2: if FFmpeg produced an all-zero frame, don't send garbage pixels
    // to the frontend — tell it to keep the last good frame instead.
    if raw_all_zero {
        log::debug!(
            "[pull_next_playback_frame_binary] all-zero raw frame rejected at api layer. video_id={}, frame_index={}, raw_len={}",
            video_id,
            produced_frame_index,
            raw_frame.rgba.len(),
        );
        return Ok(waiting_playback_response(video_id, produced_frame_index, ffmpeg_errors));
    }

    let _scale = decode::effective_preview_scale(Some(&params.quality_mode), Some(params.scale));
    let started = std::time::Instant::now();

    let (mut rgba, backend_used, mut fallback_used) = {
        let cpu_result = process::process_with_cpu(
            raw_frame.width,
            raw_frame.height,
            &raw_frame.rgba,
            &params.layer_payload,
            &params.layer_tracks,
            produced_frame_index,
        )?;
        (cpu_result, VideoProcessingBackend::Cpu, false)
    };

    let processed_all_zero = rgba.iter().all(|&b| b == 0);
    if !raw_all_zero && processed_all_zero {
        log::warn!(
            "[pull_next_playback_frame_binary] processed frame became all-zero after CPU pipeline; using raw frame fallback. video_id={}, frame_index={}",
            video_id,
            produced_frame_index,
        );
        rgba = raw_frame.rgba.clone();
        fallback_used = true;
    }

    let processing_ms = started.elapsed().as_secs_f64() * 1000.0;

    // Hard guard: never let an all-zero buffer pass to frontend transport.
    if rgba.iter().all(|&b| b == 0) {
        log::debug!(
            "[pull_next_playback_frame_binary] final RGBA buffer is all-zero; returning waiting response. video_id={}, frame_index={}",
            video_id,
            produced_frame_index,
        );
        return Ok(waiting_playback_response(video_id, produced_frame_index, ffmpeg_errors));
    }

    Ok(VideoFrameResponseV1 {
        version: 1,
        video_id: video_id.to_string(),
        frame_index: produced_frame_index,
        width: raw_frame.width,
        height: raw_frame.height,
        rgba,
        cache_hit: false,
        processing_ms,
        backend_used,
        fallback_used,
        requested_index: produced_frame_index,
        produced_index: produced_frame_index,
        ffmpeg_errors,
        stream_status: Some(VideoFrameStreamStatus::Ready),
        pts: Some(raw_frame.pts),
    })
}

pub fn render_video_job_v2(request: VideoRenderJobRequestV1) -> Result<VideoRenderJobResponseV1, String> {
    job_service().enqueue(request)
}

pub fn cancel_video_job_v2(job_id: &str) -> Result<VideoRenderJobResponseV1, String> {
    job_service().cancel(job_id)
}

pub fn get_video_job_progress_v2(job_id: &str) -> Result<VideoRenderJobResponseV1, String> {
    job_service().get_progress(job_id)
}

pub fn list_video_jobs_v2() -> Vec<VideoRenderJobResponseV1> {
    job_service().list_jobs()
}

pub fn update_filter_params_v2() {
    cache_service().clear();
}

pub fn reorder_effect_layers_v2(
    layers: Vec<image_engine::EffectLayer>,
    from_index: usize,
    to_index: usize,
) -> Result<Vec<image_engine::EffectLayer>, String> {
    image_engine::reorder_layers(layers, from_index, to_index)
}
