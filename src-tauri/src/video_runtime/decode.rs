use super::types::VideoFrameRequestV1;
use super::preview_session;
use image::imageops::FilterType;
use image::ImageFormat;
use std::process::{Command, Stdio};
use crate::video_processing::{
    check_ffmpeg_presence,
    check_ffprobe_presence,
    resolve_media_binary_path,
};

pub fn effective_preview_scale(quality_mode: Option<&str>, requested_scale: Option<f32>) -> f32 {
    let quality_mode = quality_mode.unwrap_or("fast");
    let mut scale = requested_scale.unwrap_or(if quality_mode == "fast" { 0.25 } else { 1.0 });

    if !scale.is_finite() || scale <= 0.0 {
        scale = if quality_mode == "fast" { 0.25 } else { 1.0 };
    }

    scale = scale.min(1.0);

    if quality_mode == "fast" {
        scale = scale.min(0.25);
    }

    scale
}

pub fn preview_dimensions(width: u32, height: u32, scale: f32) -> (u32, u32) {
    let safe_scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    let target_width = ((width as f64) * f64::from(safe_scale)).round().max(1.0) as u32;
    let target_height = ((height as f64) * f64::from(safe_scale)).round().max(1.0) as u32;
    (target_width, target_height)
}

fn resize_rgba_buffer(
    rgba: Vec<u8>,
    source_width: u32,
    source_height: u32,
    target_width: u32,
    target_height: u32,
    quality_mode: &str,
) -> Result<Vec<u8>, String> {
    if source_width == target_width && source_height == target_height {
        return Ok(rgba);
    }

    let image = image::RgbaImage::from_raw(source_width, source_height, rgba)
        .ok_or_else(|| {
            format!(
                "RGBA buffer does not match {}x{} dimensions",
                source_width, source_height
            )
        })?;

    let filter = if quality_mode == "fast" {
        FilterType::Nearest
    } else {
        FilterType::Triangle
    };

    Ok(image::imageops::resize(&image, target_width, target_height, filter).into_raw())
}

pub fn decode_rgba_from_request(
    request: &VideoFrameRequestV1,
    target_width: u32,
    target_height: u32,
    quality_mode: &str,
) -> Result<Vec<u8>, String> {
    if let Some(rgba) = &request.frame_rgba {
        let expected_len = (request.width as usize)
            .checked_mul(request.height as usize)
            .and_then(|px| px.checked_mul(4))
            .ok_or_else(|| "Frame dimensions overflow".to_string())?;

        if rgba.len() != expected_len {
            return Err(format!(
                "frame_rgba length {} does not match {}x{} RGBA (expected {})",
                rgba.len(),
                request.width,
                request.height,
                expected_len
            ));
        }
        let resized = resize_rgba_buffer(
            rgba.clone(),
            request.width,
            request.height,
            target_width,
            target_height,
            quality_mode,
        )?;

        if resized.iter().all(|&b| b == 0) {
            if let (Some(path), Some(fps)) = (&request.input_path, request.fps) {
                log::warn!(
                    "[decode_rgba_from_request] frontend frame_rgba is all-zero; falling back to decode_single_frame for video_id={}, frame_index={}, size={}x{}",
                    request.video_id,
                    request.frame_index,
                    target_width,
                    target_height
                );
                return decode_single_frame(path, request.frame_index, fps, target_width, target_height);
            }
            return Err(format!(
                "Frontend-provided frame_rgba is all-zero and no input_path+fps fallback is available: video_id={}, frame_index={}, request_size={}x{}, target_size={}x{}",
                request.video_id,
                request.frame_index,
                request.width,
                request.height,
                target_width,
                target_height
            ));
        }

        return Ok(resized);
    }

    if quality_mode == "fast"
        && request.input_path.is_some()
        && request.fps.is_some()
        && request.frame_rgba.is_none()
    {
        let preview = preview_session::decode_fast_preview(request)?;
        let resized = resize_rgba_buffer(
            preview.rgba,
            preview.width,
            preview.height,
            target_width,
            target_height,
            quality_mode,
        )?;

        if resized.iter().all(|&b| b == 0) {
            if let (Some(path), Some(fps)) = (&request.input_path, request.fps) {
                log::warn!(
                    "[decode_rgba_from_request] fast preview decode returned all-zero frame; falling back to decode_single_frame for video_id={}, frame_index={}, size={}x{}",
                    request.video_id,
                    request.frame_index,
                    target_width,
                    target_height
                );
                return decode_single_frame(path, request.frame_index, fps, target_width, target_height);
            }
            return Err(format!(
                "Fast preview decode returned all-zero frame: video_id={}, frame_index={}, size={}x{}",
                request.video_id,
                request.frame_index,
                target_width,
                target_height
            ));
        }

        return Ok(resized);
    }

    // Backend-side decoding
    if let (Some(path), Some(fps)) = (&request.input_path, request.fps) {
        return decode_single_frame(path, request.frame_index, fps, target_width, target_height);
    }

    Err("Either frame_rgba or input_path+fps must be provided for decoding".to_string())
}

pub fn decode_single_frame(
    path: &str,
    frame_index: usize,
    fps: f64,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, String> {
    check_ffmpeg_presence()?;
    let safe_fps = if fps > 0.0 { fps } else { 1.0 };
    let timestamp = (frame_index as f64) / safe_fps;
    let ffmpeg = resolve_media_binary_path("ffmpeg")?;

    let expected_len = (width as usize) * (height as usize) * 4;
    let vf_filter = format!("format=rgba,scale={}:{}:flags=neighbor", width, height);

    let run_png_fallback = || -> Result<Vec<u8>, String> {
        let output = Command::new(&ffmpeg)
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-hwaccel",
                "none",
                "-flags2",
                "+export_mvs",
                "-analyzeduration",
                "10M",
                "-probesize",
                "10M",
                "-ss",
                &format!("{:.6}", timestamp),
                "-i",
                path,
                "-an",
                "-sn",
                "-dn",
                "-frames:v",
                "1",
                "-vf",
                &vf_filter,
                "-f",
                "image2pipe",
                "-vcodec",
                "png",
                "-",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| format!("Failed to execute ffmpeg PNG fallback: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("ffmpeg PNG fallback failed: {}", err));
        }

        let img = image::load_from_memory_with_format(&output.stdout, ImageFormat::Png)
            .map_err(|e| format!("Failed to decode PNG fallback frame: {}", e))?;
        let rgba = img.to_rgba8().into_raw();

        if rgba.iter().all(|&b| b == 0) {
            return Err("PNG fallback returned all-zero frame".to_string());
        }

        Ok(rgba)
    };

    let run_decode = |seek_before_input: bool| -> Result<std::process::Output, String> {
        let mut args: Vec<String> = vec![
            "-hide_banner".to_string(),
            "-loglevel".to_string(),
            "error".to_string(),
            "-hwaccel".to_string(),
            "none".to_string(),
            "-flags2".to_string(),
            "+export_mvs".to_string(),
            "-analyzeduration".to_string(),
            "10M".to_string(),
            "-probesize".to_string(),
            "10M".to_string(),
            "-fflags".to_string(),
            "+genpts+discardcorrupt".to_string(),
            "-avoid_negative_ts".to_string(),
            "make_zero".to_string(),
            "-an".to_string(),
            "-sn".to_string(),
            "-dn".to_string(),
        ];

        if seek_before_input {
            args.push("-ss".to_string());
            args.push(format!("{:.6}", timestamp));
        }

        args.push("-i".to_string());
        args.push(path.to_string());

        if !seek_before_input {
            args.push("-ss".to_string());
            args.push(format!("{:.6}", timestamp));
        }

        args.extend([
            "-frames:v".to_string(),
            "1".to_string(),
            "-vf".to_string(),
            vf_filter.clone(),
            "-f".to_string(),
            "rawvideo".to_string(),
            "-pix_fmt".to_string(),
            "rgba".to_string(),
            "-".to_string(),
        ]);

        Command::new(&ffmpeg)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| format!("Failed to execute ffmpeg: {}", e))
    };

    // Fast seek path first (-ss before -i), then accurate fallback (-ss after -i)
    // when frame data looks invalid/all-zero.
    for seek_before_input in [true, false] {
        let output = run_decode(seek_before_input)?;

        if !output.status.success() {
            if !seek_before_input {
                let err = String::from_utf8_lossy(&output.stderr);
                return Err(format!("ffmpeg failed: {}", err));
            }
            continue;
        }

        if output.stdout.len() != expected_len {
            if !seek_before_input {
                return Err(format!(
                    "Decoded frame size mismatch: got {}, expected {}",
                    output.stdout.len(),
                    expected_len
                ));
            }
            continue;
        }

        if output.stdout.iter().all(|&b| b == 0) {
            log::warn!(
                "[decode_single_frame] all-zero frame detected for path={}, frame_index={}, size={}x{}, seek_before_input={}",
                path,
                frame_index,
                width,
                height,
                seek_before_input
            );
            if !seek_before_input {
                return Err(format!(
                    "Decoded frame is all-zero after both seek strategies: path={}, frame_index={}, size={}x{}",
                    path,
                    frame_index,
                    width,
                    height
                ));
            }
            continue;
        }

        return Ok(output.stdout);
    }

    // Last-resort path: decode a single PNG frame and convert to RGBA bytes.
    // This is slower than rawvideo, but robust against raw pipe anomalies.
    let png_rgba = run_png_fallback()?;
    if png_rgba.iter().all(|&b| b == 0) {
        Err(format!(
            "PNG fallback also produced all-zero RGBA frame: path={}, frame_index={}, size={}x{}",
            path,
            frame_index,
            width,
            height
        ))
    } else {
        log::warn!(
            "[decode_single_frame] rawvideo seek decode failed; using PNG fallback for path={}, frame_index={}, size={}x{}",
            path,
            frame_index,
            width,
            height
        );
        Ok(png_rgba)
    }
}

pub fn generate_thumbnails(
    path: &str,
    count: usize,
    width: u32,
    height: u32,
) -> Result<Vec<Vec<u8>>, String> {
    check_ffmpeg_presence()?;
    check_ffprobe_presence()?;
    let ffprobe = resolve_media_binary_path("ffprobe")?;
    let ffmpeg = resolve_media_binary_path("ffmpeg")?;
    // Get video duration first to calculate intervals
    let probe = Command::new(&ffprobe)
        .args([
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path,
        ])
        .output()
        .map_err(|e| format!("Failed to execute ffprobe: {}", e))?;

    let duration: f64 = String::from_utf8_lossy(&probe.stdout)
        .trim()
        .parse()
        .map_err(|e| format!("Failed to parse duration: {}", e))?;

    let mut thumbnails = Vec::with_capacity(count);
    let interval = duration / (count as f64);

    for i in 0..count {
        let timestamp = (i as f64) * interval;
        // Use a faster seek for thumbnails
        let output = Command::new(&ffmpeg)
            .args([
                "-y",
                "-hwaccel", "none",
                "-ss", &format!("{:.4}", timestamp),
                "-i", path,
                "-vframes", "1",
                "-s", &format!("{}x{}", width, height),
                "-f", "image2pipe",
                "-vcodec", "rawvideo",
                "-pix_fmt", "rgba",
                "-",
            ])
            .output()
            .map_err(|e| format!("Failed to execute ffmpeg for thumbnail {}: {}", i, e))?;

        if output.status.success() {
            thumbnails.push(output.stdout);
        }
    }

    Ok(thumbnails)
}

#[cfg(test)]
mod tests {
    use super::{effective_preview_scale, preview_dimensions};

    #[test]
    fn fast_preview_caps_default_scale_to_quarter_res() {
        let scale = effective_preview_scale(Some("fast"), None);
        assert!((scale - 0.25).abs() < f32::EPSILON);

        let scale = effective_preview_scale(Some("fast"), Some(0.75));
        assert!((scale - 0.25).abs() < f32::EPSILON);
    }

    #[test]
    fn accurate_preview_keeps_requested_scale() {
        let scale = effective_preview_scale(Some("accurate"), Some(0.5));
        assert!((scale - 0.5).abs() < f32::EPSILON);
    }

    #[test]
    fn preview_dimensions_never_drop_below_one_pixel() {
        assert_eq!(preview_dimensions(3, 2, 0.25), (1, 1));
        assert_eq!(preview_dimensions(0, 0, 1.0), (1, 1));
    }
}

