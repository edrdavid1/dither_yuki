// Tauri commands for image processing

use crate::image_engine::{self, AlgorithmRegistry, ImageData};
use crate::video_processing;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternPresetExportRequest {
    pub name: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub algorithm: String,
    pub intensity: f32,
    pub params: serde_json::Value,
    pub tags: Vec<String>,
    pub palette_name: Option<String>,
    pub palette: Option<Vec<[u8; 3]>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternPresetExportResult {
    pub file_name: String,
    pub file_extension: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaletteExportRequest {
    pub name: Option<String>,
    pub palette_name: Option<String>,
    pub palette: Option<Vec<[u8; 3]>>,
    pub format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaletteExportResult {
    pub file_name: String,
    pub file_extension: String,
    pub color_count: usize,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaletteImportResult {
    pub colors: Vec<[u8; 3]>,
    pub color_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReorderLayersRequest {
    pub layers: Vec<image_engine::EffectLayer>,
    pub from_index: usize,
    pub to_index: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessImageRequest {
    /// Raw RGBA pixel data (width × height × 4 bytes).
    pub image_bytes: Vec<u8>,
    pub width: u32,
    pub height: u32,
    /// Ordered list of effect layers to apply via the full Rust pipeline.
    pub layers: Vec<image_engine::EffectLayer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessImageResult {
    pub width: u32,
    pub height: u32,
    /// Processed RGBA pixel data (width × height × 4 bytes).
    pub rgba: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessVideoFramesRequest {
    pub width: u32,
    pub height: u32,
    pub frames: Vec<Vec<u8>>,
    pub layers: Vec<image_engine::EffectLayer>,
    pub temporal: Option<image_engine::TemporalVariationConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessVideoFramesResult {
    pub width: u32,
    pub height: u32,
    pub frame_count: usize,
    pub processed_frames: Vec<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessVideoFramesPackedRequest {
    pub width: u32,
    pub height: u32,
    pub frame_count: usize,
    pub frame_size: usize,
    pub frames_blob: Vec<u8>,
    pub layers: Vec<image_engine::EffectLayer>,
    pub temporal: Option<image_engine::TemporalVariationConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessVideoFramesPackedResult {
    pub width: u32,
    pub height: u32,
    pub frame_count: usize,
    pub frame_size: usize,
    pub processed_frames_blob: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportVideoFramesRequest {
    pub name: Option<String>,
    pub width: u32,
    pub height: u32,
    pub frames: Vec<Vec<u8>>,
    pub format: Option<String>,
    pub fps: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportVideoFramesResult {
    pub file_name: String,
    pub file_extension: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportSvgRequest {
    pub name: Option<String>,
    pub width: u32,
    pub height: u32,
    pub frame: Vec<u8>,
    pub pixel_size: Option<u32>,
    pub shape: Option<String>, // "square" | "circle"
    pub include_transparent: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportSvgResult {
    pub file_name: String,
    pub file_extension: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderStillAnimationRequest {
    pub width: u32,
    pub height: u32,
    pub frame: Vec<u8>,
    pub frame_count: u32,
    pub layers: Vec<image_engine::EffectLayer>,
    pub temporal: Option<image_engine::TemporalVariationConfig>,
    pub tracks: Vec<image_engine::AnimationTrack>,
    pub mode: Option<image_engine::AnimationRenderMode>,
    pub quick_stride: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderStillAnimationResult {
    pub width: u32,
    pub height: u32,
    pub frame_count: usize,
    pub rendered_frame_indices: Vec<u32>,
    pub processed_frames: Vec<Vec<u8>>,
}

fn slugify_name(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if ch.is_whitespace() || ch == '-' || ch == '_' {
            if !out.ends_with('-') {
                out.push('-');
            }
        }
    }

    let slug = out.trim_matches('-').to_string();
    if slug.is_empty() {
        "pattern-preset".to_string()
    } else {
        slug
    }
}

#[tauri::command]
pub async fn process_image(request: ProcessImageRequest) -> Result<ProcessImageResult, String> {
    let expected = (request.width as usize)
        .checked_mul(request.height as usize)
        .and_then(|px| px.checked_mul(4))
        .ok_or_else(|| "Image dimensions overflow".to_string())?;

    if request.image_bytes.len() != expected {
        return Err(format!(
            "image_bytes length {} does not match {}×{} RGBA (expected {} bytes)",
            request.image_bytes.len(),
            request.width,
            request.height,
            expected
        ));
    }

    if request.layers.is_empty() {
        // No-op: return the source unchanged
        return Ok(ProcessImageResult {
            width: request.width,
            height: request.height,
            rgba: request.image_bytes,
        });
    }

    let prepared = image_engine::prepare_video_layers(&request.layers)?;
    let temporal = image_engine::TemporalVariationConfig::default();

    let rgba = image_engine::process_single_video_frame(
        request.width,
        request.height,
        &request.image_bytes,
        &prepared,
        &temporal,
        0,
        1,
    )?;

    Ok(ProcessImageResult {
        width: request.width,
        height: request.height,
        rgba,
    })
}

#[tauri::command]
pub async fn list_algorithms() -> Result<Vec<String>, String> {
    Ok(AlgorithmRegistry::list_all()
        .into_iter()
        .map(|name| name.to_string())
        .collect())
}

#[tauri::command]
pub async fn list_palettes() -> Result<Vec<String>, String> {
    Ok(image_engine::palettes::list_all_names()
        .into_iter()
        .map(|name| name.to_string())
        .collect())
}

#[tauri::command]
pub async fn list_shareable_pattern_algorithms() -> Result<Vec<String>, String> {
    Ok(AlgorithmRegistry::list_all()
        .into_iter()
        .filter(|name| image_engine::is_shareable_pattern_algorithm(name))
        .map(|name| name.to_string())
        .collect())
}

#[tauri::command]
pub async fn export_pattern_preset(
    request: PatternPresetExportRequest,
) -> Result<PatternPresetExportResult, String> {
    if !image_engine::is_shareable_pattern_algorithm(&request.algorithm) {
        return Err(format!(
            "Algorithm '{}' cannot be exported as a pattern preset",
            request.algorithm
        ));
    }

    let palette = match (request.palette.clone(), request.palette_name.clone()) {
        (Some(palette), _) if !palette.is_empty() => palette,
        (_, Some(name)) => image_engine::palettes::get_palette(&name)
            .ok_or_else(|| format!("Unknown palette: {name}"))?,
        _ => {
            return Err(
                "Provide either 'palette' (custom colors) or 'paletteName' (built-in palette)"
                    .to_string(),
            )
        }
    };

    let preset = image_engine::PatternPreset {
        name: request.name.clone(),
        description: request.description.clone(),
        author: request.author.clone(),
        algorithm: request.algorithm.clone(),
        palette,
        intensity: request.intensity,
        params: request.params.clone(),
        tags: request.tags.clone(),
    };

    let file = image_engine::PatternPresetFile::new(preset);
    file.validate()?;

    Ok(PatternPresetExportResult {
        file_name: format!("{}.dyuki", slugify_name(&request.name)),
        file_extension: "dyuki".to_string(),
        bytes: file.to_bytes()?,
    })
}

#[tauri::command]
pub async fn import_pattern_preset(file_bytes: Vec<u8>) -> Result<image_engine::PatternPreset, String> {
    let file = image_engine::PatternPresetFile::from_bytes(&file_bytes)?;
    Ok(file.preset)
}

#[tauri::command]
pub async fn extract_palette(
    image_bytes: Vec<u8>,
    color_count: u32,
    method: String,
) -> Result<Vec<[u8; 3]>, String> {
    let width = 256u32;
    let height = 256u32;
    let image = ImageData::from_rgba(width, height, image_bytes);

    let method = image_engine::QuantizationMethod::from_str(&method)?;
    image_engine::extract_palette(&image, color_count, method)
}

#[tauri::command]
pub async fn export_palette(request: PaletteExportRequest) -> Result<PaletteExportResult, String> {
    let palette = match (request.palette.clone(), request.palette_name.clone()) {
        (Some(palette), _) if !palette.is_empty() => palette,
        (_, Some(name)) => image_engine::palettes::get_palette(&name)
            .ok_or_else(|| format!("Unknown palette: {name}"))?,
        _ => {
            return Err(
                "Provide either 'palette' (custom colors) or 'paletteName' (built-in palette)"
                    .to_string(),
            )
        }
    };

    let format = image_engine::PaletteFormat::from_str(&request.format)?;
    let palette_name = request
        .name
        .clone()
        .or_else(|| request.palette_name.clone())
        .unwrap_or_else(|| "palette".to_string());
    let bytes = image_engine::export_palette(&palette, Some(&palette_name), format)?;

    Ok(PaletteExportResult {
        file_name: format!("{}.{}", slugify_name(&palette_name), format.extension()),
        file_extension: format.extension().to_string(),
        color_count: palette.len(),
        bytes,
    })
}

#[tauri::command]
pub async fn import_palette(file_bytes: Vec<u8>, format: String) -> Result<PaletteImportResult, String> {
    let format = image_engine::PaletteFormat::from_str(&format)?;
    let colors = image_engine::import_palette(&file_bytes, format)?;
    let color_count = colors.len();

    Ok(PaletteImportResult { colors, color_count })
}

#[tauri::command]
pub async fn reorder_effect_layers(request: ReorderLayersRequest) -> Result<Vec<image_engine::EffectLayer>, String> {
    image_engine::reorder_layers(request.layers, request.from_index, request.to_index)
}

#[tauri::command]
pub async fn process_video_frames(
    request: ProcessVideoFramesRequest,
) -> Result<ProcessVideoFramesResult, String> {
    let batch = image_engine::VideoFrameBatchRequest {
        width: request.width,
        height: request.height,
        frames: request.frames,
        layers: request.layers,
        temporal: request.temporal.unwrap_or_default(),
    };

    let result = image_engine::process_frame_batch(batch)?;

    Ok(ProcessVideoFramesResult {
        width: result.width,
        height: result.height,
        frame_count: result.frame_count,
        processed_frames: result.processed_frames,
    })
}

#[tauri::command]
pub async fn process_video_frames_packed(
    request: ProcessVideoFramesPackedRequest,
) -> Result<ProcessVideoFramesPackedResult, String> {
    let batch = image_engine::VideoFrameBatchPackedRequest {
        width: request.width,
        height: request.height,
        frame_count: request.frame_count,
        frame_size: request.frame_size,
        frames_blob: request.frames_blob,
        layers: request.layers,
        temporal: request.temporal.unwrap_or_default(),
    };

    let result = image_engine::process_frame_batch_packed(batch)?;

    Ok(ProcessVideoFramesPackedResult {
        width: result.width,
        height: result.height,
        frame_count: result.frame_count,
        frame_size: result.frame_size,
        processed_frames_blob: result.processed_frames_blob,
    })
}

#[tauri::command]
pub async fn export_video_frames(request: ExportVideoFramesRequest) -> Result<ExportVideoFramesResult, String> {
    let format = request
        .format
        .unwrap_or_else(|| "dykframes".to_string())
        .to_ascii_lowercase();

    match format.as_str() {
        "gif" => {
            let exported = video_processing::export_gif_from_frames(
                request.name,
                request.width,
                request.height,
                request.frames,
                request.fps,
            )?;

            Ok(ExportVideoFramesResult {
                file_name: exported.file_name,
                file_extension: exported.file_extension,
                bytes: exported.bytes,
            })
        }
        "dykframes" => {
            let batch_result = image_engine::VideoFrameBatchResult {
                width: request.width,
                height: request.height,
                frame_count: request.frames.len(),
                processed_frames: request.frames,
            };

            let pack_name = request
                .name
                .as_deref()
                .unwrap_or("video-export");
            let export = image_engine::export_frames_pack(&batch_result, pack_name)?;

            Ok(ExportVideoFramesResult {
                file_name: export.file_name,
                file_extension: export.file_extension,
                bytes: export.bytes,
            })
        }
        other => Err(format!(
            "Unsupported export format: {}. Supported formats: gif, dykframes",
            other
        )),
    }
}

#[tauri::command]
pub async fn export_svg(request: ExportSvgRequest) -> Result<ExportSvgResult, String> {
    if request.width == 0 || request.height == 0 {
        return Err("width/height must be > 0".to_string());
    }

    let expected_len = (request.width as usize)
        .checked_mul(request.height as usize)
        .and_then(|px| px.checked_mul(4))
        .ok_or_else(|| "Frame size overflow".to_string())?;

    if request.frame.len() != expected_len {
        return Err(format!(
            "Invalid RGBA frame length: got {}, expected {}",
            request.frame.len(),
            expected_len
        ));
    }

    let pixel_size = request.pixel_size.unwrap_or(1).max(1);
    let shape = request.shape.unwrap_or_else(|| "square".to_string());
    let include_transparent = request.include_transparent.unwrap_or(false);

    let svg_width = request.width * pixel_size;
    let svg_height = request.height * pixel_size;

    let mut svg = String::new();
    svg.push_str(&format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}\" height=\"{}\" viewBox=\"0 0 {} {}\" shape-rendering=\"crispEdges\">",
        svg_width, svg_height, svg_width, svg_height
    ));

    for y in 0..request.height {
        for x in 0..request.width {
            let idx = ((y * request.width + x) * 4) as usize;
            let r = request.frame[idx];
            let g = request.frame[idx + 1];
            let b = request.frame[idx + 2];
            let a = request.frame[idx + 3];

            if a == 0 && !include_transparent {
                continue;
            }

            let fill = format!("#{:02x}{:02x}{:02x}", r, g, b);
            let opacity = (a as f32 / 255.0).clamp(0.0, 1.0);
            let px = x * pixel_size;
            let py = y * pixel_size;

            match shape.as_str() {
                "circle" => {
                    let radius = pixel_size as f32 * 0.5;
                    let cx = px as f32 + radius;
                    let cy = py as f32 + radius;
                    svg.push_str(&format!(
                        "<circle cx=\"{}\" cy=\"{}\" r=\"{}\" fill=\"{}\" fill-opacity=\"{}\" />",
                        cx, cy, radius, fill, opacity
                    ));
                }
                _ => {
                    svg.push_str(&format!(
                        "<rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" fill=\"{}\" fill-opacity=\"{}\" />",
                        px, py, pixel_size, pixel_size, fill, opacity
                    ));
                }
            }
        }
    }

    svg.push_str("</svg>");

    let name = request.name.unwrap_or_else(|| "vector-export".to_string());

    Ok(ExportSvgResult {
        file_name: format!("{}.svg", slugify_name(&name)),
        file_extension: "svg".to_string(),
        bytes: svg.into_bytes(),
    })
}

#[tauri::command]
pub async fn list_temporal_variation_modes() -> Result<Vec<String>, String> {
    Ok(image_engine::list_temporal_variation_modes()
        .into_iter()
        .map(|mode| mode.to_string())
        .collect())
}

#[tauri::command]
pub async fn list_animation_easing_modes() -> Result<Vec<String>, String> {
    Ok(image_engine::list_animation_easing_modes()
        .into_iter()
        .map(|mode| mode.to_string())
        .collect())
}

#[tauri::command]
pub async fn list_animation_parameter_modes() -> Result<Vec<String>, String> {
    Ok(image_engine::list_animation_parameter_modes()
        .into_iter()
        .map(|mode| mode.to_string())
        .collect())
}

#[tauri::command]
pub async fn render_still_animation(
    request: RenderStillAnimationRequest,
) -> Result<RenderStillAnimationResult, String> {
    let result = image_engine::render_still_image_animation(image_engine::StillImageAnimationRequest {
        width: request.width,
        height: request.height,
        frame: request.frame,
        frame_count: request.frame_count,
        layers: request.layers,
        temporal: request.temporal.unwrap_or_default(),
        tracks: request.tracks,
        mode: request.mode,
        quick_stride: request.quick_stride,
    })?;

    Ok(RenderStillAnimationResult {
        width: result.width,
        height: result.height,
        frame_count: result.frame_count,
        rendered_frame_indices: result.rendered_frame_indices,
        processed_frames: result.processed_frames,
    })
}

#[tauri::command]
pub async fn process_video_file(
    request: video_processing::ProcessVideoFileRequest,
) -> Result<String, String> {
    video_processing::start_video_file_job(request)
}

#[tauri::command]
pub async fn process_video_file_bytes(
    request: video_processing::ProcessVideoFileBytesRequest,
) -> Result<String, String> {
    video_processing::start_video_file_job_from_bytes(request)
}

#[tauri::command]
pub async fn probe_video_file_metadata(
    input_path: String,
) -> Result<video_processing::VideoFileMetadata, String> {
    video_processing::probe_video_file_metadata(&input_path)
}

#[tauri::command]
pub async fn check_dependencies() -> Result<video_processing::DependencyStatus, String> {
    Ok(video_processing::check_dependencies())
}

#[tauri::command]
pub async fn process_still_animation_file(
    request: video_processing::ProcessStillAnimationFileRequest,
) -> Result<String, String> {
    video_processing::start_still_animation_file_job(request)
}

#[tauri::command]
pub async fn get_video_processing_progress(
    job_id: String,
) -> Result<video_processing::VideoJobProgress, String> {
    video_processing::get_video_job_progress(&job_id)
}

#[tauri::command]
pub async fn cancel_video_processing_job(
    job_id: String,
) -> Result<video_processing::VideoJobProgress, String> {
    video_processing::cancel_video_job(&job_id)
}

#[tauri::command]
pub async fn export_video_frames_pack_from_dir(
    request: video_processing::ExportVideoFramesPackFromFileRequest,
) -> Result<video_processing::ExportVideoFramesPackFromFileResult, String> {
    video_processing::export_video_frames_pack_from_dir(request)
}

#[tauri::command]
pub async fn get_default_output_path(file_name: String) -> Result<String, String> {
    Ok(resolve_default_output_path(&file_name)?.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn save_bytes_to_default_location(file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    let output = resolve_default_output_path(&file_name)?;
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory {}: {e}", parent.display()))?;
    }

    fs::write(&output, bytes)
        .map_err(|e| format!("Failed to write output file {}: {e}", output.display()))?;

    Ok(output.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn save_bytes_to_path(file_path: String, bytes: Vec<u8>) -> Result<String, String> {
    let output = PathBuf::from(file_path.trim());
    if output.as_os_str().is_empty() {
        return Err("file_path cannot be empty".to_string());
    }

    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory {}: {e}", parent.display()))?;
    }

    fs::write(&output, bytes)
        .map_err(|e| format!("Failed to write output file {}: {e}", output.display()))?;

    Ok(output.to_string_lossy().to_string())
}

fn resolve_default_output_path(file_name: &str) -> Result<PathBuf, String> {
    let sanitized = file_name
        .trim()
        .chars()
        .map(|ch| if matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') { '_' } else { ch })
        .collect::<String>();

    let file_name = if sanitized.is_empty() {
        format!("dither-yuki-output-{}.bin", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0))
    } else {
        sanitized
    };

    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok();

    let mut base = home
        .map(|value| PathBuf::from(value).join("Downloads"))
        .unwrap_or_else(std::env::temp_dir);

    if let Err(err) = std::fs::create_dir_all(&base) {
        let temp = std::env::temp_dir();
        std::fs::create_dir_all(&temp)
            .map_err(|fallback_err| format!("Failed to create output dirs: {err}; fallback error: {fallback_err}"))?;
        base = temp;
    }

    Ok(base.join(file_name))
}
