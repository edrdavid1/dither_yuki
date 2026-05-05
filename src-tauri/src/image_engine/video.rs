use serde::{Deserialize, Serialize};

use super::{AlgorithmRegistry, Effect, FrameContext, ImageData};
use super::color::find_closest_color_oklab;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectLayer {
    pub id: String,
    pub algorithm: String,
    pub enabled: bool,
    pub intensity: f32,
    pub blend_mode: Option<String>,
    pub opacity: Option<f32>,
    pub palette_name: Option<String>,
    pub palette: Option<Vec<[u8; 3]>>,
    pub contrast: Option<f32>,
    pub brightness: Option<f32>,
    pub saturation: Option<f32>,
    pub pixel_size: Option<u32>,
    pub blur: Option<f32>,
    pub sharpness: Option<f32>,
    pub noise: Option<f32>,
    pub glitch_type: Option<String>,
    pub sort_by: Option<String>,
    pub masking: Option<String>,
    pub threshold_min: Option<f32>,
    pub threshold_max: Option<f32>,
    pub direction_angle: Option<f32>,
    pub sort_length: Option<u32>,
    pub block_size: Option<u32>,
    pub chaos: Option<f32>,
    pub quantization: Option<f32>,
    pub red_shift_x: Option<i32>,
    pub red_shift_y: Option<i32>,
    pub green_shift_x: Option<i32>,
    pub green_shift_y: Option<i32>,
    pub blue_shift_x: Option<i32>,
    pub blue_shift_y: Option<i32>,
    pub global_rgb_shift_intensity: Option<f32>,
    pub slice_count: Option<u32>,
    pub max_offset: Option<i32>,
    pub randomness: Option<f32>,
    pub scanline_thickness: Option<u32>,
    pub scanline_gap: Option<u32>,
    pub flicker: Option<f32>,
    pub curvature: Option<f32>,
    pub snap_to_palette: Option<bool>,
    pub palette_mix: Option<f32>,
    pub global_seed: Option<u64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TemporalVariationMode {
    Pulse,
    Sine,
    Triangle,
    Saw,
    Step,
    Strobe,
    Drift,
    Bounce,
    Jitter,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemporalVariationConfig {
    pub enabled: bool,
    pub mode: TemporalVariationMode,
    /// Range: 0..=100. Defines modulation depth.
    pub amount: f32,
    /// Multiplier for how fast modulation changes over frame timeline.
    pub speed: f32,
    /// Extra phase offset in timeline domain.
    pub phase: f32,
}

impl Default for TemporalVariationConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            mode: TemporalVariationMode::Sine,
            amount: 0.0,
            speed: 1.0,
            phase: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoFrameBatchRequest {
    pub width: u32,
    pub height: u32,
    pub frames: Vec<Vec<u8>>,
    pub layers: Vec<EffectLayer>,
    pub temporal: TemporalVariationConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoFrameBatchPackedRequest {
    pub width: u32,
    pub height: u32,
    pub frame_count: usize,
    pub frame_size: usize,
    pub frames_blob: Vec<u8>,
    pub layers: Vec<EffectLayer>,
    pub temporal: TemporalVariationConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoFrameBatchResult {
    pub width: u32,
    pub height: u32,
    pub frame_count: usize,
    pub processed_frames: Vec<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoFrameBatchPackedResult {
    pub width: u32,
    pub height: u32,
    pub frame_count: usize,
    pub frame_size: usize,
    pub processed_frames_blob: Vec<u8>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AnimationRenderMode {
    Quick,
    Rendered,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AnimationEasing {
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum AnimationParameter {
    LayerIntensity { layer_id: String },
    TemporalAmount,
    TemporalSpeed,
    TemporalPhase,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationTrack {
    pub id: String,
    pub parameter: AnimationParameter,
    pub from: f32,
    pub to: f32,
    pub start_frame: u32,
    pub end_frame: u32,
    pub easing: AnimationEasing,
    pub looped: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StillImageAnimationRequest {
    pub width: u32,
    pub height: u32,
    pub frame: Vec<u8>,
    pub frame_count: u32,
    pub layers: Vec<EffectLayer>,
    pub temporal: TemporalVariationConfig,
    pub tracks: Vec<AnimationTrack>,
    pub mode: Option<AnimationRenderMode>,
    pub quick_stride: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StillImageAnimationResult {
    pub width: u32,
    pub height: u32,
    pub frame_count: usize,
    pub rendered_frame_indices: Vec<u32>,
    pub processed_frames: Vec<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportedFramePack {
    pub file_name: String,
    pub file_extension: String,
    pub bytes: Vec<u8>,
}

pub fn list_temporal_variation_modes() -> Vec<&'static str> {
    vec![
        "pulse",
        "sine",
        "triangle",
        "saw",
        "step",
        "strobe",
        "drift",
        "bounce",
        "jitter",
    ]
}

pub fn list_animation_easing_modes() -> Vec<&'static str> {
    vec!["linear", "ease-in", "ease-out", "ease-in-out"]
}

pub fn list_animation_parameter_modes() -> Vec<&'static str> {
    vec![
        "layer-intensity",
        "temporal-amount",
        "temporal-speed",
        "temporal-phase",
    ]
}

#[derive(Debug, Clone)]
struct ResolvedLayer {
    id: String,
    algorithm: String,
    enabled: bool,
    intensity: f32,
    blend_mode: BlendMode,
    opacity: f32,
    palette: Vec<[u8; 3]>,
    contrast: f32,
    brightness: f32,
    saturation: f32,
    pixel_size: u32,
    blur: f32,
    sharpness: f32,
    noise: f32,
    glitch_type: String,
    sort_by: String,
    masking: String,
    threshold_min: f32,
    threshold_max: f32,
    direction_angle: f32,
    sort_length: u32,
    block_size: u32,
    chaos: f32,
    quantization: f32,
    red_shift_x: i32,
    red_shift_y: i32,
    green_shift_x: i32,
    green_shift_y: i32,
    blue_shift_x: i32,
    blue_shift_y: i32,
    global_rgb_shift_intensity: f32,
    slice_count: u32,
    max_offset: i32,
    randomness: f32,
    scanline_thickness: u32,
    scanline_gap: u32,
    flicker: f32,
    curvature: f32,
    snap_to_palette: bool,
    palette_mix: f32,
    global_seed: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum BlendMode {
    Normal,
    Multiply,
    Screen,
    Overlay,
    Add,
}

impl BlendMode {
    fn from_optional(value: Option<&str>) -> Result<Self, String> {
        let Some(value) = value else {
            return Ok(Self::Normal);
        };

        match value.trim().to_ascii_lowercase().as_str() {
            "normal" => Ok(Self::Normal),
            "multiply" => Ok(Self::Multiply),
            "screen" => Ok(Self::Screen),
            "overlay" => Ok(Self::Overlay),
            "add" => Ok(Self::Add),
            other => Err(format!("Unknown blend mode: {other}")),
        }
    }
}

#[derive(Debug, Clone)]
pub struct PreparedVideoLayers {
    layers: Vec<ResolvedLayer>,
}

impl ResolvedLayer {
    fn from_layer(layer: &EffectLayer) -> Result<Self, String> {
        let palette = match (layer.palette.clone(), layer.palette_name.clone()) {
            (Some(palette), _) if !palette.is_empty() => palette,
            (_, Some(name)) => super::palettes::get_palette(&name)
                .ok_or_else(|| format!("Unknown palette: {name}"))?,
            _ => {
                return Err(
                    "Each layer must provide either non-empty `palette` or valid `palette_name`"
                        .to_string(),
                )
            }
        };

        Ok(Self {
            id: layer.id.clone(),
            algorithm: layer.algorithm.clone(),
            enabled: layer.enabled,
            intensity: layer.intensity,
            blend_mode: BlendMode::from_optional(layer.blend_mode.as_deref())?,
            opacity: layer.opacity.unwrap_or(1.0).clamp(0.0, 1.0),
            palette,
            contrast: layer.contrast.unwrap_or(100.0).clamp(0.0, 400.0),
            brightness: layer.brightness.unwrap_or(100.0).clamp(0.0, 400.0),
            saturation: layer.saturation.unwrap_or(100.0).clamp(0.0, 400.0),
            pixel_size: layer.pixel_size.unwrap_or(1).max(1),
            blur: layer.blur.unwrap_or(0.0).clamp(0.0, 32.0),
            sharpness: layer.sharpness.unwrap_or(0.0).clamp(0.0, 100.0),
            noise: layer.noise.unwrap_or(0.0).clamp(0.0, 100.0),
            glitch_type: layer
                .glitch_type
                .clone()
                .unwrap_or_else(|| "none".to_string())
                .to_ascii_lowercase(),
            sort_by: layer
                .sort_by
                .clone()
                .unwrap_or_else(|| "luma".to_string())
                .to_ascii_lowercase(),
            masking: layer
                .masking
                .clone()
                .unwrap_or_else(|| "all".to_string())
                .to_ascii_lowercase(),
            threshold_min: layer.threshold_min.unwrap_or(20.0).clamp(0.0, 100.0),
            threshold_max: layer.threshold_max.unwrap_or(80.0).clamp(0.0, 100.0),
            direction_angle: layer.direction_angle.unwrap_or(0.0),
            sort_length: layer.sort_length.unwrap_or(64).max(2),
            block_size: layer.block_size.unwrap_or(16).max(2),
            chaos: layer.chaos.unwrap_or(40.0).clamp(0.0, 100.0),
            quantization: layer.quantization.unwrap_or(45.0).clamp(0.0, 100.0),
            red_shift_x: layer.red_shift_x.unwrap_or(4),
            red_shift_y: layer.red_shift_y.unwrap_or(0),
            green_shift_x: layer.green_shift_x.unwrap_or(0),
            green_shift_y: layer.green_shift_y.unwrap_or(0),
            blue_shift_x: layer.blue_shift_x.unwrap_or(-4),
            blue_shift_y: layer.blue_shift_y.unwrap_or(0),
            global_rgb_shift_intensity: layer.global_rgb_shift_intensity.unwrap_or(70.0).clamp(0.0, 100.0),
            slice_count: layer.slice_count.unwrap_or(14).max(1),
            max_offset: layer.max_offset.unwrap_or(48).max(0),
            randomness: layer.randomness.unwrap_or(50.0).clamp(0.0, 100.0),
            scanline_thickness: layer.scanline_thickness.unwrap_or(1).max(1),
            scanline_gap: layer.scanline_gap.unwrap_or(2).max(1),
            flicker: layer.flicker.unwrap_or(16.0).clamp(0.0, 100.0),
            curvature: layer.curvature.unwrap_or(12.0).clamp(0.0, 100.0),
            snap_to_palette: layer.snap_to_palette.unwrap_or(false),
            palette_mix: layer.palette_mix.unwrap_or(100.0).clamp(0.0, 100.0),
            global_seed: layer.global_seed.unwrap_or(1337),
        })
    }
}

fn rgb_to_hsv(r: u8, g: u8, b: u8) -> (f32, f32, f32) {
    let r = r as f32 / 255.0;
    let g = g as f32 / 255.0;
    let b = b as f32 / 255.0;
    let max = r.max(g.max(b));
    let min = r.min(g.min(b));
    let d = max - min;
    let mut h = 0.0;
    if d > 0.0 {
        if (max - r).abs() < f32::EPSILON {
            h = 60.0 * (((g - b) / d) % 6.0);
        } else if (max - g).abs() < f32::EPSILON {
            h = 60.0 * (((b - r) / d) + 2.0);
        } else {
            h = 60.0 * (((r - g) / d) + 4.0);
        }
    }
    if h < 0.0 {
        h += 360.0;
    }
    let s = if max <= 0.0 { 0.0 } else { d / max };
    (h, s, max)
}

fn seeded01(seed: u64, x: u32, y: u32) -> f32 {
    let n = hash_u64(
        seed
            .wrapping_add((x as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15))
            .wrapping_add((y as u64).wrapping_mul(0xC2B2_AE3D_27D4_EB4F)),
    );
    (n as f64 / u64::MAX as f64) as f32
}

fn glitch_metric(sort_by: &str, r: u8, g: u8, b: u8) -> f32 {
    match sort_by {
        "saturation" => rgb_to_hsv(r, g, b).1 * 255.0,
        "hue" => rgb_to_hsv(r, g, b).0,
        "rgb-sum" => r as f32 + g as f32 + b as f32,
        _ => 0.2126 * r as f32 + 0.7152 * g as f32 + 0.0722 * b as f32,
    }
}

fn apply_palette_snap(image: &mut ImageData, original: &[u8], palette: &[[u8; 3]], mix: f32) {
    if palette.is_empty() || mix <= 0.0 {
        return;
    }

    let t = (mix / 100.0).clamp(0.0, 1.0);
    for idx in (0..image.data.len()).step_by(4) {
        if idx + 3 >= original.len() {
            continue;
        }

        let changed = image.data[idx] != original[idx]
            || image.data[idx + 1] != original[idx + 1]
            || image.data[idx + 2] != original[idx + 2];

        if !changed {
            continue;
        }

        let r = image.data[idx];
        let g = image.data[idx + 1];
        let b = image.data[idx + 2];
        let [pr, pg, pb] = find_closest_color_oklab(r, g, b, palette);
        image.data[idx] = clamp_u8(r as f32 + (pr as f32 - r as f32) * t);
        image.data[idx + 1] = clamp_u8(g as f32 + (pg as f32 - g as f32) * t);
        image.data[idx + 2] = clamp_u8(b as f32 + (pb as f32 - b as f32) * t);
    }
}

fn apply_rgb_shift(image: &mut ImageData, layer: &ResolvedLayer) {
    let intensity = (layer.global_rgb_shift_intensity / 100.0).clamp(0.0, 1.0);
    if intensity <= 0.0 {
        return;
    }
    let source = image.data.clone();
    let shifts = [
        (
            (layer.red_shift_x as f32 * intensity).round() as i32,
            (layer.red_shift_y as f32 * intensity).round() as i32,
        ),
        (
            (layer.green_shift_x as f32 * intensity).round() as i32,
            (layer.green_shift_y as f32 * intensity).round() as i32,
        ),
        (
            (layer.blue_shift_x as f32 * intensity).round() as i32,
            (layer.blue_shift_y as f32 * intensity).round() as i32,
        ),
    ];

    for y in 0..image.height as i32 {
        for x in 0..image.width as i32 {
            let dst = ((y as u32 * image.width + x as u32) * 4) as usize;
            for c in 0..3 {
                let sx = (x + shifts[c].0).clamp(0, image.width as i32 - 1) as u32;
                let sy = (y + shifts[c].1).clamp(0, image.height as i32 - 1) as u32;
                let src = ((sy * image.width + sx) * 4) as usize;
                image.data[dst + c] = source[src + c];
            }
        }
    }
}

fn apply_slice(image: &mut ImageData, layer: &ResolvedLayer) {
    let source = image.data.clone();
    let max_offset = layer.max_offset.max(0) as i32;
    for i in 0..layer.slice_count {
        let seed = layer.global_seed.wrapping_add(i as u64 * 17);
        let start_y = (seeded01(seed, i, image.height) * image.height as f32).floor() as u32;
        let raw_h = (seeded01(seed ^ 0x55AA, i, 1) * image.height as f32 / 8.0).floor() as u32;
        let band_h = raw_h.max(1);
        let random_scale = (layer.randomness / 100.0).clamp(0.0, 1.0);
        let offset = ((seeded01(seed ^ 0xAA55, i, 2) * 2.0 - 1.0) * max_offset as f32 * random_scale)
            .round() as i32;

        for y in start_y..(start_y + band_h).min(image.height) {
            for x in 0..image.width {
                let sx = (x as i32 + offset).clamp(0, image.width as i32 - 1) as u32;
                let src = ((y * image.width + sx) * 4) as usize;
                let dst = ((y * image.width + x) * 4) as usize;
                image.data[dst] = source[src];
                image.data[dst + 1] = source[src + 1];
                image.data[dst + 2] = source[src + 2];
            }
        }
    }
}

fn apply_block_noise(image: &mut ImageData, layer: &ResolvedLayer) {
    let source = image.data.clone();
    let block = layer.block_size.max(2);
    let chaos = (layer.chaos / 100.0).clamp(0.0, 1.0);
    let levels = (32.0 - (layer.quantization / 100.0) * 30.0).round().clamp(2.0, 32.0);
    let step = 255.0 / (levels - 1.0);

    let mut by = 0;
    while by < image.height {
        let mut bx = 0;
        while bx < image.width {
            let shift_x = ((seeded01(layer.global_seed, bx, by) * 2.0 - 1.0)
                * chaos
                * block as f32
                * 2.0)
                .round() as i32;
            let shift_y = ((seeded01(layer.global_seed ^ 0x4F1B, bx, by) * 2.0 - 1.0)
                * chaos
                * block as f32
                * 2.0)
                .round() as i32;

            for y in by..(by + block).min(image.height) {
                for x in bx..(bx + block).min(image.width) {
                    let sx = (x as i32 + shift_x).clamp(0, image.width as i32 - 1) as u32;
                    let sy = (y as i32 + shift_y).clamp(0, image.height as i32 - 1) as u32;
                    let src = ((sy * image.width + sx) * 4) as usize;
                    let dst = ((y * image.width + x) * 4) as usize;
                    image.data[dst] = ((source[src] as f32 / step).round() * step).clamp(0.0, 255.0) as u8;
                    image.data[dst + 1] =
                        ((source[src + 1] as f32 / step).round() * step).clamp(0.0, 255.0) as u8;
                    image.data[dst + 2] =
                        ((source[src + 2] as f32 / step).round() * step).clamp(0.0, 255.0) as u8;
                }
            }

            bx += block;
        }
        by += block;
    }
}

fn apply_pixel_sort(image: &mut ImageData, layer: &ResolvedLayer) {
    let source = image.data.clone();
    let min_t = layer.threshold_min * 2.55;
    let max_t = layer.threshold_max * 2.55;
    let length = layer.sort_length.max(2) as usize;
    let vertical = ((layer.direction_angle % 180.0) - 90.0).abs() < 35.0;

    let mut process_line = |coords: Vec<(u32, u32)>| {
        let mut i = 0usize;
        while i < coords.len() {
            let end = (i + length).min(coords.len());
            let mut segment = Vec::with_capacity(end - i);
            for &(x, y) in &coords[i..end] {
                let idx = ((y * image.width + x) * 4) as usize;
                let r = source[idx];
                let g = source[idx + 1];
                let b = source[idx + 2];
                let lum = glitch_metric("luma", r, g, b);
                let in_threshold = lum >= min_t && lum <= max_t;
                let in_mask = layer.masking == "all"
                    || (layer.masking == "dark" && lum < 128.0)
                    || (layer.masking == "light" && lum >= 128.0);
                segment.push((x, y, r, g, b, in_threshold && in_mask));
            }

            let mut movable: Vec<_> = segment
                .iter()
                .filter(|entry| entry.5)
                .map(|entry| (entry.2, entry.3, entry.4))
                .collect();

            movable.sort_by(|a, b| {
                glitch_metric(&layer.sort_by, a.0, a.1, a.2)
                    .partial_cmp(&glitch_metric(&layer.sort_by, b.0, b.1, b.2))
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

            let mut take = 0usize;
            for (x, y, r, g, b, can_move) in segment {
                let idx = ((y * image.width + x) * 4) as usize;
                if can_move && take < movable.len() {
                    let mv = movable[take];
                    take += 1;
                    image.data[idx] = mv.0;
                    image.data[idx + 1] = mv.1;
                    image.data[idx + 2] = mv.2;
                } else {
                    image.data[idx] = r;
                    image.data[idx + 1] = g;
                    image.data[idx + 2] = b;
                }
            }

            i = end;
        }
    };

    if vertical {
        for x in 0..image.width {
            process_line((0..image.height).map(|y| (x, y)).collect());
        }
    } else {
        for y in 0..image.height {
            process_line((0..image.width).map(|x| (x, y)).collect());
        }
    }
}

fn apply_analog(image: &mut ImageData, layer: &ResolvedLayer) {
    let source = image.data.clone();
    let line = layer.scanline_thickness.max(1);
    let gap = layer.scanline_gap.max(1);
    let curvature = (layer.curvature / 100.0).clamp(0.0, 1.0);
    let flicker = (layer.flicker / 100.0).clamp(0.0, 1.0);

    for y in 0..image.height {
        let line_phase = (y % (line + gap)) < line;
        let jitter = ((seeded01(layer.global_seed ^ 0xBEEF, y, 0) * 2.0 - 1.0) * 4.0).round() as i32;
        for x in 0..image.width {
            let edge = (x as f32 / (image.width.saturating_sub(1).max(1)) as f32 - 0.5) * 2.0;
            let curve_shift = (edge.abs() * edge.signum() * curvature * 12.0).round() as i32;
            let sx = (x as i32 + jitter + curve_shift).clamp(0, image.width as i32 - 1) as u32;
            let src = ((y * image.width + sx) * 4) as usize;
            let dst = ((y * image.width + x) * 4) as usize;
            let dim = if line_phase { 0.72 } else { 1.0 };
            let flick = 1.0 - flicker * 0.15 + seeded01(layer.global_seed ^ 0xCAFE, x, y) * flicker * 0.15;
            image.data[dst] = clamp_u8(source[src] as f32 * dim * flick);
            image.data[dst + 1] = clamp_u8(source[src + 1] as f32 * dim * flick);
            image.data[dst + 2] = clamp_u8(source[src + 2] as f32 * dim * flick);
        }
    }
}

fn apply_glitch(image: &mut ImageData, layer: &ResolvedLayer, _ctx: &FrameContext) {
    let before = image.data.clone();
    let applied = match layer.glitch_type.as_str() {
        "pixel sort" | "pixel-sort" | "pixelsort" => {
            apply_pixel_sort(image, layer);
            true
        }
        "block noise" | "block-noise" | "blocknoise" => {
            apply_block_noise(image, layer);
            true
        }
        "rgb shift" | "rgb-shift" | "rgbshift" => {
            apply_rgb_shift(image, layer);
            true
        }
        "slice" => {
            apply_slice(image, layer);
            true
        }
        "analog" => {
            apply_analog(image, layer);
            true
        }
        _ => false,
    };

    if applied && layer.snap_to_palette {
        apply_palette_snap(image, &before, &layer.palette, layer.palette_mix);
    }
}

fn clamp_u8(value: f32) -> u8 {
    value.clamp(0.0, 255.0).round() as u8
}

fn hash_u64(mut x: u64) -> u64 {
    x ^= x >> 33;
    x = x.wrapping_mul(0xff51_afd7_ed55_8ccd);
    x ^= x >> 33;
    x = x.wrapping_mul(0xc4ce_b9fe_1a85_ec53);
    x ^= x >> 33;
    x
}

fn noise01(x: u32, y: u32, seed: u64) -> f32 {
    let mixed = seed
        .wrapping_add((x as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15))
        .wrapping_add((y as u64).wrapping_mul(0xC2B2_AE3D_27D4_EB4F));
    let h = hash_u64(mixed);
    (h as f64 / u64::MAX as f64) as f32
}

fn apply_adjustments(image: &mut ImageData, contrast: f32, brightness: f32, saturation: f32) {
    let contrast_factor = contrast / 100.0;
    let brightness_factor = brightness / 100.0;
    let saturation_factor = saturation / 100.0;

    for idx in (0..image.data.len()).step_by(4) {
        let mut r = image.data[idx] as f32 * brightness_factor;
        let mut g = image.data[idx + 1] as f32 * brightness_factor;
        let mut b = image.data[idx + 2] as f32 * brightness_factor;

        r = ((r / 255.0 - 0.5) * contrast_factor + 0.5) * 255.0;
        g = ((g / 255.0 - 0.5) * contrast_factor + 0.5) * 255.0;
        b = ((b / 255.0 - 0.5) * contrast_factor + 0.5) * 255.0;

        let gray = 0.299 * r + 0.587 * g + 0.114 * b;
        r = gray + (r - gray) * saturation_factor;
        g = gray + (g - gray) * saturation_factor;
        b = gray + (b - gray) * saturation_factor;

        image.data[idx] = clamp_u8(r);
        image.data[idx + 1] = clamp_u8(g);
        image.data[idx + 2] = clamp_u8(b);
    }
}

fn apply_noise(image: &mut ImageData, amount: f32, ctx: &FrameContext) {
    if amount <= 0.0 {
        return;
    }

    let width = image.width.max(1);
    let noise_strength = amount * 2.0;
    for idx in (0..image.data.len()).step_by(4) {
        let pixel_index = idx / 4;
        let x = (pixel_index as u32) % width;
        let y = (pixel_index as u32) / width;
        let noise = (noise01(x, y, ctx.seed ^ ctx.frame_index as u64) - 0.5) * noise_strength;
        image.data[idx] = clamp_u8(image.data[idx] as f32 + noise);
        image.data[idx + 1] = clamp_u8(image.data[idx + 1] as f32 + noise);
        image.data[idx + 2] = clamp_u8(image.data[idx + 2] as f32 + noise);
    }
}

fn apply_sharpness(image: &mut ImageData, amount: f32) {
    if amount <= 0.0 || image.width < 3 || image.height < 3 {
        return;
    }

    let source = image.data.clone();
    let width = image.width as usize;
    let height = image.height as usize;
    let factor = (amount / 100.0).clamp(0.0, 1.0);
    let kernel = [0.0f32, -1.0, 0.0, -1.0, 5.0, -1.0, 0.0, -1.0, 0.0];

    for y in 1..height.saturating_sub(1) {
        for x in 1..width.saturating_sub(1) {
            let mut r = 0.0f32;
            let mut g = 0.0f32;
            let mut b = 0.0f32;

            for ky in 0..3 {
                for kx in 0..3 {
                    let sample_x = x + kx - 1;
                    let sample_y = y + ky - 1;
                    let sample_idx = (sample_y * width + sample_x) * 4;
                    let weight = kernel[ky * 3 + kx];
                    r += source[sample_idx] as f32 * weight;
                    g += source[sample_idx + 1] as f32 * weight;
                    b += source[sample_idx + 2] as f32 * weight;
                }
            }

            let idx = (y * width + x) * 4;
            let orig_r = source[idx] as f32;
            let orig_g = source[idx + 1] as f32;
            let orig_b = source[idx + 2] as f32;

            image.data[idx] = clamp_u8(orig_r + (r - orig_r) * factor);
            image.data[idx + 1] = clamp_u8(orig_g + (g - orig_g) * factor);
            image.data[idx + 2] = clamp_u8(orig_b + (b - orig_b) * factor);
        }
    }
}

fn downscale_nearest(image: &ImageData, scale: u32) -> ImageData {
    if scale <= 1 {
        return image.clone();
    }

    let new_width = (image.width / scale).max(1);
    let new_height = (image.height / scale).max(1);
    let mut output = ImageData::new(new_width, new_height);

    for y in 0..new_height {
        for x in 0..new_width {
            let src_x = (x * scale).min(image.width - 1);
            let src_y = (y * scale).min(image.height - 1);
            let src_idx = ((src_y * image.width + src_x) * 4) as usize;
            let dst_idx = ((y * new_width + x) * 4) as usize;
            output.data[dst_idx..dst_idx + 4].copy_from_slice(&image.data[src_idx..src_idx + 4]);
        }
    }

    output
}

fn upscale_nearest(image: &ImageData, target_width: u32, target_height: u32) -> ImageData {
    if image.width == target_width && image.height == target_height {
        return image.clone();
    }

    let mut output = ImageData::new(target_width, target_height);
    let scale_x = target_width as f32 / image.width as f32;
    let scale_y = target_height as f32 / image.height as f32;

    for y in 0..target_height {
        let src_y = ((y as f32 / scale_y).floor() as u32).min(image.height - 1);
        for x in 0..target_width {
            let src_x = ((x as f32 / scale_x).floor() as u32).min(image.width - 1);
            let src_idx = ((src_y * image.width + src_x) * 4) as usize;
            let dst_idx = ((y * target_width + x) * 4) as usize;
            output.data[dst_idx..dst_idx + 4].copy_from_slice(&image.data[src_idx..src_idx + 4]);
        }
    }

    output
}

fn blend_channel(base: f32, top: f32, mode: BlendMode) -> f32 {
    match mode {
        BlendMode::Normal => top,
        BlendMode::Multiply => base * top,
        BlendMode::Screen => 1.0 - (1.0 - base) * (1.0 - top),
        BlendMode::Overlay => {
            if base <= 0.5 {
                2.0 * base * top
            } else {
                1.0 - 2.0 * (1.0 - base) * (1.0 - top)
            }
        }
        BlendMode::Add => (base + top).min(1.0),
    }
}

fn blend_images(base: &mut ImageData, top: &ImageData, mode: BlendMode, opacity: f32) {
    let opacity = opacity.clamp(0.0, 1.0);
    if opacity <= 0.0 {
        return;
    }

    for idx in (0..base.data.len()).step_by(4) {
        for c in 0..3 {
            let b = base.data[idx + c] as f32 / 255.0;
            let t = top.data[idx + c] as f32 / 255.0;
            let m = blend_channel(b, t, mode);
            let out = b * (1.0 - opacity) + m * opacity;
            base.data[idx + c] = (out.clamp(0.0, 1.0) * 255.0).round() as u8;
        }
    }
}

pub fn reorder_layers(
    mut layers: Vec<EffectLayer>,
    from_index: usize,
    to_index: usize,
) -> Result<Vec<EffectLayer>, String> {
    if from_index >= layers.len() || to_index >= layers.len() {
        return Err(format!(
            "Layer reorder out of bounds: from={} to={} len={}",
            from_index,
            to_index,
            layers.len()
        ));
    }

    if from_index == to_index {
        return Ok(layers);
    }

    let moved = layers.remove(from_index);
    layers.insert(to_index, moved);
    Ok(layers)
}

pub fn process_frame_batch(request: VideoFrameBatchRequest) -> Result<VideoFrameBatchResult, String> {
    validate_batch_request(&request)?;

    let total_frames = request.frames.len() as u32;
    let prepared_layers = prepare_video_layers(&request.layers)?;

    let processed_frames = if total_frames == 0 {
        Vec::new()
    } else {
        #[cfg(not(test))]
        {
            use rayon::prelude::*;

            request
                .frames
                .par_iter()
                .enumerate()
                .map(|(frame_index, frame)| {
                    process_single_frame(
                        request.width,
                        request.height,
                        frame,
                        &prepared_layers.layers,
                        &request.temporal,
                        frame_index as u32,
                        total_frames,
                    )
                })
                .collect::<Result<Vec<_>, _>>()?
        }

        #[cfg(test)]
        {
            request
                .frames
                .iter()
                .enumerate()
                .map(|(frame_index, frame)| {
                    process_single_frame(
                        request.width,
                        request.height,
                        frame,
                        &prepared_layers.layers,
                        &request.temporal,
                        frame_index as u32,
                        total_frames,
                    )
                })
                .collect::<Result<Vec<_>, _>>()?
        }
    };

    Ok(VideoFrameBatchResult {
        width: request.width,
        height: request.height,
        frame_count: processed_frames.len(),
        processed_frames,
    })
}

pub fn process_frame_batch_packed(
    request: VideoFrameBatchPackedRequest,
) -> Result<VideoFrameBatchPackedResult, String> {
    validate_packed_batch_request(&request)?;

    let total_frames = request.frame_count as u32;
    let prepared_layers = prepare_video_layers(&request.layers)?;

    let processed_frames = if request.frame_count == 0 {
        Vec::new()
    } else {
        #[cfg(not(test))]
        {
            use rayon::prelude::*;

            request
                .frames_blob
                .par_chunks(request.frame_size)
                .enumerate()
                .map(|(frame_index, frame)| {
                    process_single_frame(
                        request.width,
                        request.height,
                        frame,
                        &prepared_layers.layers,
                        &request.temporal,
                        frame_index as u32,
                        total_frames,
                    )
                })
                .collect::<Result<Vec<_>, _>>()?
        }

        #[cfg(test)]
        {
            request
                .frames_blob
                .chunks(request.frame_size)
                .enumerate()
                .map(|(frame_index, frame)| {
                    process_single_frame(
                        request.width,
                        request.height,
                        frame,
                        &prepared_layers.layers,
                        &request.temporal,
                        frame_index as u32,
                        total_frames,
                    )
                })
                .collect::<Result<Vec<_>, _>>()?
        }
    };

    let mut processed_blob = Vec::with_capacity(request.frame_count * request.frame_size);
    for frame in processed_frames {
        processed_blob.extend_from_slice(&frame);
    }

    Ok(VideoFrameBatchPackedResult {
        width: request.width,
        height: request.height,
        frame_count: request.frame_count,
        frame_size: request.frame_size,
        processed_frames_blob: processed_blob,
    })
}

pub fn prepare_video_layers(layers: &[EffectLayer]) -> Result<PreparedVideoLayers, String> {
    if layers.is_empty() {
        return Err("Layer stack cannot be empty".to_string());
    }

    let resolved = layers
        .iter()
        .map(ResolvedLayer::from_layer)
        .collect::<Result<Vec<_>, _>>()?;

    Ok(PreparedVideoLayers { layers: resolved })
}

pub fn process_single_video_frame(
    width: u32,
    height: u32,
    frame: &[u8],
    prepared_layers: &PreparedVideoLayers,
    temporal: &TemporalVariationConfig,
    frame_index: u32,
    total_frames: u32,
) -> Result<Vec<u8>, String> {
    let expected_len = (width as usize)
        .checked_mul(height as usize)
        .and_then(|px| px.checked_mul(4))
        .ok_or_else(|| "Frame size overflow".to_string())?;

    if frame.len() != expected_len {
        return Err(format!(
            "Invalid RGBA frame length: got {}, expected {}",
            frame.len(),
            expected_len
        ));
    }

    process_single_frame(
        width,
        height,
        frame,
        &prepared_layers.layers,
        temporal,
        frame_index,
        total_frames.max(1),
    )
}

pub fn process_single_video_frame_with_animation(
    width: u32,
    height: u32,
    frame: &[u8],
    prepared_layers: &PreparedVideoLayers,
    temporal: &TemporalVariationConfig,
    tracks: &[AnimationTrack],
    frame_index: u32,
    total_frames: u32,
) -> Result<Vec<u8>, String> {
    let expected_len = (width as usize)
        .checked_mul(height as usize)
        .and_then(|px| px.checked_mul(4))
        .ok_or_else(|| "Frame size overflow".to_string())?;

    if frame.len() != expected_len {
        return Err(format!(
            "Invalid RGBA frame length: got {}, expected {}",
            frame.len(),
            expected_len
        ));
    }

    let mut animated_layers = prepared_layers.layers.clone();
    let mut animated_temporal = temporal.clone();

    apply_animation_tracks(
        tracks,
        &mut animated_layers,
        &mut animated_temporal,
        frame_index,
        total_frames.max(1),
    )?;

    process_single_frame(
        width,
        height,
        frame,
        &animated_layers,
        &animated_temporal,
        frame_index,
        total_frames.max(1),
    )
}

pub fn render_still_image_animation(
    request: StillImageAnimationRequest,
) -> Result<StillImageAnimationResult, String> {
    validate_still_animation_request(&request)?;

    let prepared_layers = prepare_video_layers(&request.layers)?;
    let total_frames = request.frame_count;
    let mode = request.mode.unwrap_or(AnimationRenderMode::Rendered);
    let stride = request.quick_stride.unwrap_or(2).max(1);

    let frame_indices: Vec<u32> = match mode {
        AnimationRenderMode::Rendered => (0..total_frames).collect(),
        AnimationRenderMode::Quick => (0..total_frames).step_by(stride as usize).collect(),
    };

    let mut processed_frames = Vec::with_capacity(frame_indices.len());

    for &timeline_frame in &frame_indices {
        let mut animated_layers = prepared_layers.layers.clone();
        let mut animated_temporal = request.temporal.clone();

        apply_animation_tracks(
            &request.tracks,
            &mut animated_layers,
            &mut animated_temporal,
            timeline_frame,
            total_frames,
        )?;

        let out = process_single_frame(
            request.width,
            request.height,
            &request.frame,
            &animated_layers,
            &animated_temporal,
            timeline_frame,
            total_frames,
        )?;

        processed_frames.push(out);
    }

    Ok(StillImageAnimationResult {
        width: request.width,
        height: request.height,
        frame_count: processed_frames.len(),
        rendered_frame_indices: frame_indices,
        processed_frames,
    })
}

pub fn export_frames_pack(
    result: &VideoFrameBatchResult,
    name: &str,
) -> Result<ExportedFramePack, String> {
    if result.width == 0 || result.height == 0 {
        return Err("Cannot export frame pack with zero-sized frames".to_string());
    }

    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"DYUKI-FRAMES");
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.extend_from_slice(&result.width.to_le_bytes());
    bytes.extend_from_slice(&result.height.to_le_bytes());
    bytes.extend_from_slice(&(result.frame_count as u32).to_le_bytes());

    for frame in &result.processed_frames {
        bytes.extend_from_slice(&(frame.len() as u32).to_le_bytes());
        bytes.extend_from_slice(frame);
    }

    Ok(ExportedFramePack {
        file_name: format!("{}.dykframes", slugify_name(name)),
        file_extension: "dykframes".to_string(),
        bytes,
    })
}

fn process_single_frame(
    width: u32,
    height: u32,
    frame: &[u8],
    layers: &[ResolvedLayer],
    temporal: &TemporalVariationConfig,
    frame_index: u32,
    total_frames: u32,
) -> Result<Vec<u8>, String> {
    let mut image = ImageData::from_rgba(width, height, frame.to_vec());
    let ctx = FrameContext::new(frame_index, total_frames);

    for layer in layers {
        if !layer.enabled {
            continue;
        }

        let intensity = apply_temporal_variation(layer.intensity, temporal, &ctx, &layer.id);
        let original_width = image.width;
        let original_height = image.height;
        let effect = AlgorithmRegistry::create(&layer.algorithm, layer.palette.clone(), intensity)?;
        let mut effected = image.clone();

        apply_adjustments(&mut effected, layer.contrast, layer.brightness, layer.saturation);
        if layer.blur > 0.0 {
            let blur = super::FastGaussianBlur {
                radius: layer.blur,
                intensity: 100.0,
            };
            blur.apply(&mut effected, &ctx)?;
        }
        apply_sharpness(&mut effected, layer.sharpness);
        apply_noise(&mut effected, layer.noise, &ctx);

        if layer.pixel_size > 1 {
            effected = downscale_nearest(&effected, layer.pixel_size);
        }

        effect.apply(&mut effected, &ctx)?;
        apply_glitch(&mut effected, layer, &ctx);

        if layer.pixel_size > 1 {
            effected = upscale_nearest(&effected, original_width, original_height);
        }

        blend_images(&mut image, &effected, layer.blend_mode, layer.opacity);
    }

    Ok(image.data)
}

fn apply_animation_tracks(
    tracks: &[AnimationTrack],
    layers: &mut [ResolvedLayer],
    temporal: &mut TemporalVariationConfig,
    frame_index: u32,
    total_frames: u32,
) -> Result<(), String> {
    for track in tracks {
        let value = evaluate_track_value(track, frame_index, total_frames)?;

        match &track.parameter {
            AnimationParameter::LayerIntensity { layer_id } => {
                let Some(layer) = layers.iter_mut().find(|l| &l.id == layer_id) else {
                    return Err(format!(
                        "Animation track '{}' references unknown layer id '{}'",
                        track.id, layer_id
                    ));
                };
                layer.intensity = value.clamp(0.0, 100.0);
            }
            AnimationParameter::TemporalAmount => {
                temporal.amount = value.clamp(0.0, 100.0);
            }
            AnimationParameter::TemporalSpeed => {
                temporal.speed = value.max(0.0001);
            }
            AnimationParameter::TemporalPhase => {
                temporal.phase = value;
            }
        }
    }

    Ok(())
}

fn evaluate_track_value(
    track: &AnimationTrack,
    frame_index: u32,
    total_frames: u32,
) -> Result<f32, String> {
    if track.end_frame < track.start_frame {
        return Err(format!(
            "Animation track '{}' has invalid range: start_frame={} end_frame={}",
            track.id, track.start_frame, track.end_frame
        ));
    }

    let mut local_frame = frame_index;
    if track.looped {
        let span = (track.end_frame - track.start_frame + 1).max(1);
        if span > 0 {
            local_frame = track.start_frame + (frame_index % span);
        }
    }

    if local_frame <= track.start_frame {
        return Ok(track.from);
    }
    if local_frame >= track.end_frame || total_frames <= 1 {
        return Ok(track.to);
    }

    let denom = (track.end_frame - track.start_frame) as f32;
    let t = ((local_frame - track.start_frame) as f32 / denom).clamp(0.0, 1.0);
    let eased = apply_easing(t, track.easing);
    Ok(track.from + (track.to - track.from) * eased)
}

fn apply_easing(t: f32, easing: AnimationEasing) -> f32 {
    let t = t.clamp(0.0, 1.0);
    match easing {
        AnimationEasing::Linear => t,
        AnimationEasing::EaseIn => t * t,
        AnimationEasing::EaseOut => 1.0 - (1.0 - t) * (1.0 - t),
        AnimationEasing::EaseInOut => {
            if t < 0.5 {
                2.0 * t * t
            } else {
                1.0 - ((-2.0 * t + 2.0).powi(2) / 2.0)
            }
        }
    }
}

fn apply_temporal_variation(
    base_intensity: f32,
    temporal: &TemporalVariationConfig,
    ctx: &FrameContext,
    layer_id: &str,
) -> f32 {
    let base = base_intensity.clamp(0.0, 100.0);
    if !temporal.enabled || temporal.amount <= 0.0 {
        return base;
    }

    let t = if ctx.total_frames <= 1 {
        0.0
    } else {
        ctx.frame_index as f32 / (ctx.total_frames - 1) as f32
    };

    let phase_t = t * temporal.speed.max(0.0001) + temporal.phase;
    let depth = (temporal.amount / 100.0).clamp(0.0, 1.0);

    let modulation = match temporal.mode {
        TemporalVariationMode::Pulse => {
            let s = (phase_t * std::f32::consts::TAU).sin().abs();
            2.0 * s - 1.0
        }
        TemporalVariationMode::Sine => (phase_t * std::f32::consts::TAU).sin(),
        TemporalVariationMode::Triangle => {
            let frac = phase_t.fract().abs();
            if frac < 0.5 {
                frac * 4.0 - 1.0
            } else {
                3.0 - frac * 4.0
            }
        }
        TemporalVariationMode::Saw => phase_t.fract() * 2.0 - 1.0,
        TemporalVariationMode::Step => {
            let step = ((phase_t * 8.0).floor() as i32).rem_euclid(8);
            step as f32 / 3.5 - 1.0
        }
        TemporalVariationMode::Strobe => {
            if (phase_t * 12.0).fract() < 0.5 {
                1.0
            } else {
                -1.0
            }
        }
        TemporalVariationMode::Drift => (phase_t * 0.6).fract() * 2.0 - 1.0,
        TemporalVariationMode::Bounce => {
            let s = (phase_t * std::f32::consts::TAU).sin();
            s.signum() * s * s
        }
        TemporalVariationMode::Jitter => {
            let seed = (layer_id
                .bytes()
                .fold(0u64, |acc, b| acc.wrapping_mul(131).wrapping_add(b as u64)))
                ^ ctx.seed
                ^ (ctx.frame_index as u64).wrapping_mul(0x9E37_79B9);
            let mut x = seed;
            x ^= x >> 33;
            x = x.wrapping_mul(0xff51_afd7_ed55_8ccd);
            x ^= x >> 33;
            let n = (x as f64 / u64::MAX as f64) as f32;
            n * 2.0 - 1.0
        }
    };

    let amplitude = 50.0 * depth;
    (base + modulation * amplitude).clamp(0.0, 100.0)
}

fn validate_batch_request(request: &VideoFrameBatchRequest) -> Result<(), String> {
    if request.width == 0 || request.height == 0 {
        return Err("Frame width/height must be > 0".to_string());
    }

    if request.layers.is_empty() {
        return Err("Layer stack cannot be empty".to_string());
    }

    let expected_len = (request.width as usize)
        .checked_mul(request.height as usize)
        .and_then(|px| px.checked_mul(4))
        .ok_or_else(|| "Frame size overflow".to_string())?;

    for (index, frame) in request.frames.iter().enumerate() {
        if frame.len() != expected_len {
            return Err(format!(
                "Frame {} has invalid RGBA length: got {}, expected {}",
                index,
                frame.len(),
                expected_len
            ));
        }
    }

    Ok(())
}

fn validate_packed_batch_request(request: &VideoFrameBatchPackedRequest) -> Result<(), String> {
    if request.width == 0 || request.height == 0 {
        return Err("Frame width/height must be > 0".to_string());
    }

    if request.layers.is_empty() {
        return Err("Layer stack cannot be empty".to_string());
    }

    if request.frame_count == 0 {
        return Ok(());
    }

    let expected_len = (request.width as usize)
        .checked_mul(request.height as usize)
        .and_then(|px| px.checked_mul(4))
        .ok_or_else(|| "Frame size overflow".to_string())?;

    if request.frame_size != expected_len {
        return Err(format!(
            "Invalid frame_size: got {}, expected {}",
            request.frame_size,
            expected_len
        ));
    }

    let expected_blob = request
        .frame_size
        .checked_mul(request.frame_count)
        .ok_or_else(|| "frames_blob size overflow".to_string())?;

    if request.frames_blob.len() != expected_blob {
        return Err(format!(
            "Invalid frames_blob length: got {}, expected {}",
            request.frames_blob.len(),
            expected_blob
        ));
    }

    Ok(())
}

fn validate_still_animation_request(request: &StillImageAnimationRequest) -> Result<(), String> {
    if request.width == 0 || request.height == 0 {
        return Err("Frame width/height must be > 0".to_string());
    }

    if request.frame_count == 0 {
        return Err("frame_count must be > 0".to_string());
    }

    if request.layers.is_empty() {
        return Err("Layer stack cannot be empty".to_string());
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

    if let Some(stride) = request.quick_stride {
        if stride == 0 {
            return Err("quick_stride must be > 0".to_string());
        }
    }

    for track in &request.tracks {
        if track.end_frame < track.start_frame {
            return Err(format!(
                "Animation track '{}' has invalid range: start_frame={} end_frame={}",
                track.id, track.start_frame, track.end_frame
            ));
        }
    }

    Ok(())
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
        "video-export".to_string()
    } else {
        slug
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_frame(width: u32, height: u32, value: u8) -> Vec<u8> {
        let mut out = vec![0u8; (width * height * 4) as usize];
        for idx in (0..out.len()).step_by(4) {
            out[idx] = value;
            out[idx + 1] = value;
            out[idx + 2] = value;
            out[idx + 3] = 255;
        }
        out
    }

    #[test]
    fn reorder_layers_moves_item() {
        let layers = vec![
            EffectLayer {
                id: "a".into(),
                algorithm: "Floyd-Steinberg".into(),
                enabled: true,
                intensity: 60.0,
                blend_mode: None,
                opacity: None,
                palette_name: Some("Grayscale".into()),
                palette: None,
                contrast: None,
                brightness: None,
                saturation: None,
                pixel_size: None,
                blur: None,
                sharpness: None,
                noise: None,
                glitch_type: None,
                sort_by: None,
                masking: None,
                threshold_min: None,
                threshold_max: None,
                direction_angle: None,
                sort_length: None,
                block_size: None,
                chaos: None,
                quantization: None,
                red_shift_x: None,
                red_shift_y: None,
                green_shift_x: None,
                green_shift_y: None,
                blue_shift_x: None,
                blue_shift_y: None,
                global_rgb_shift_intensity: None,
                slice_count: None,
                max_offset: None,
                randomness: None,
                scanline_thickness: None,
                scanline_gap: None,
                flicker: None,
                curvature: None,
                snap_to_palette: None,
                palette_mix: None,
                global_seed: None,
            },
            EffectLayer {
                id: "b".into(),
                algorithm: "Atkinson".into(),
                enabled: true,
                intensity: 60.0,
                blend_mode: None,
                opacity: None,
                palette_name: Some("Grayscale".into()),
                palette: None,
                contrast: None,
                brightness: None,
                saturation: None,
                pixel_size: None,
                blur: None,
                sharpness: None,
                noise: None,
                glitch_type: None,
                sort_by: None,
                masking: None,
                threshold_min: None,
                threshold_max: None,
                direction_angle: None,
                sort_length: None,
                block_size: None,
                chaos: None,
                quantization: None,
                red_shift_x: None,
                red_shift_y: None,
                green_shift_x: None,
                green_shift_y: None,
                blue_shift_x: None,
                blue_shift_y: None,
                global_rgb_shift_intensity: None,
                slice_count: None,
                max_offset: None,
                randomness: None,
                scanline_thickness: None,
                scanline_gap: None,
                flicker: None,
                curvature: None,
                snap_to_palette: None,
                palette_mix: None,
                global_seed: None,
            },
        ];

        let reordered = reorder_layers(layers, 0, 1).unwrap();
        assert_eq!(reordered[0].id, "b");
        assert_eq!(reordered[1].id, "a");
    }

    #[test]
    fn process_batch_returns_same_frame_count() {
        let request = VideoFrameBatchRequest {
            width: 4,
            height: 4,
            frames: vec![make_frame(4, 4, 20), make_frame(4, 4, 220)],
            layers: vec![EffectLayer {
                id: "layer-1".into(),
                algorithm: "Bayer 2x2".into(),
                enabled: true,
                intensity: 75.0,
                blend_mode: None,
                opacity: None,
                palette_name: Some("Grayscale".into()),
                palette: None,
                contrast: None,
                brightness: None,
                saturation: None,
                pixel_size: None,
                blur: None,
                sharpness: None,
                noise: None,
                glitch_type: None,
                sort_by: None,
                masking: None,
                threshold_min: None,
                threshold_max: None,
                direction_angle: None,
                sort_length: None,
                block_size: None,
                chaos: None,
                quantization: None,
                red_shift_x: None,
                red_shift_y: None,
                green_shift_x: None,
                green_shift_y: None,
                blue_shift_x: None,
                blue_shift_y: None,
                global_rgb_shift_intensity: None,
                slice_count: None,
                max_offset: None,
                randomness: None,
                scanline_thickness: None,
                scanline_gap: None,
                flicker: None,
                curvature: None,
                snap_to_palette: None,
                palette_mix: None,
                global_seed: None,
            }],
            temporal: TemporalVariationConfig {
                enabled: true,
                mode: TemporalVariationMode::Sine,
                amount: 40.0,
                speed: 1.0,
                phase: 0.0,
            },
        };

        let result = process_frame_batch(request).unwrap();
        assert_eq!(result.frame_count, 2);
        assert_eq!(result.processed_frames.len(), 2);
    }

    #[test]
    fn process_batch_supports_none_algorithm_passthrough() {
        let source = make_frame(2, 2, 96);
        let request = VideoFrameBatchRequest {
            width: 2,
            height: 2,
            frames: vec![source.clone()],
            layers: vec![EffectLayer {
                id: "layer-none".into(),
                algorithm: "None".into(),
                enabled: true,
                intensity: 100.0,
                blend_mode: None,
                opacity: None,
                palette_name: Some("Grayscale".into()),
                palette: None,
                contrast: None,
                brightness: None,
                saturation: None,
                pixel_size: None,
                blur: None,
                sharpness: None,
                noise: None,
                glitch_type: None,
                sort_by: None,
                masking: None,
                threshold_min: None,
                threshold_max: None,
                direction_angle: None,
                sort_length: None,
                block_size: None,
                chaos: None,
                quantization: None,
                red_shift_x: None,
                red_shift_y: None,
                green_shift_x: None,
                green_shift_y: None,
                blue_shift_x: None,
                blue_shift_y: None,
                global_rgb_shift_intensity: None,
                slice_count: None,
                max_offset: None,
                randomness: None,
                scanline_thickness: None,
                scanline_gap: None,
                flicker: None,
                curvature: None,
                snap_to_palette: None,
                palette_mix: None,
                global_seed: None,
            }],
            temporal: TemporalVariationConfig::default(),
        };

        let result = process_frame_batch(request).unwrap();
        assert_eq!(result.frame_count, 1);
        assert_eq!(result.processed_frames[0], source);
    }

    #[test]
    fn export_pack_has_signature() {
        let result = VideoFrameBatchResult {
            width: 2,
            height: 2,
            frame_count: 1,
            processed_frames: vec![make_frame(2, 2, 32)],
        };

        let pack = export_frames_pack(&result, "Test Export").unwrap();
        assert!(pack.bytes.starts_with(b"DYUKI-FRAMES"));
        assert!(pack.file_name.ends_with(".dykframes"));
    }

    #[test]
    fn easing_is_monotonic_for_common_modes() {
        let l1 = apply_easing(0.25, AnimationEasing::EaseIn);
        let l2 = apply_easing(0.75, AnimationEasing::EaseIn);
        assert!(l2 > l1);

        let o1 = apply_easing(0.25, AnimationEasing::EaseOut);
        let o2 = apply_easing(0.75, AnimationEasing::EaseOut);
        assert!(o2 > o1);
    }

    #[test]
    fn render_still_animation_produces_frames() {
        let request = StillImageAnimationRequest {
            width: 4,
            height: 4,
            frame: make_frame(4, 4, 120),
            frame_count: 6,
            layers: vec![EffectLayer {
                id: "layer-1".into(),
                algorithm: "Bayer 2x2".into(),
                enabled: true,
                intensity: 50.0,
                blend_mode: None,
                opacity: None,
                palette_name: Some("Grayscale".into()),
                palette: None,
                contrast: None,
                brightness: None,
                saturation: None,
                pixel_size: None,
                blur: None,
                sharpness: None,
                noise: None,
                glitch_type: None,
                sort_by: None,
                masking: None,
                threshold_min: None,
                threshold_max: None,
                direction_angle: None,
                sort_length: None,
                block_size: None,
                chaos: None,
                quantization: None,
                red_shift_x: None,
                red_shift_y: None,
                green_shift_x: None,
                green_shift_y: None,
                blue_shift_x: None,
                blue_shift_y: None,
                global_rgb_shift_intensity: None,
                slice_count: None,
                max_offset: None,
                randomness: None,
                scanline_thickness: None,
                scanline_gap: None,
                flicker: None,
                curvature: None,
                snap_to_palette: None,
                palette_mix: None,
                global_seed: None,
            }],
            temporal: TemporalVariationConfig {
                enabled: true,
                mode: TemporalVariationMode::Sine,
                amount: 0.0,
                speed: 1.0,
                phase: 0.0,
            },
            tracks: vec![AnimationTrack {
                id: "t-1".into(),
                parameter: AnimationParameter::TemporalAmount,
                from: 0.0,
                to: 60.0,
                start_frame: 0,
                end_frame: 5,
                easing: AnimationEasing::EaseInOut,
                looped: false,
            }],
            mode: Some(AnimationRenderMode::Rendered),
            quick_stride: None,
        };

        let result = render_still_image_animation(request).unwrap();
        assert_eq!(result.frame_count, 6);
        assert_eq!(result.processed_frames.len(), 6);
        assert_eq!(result.rendered_frame_indices, vec![0, 1, 2, 3, 4, 5]);
    }

    #[test]
    fn quick_mode_renders_subset_indices() {
        let request = StillImageAnimationRequest {
            width: 2,
            height: 2,
            frame: make_frame(2, 2, 80),
            frame_count: 10,
            layers: vec![EffectLayer {
                id: "layer-1".into(),
                algorithm: "Bayer 2x2".into(),
                enabled: true,
                intensity: 55.0,
                blend_mode: None,
                opacity: None,
                palette_name: Some("Grayscale".into()),
                palette: None,
                contrast: None,
                brightness: None,
                saturation: None,
                pixel_size: None,
                blur: None,
                sharpness: None,
                noise: None,
                glitch_type: None,
                sort_by: None,
                masking: None,
                threshold_min: None,
                threshold_max: None,
                direction_angle: None,
                sort_length: None,
                block_size: None,
                chaos: None,
                quantization: None,
                red_shift_x: None,
                red_shift_y: None,
                green_shift_x: None,
                green_shift_y: None,
                blue_shift_x: None,
                blue_shift_y: None,
                global_rgb_shift_intensity: None,
                slice_count: None,
                max_offset: None,
                randomness: None,
                scanline_thickness: None,
                scanline_gap: None,
                flicker: None,
                curvature: None,
                snap_to_palette: None,
                palette_mix: None,
                global_seed: None,
            }],
            temporal: TemporalVariationConfig::default(),
            tracks: vec![],
            mode: Some(AnimationRenderMode::Quick),
            quick_stride: Some(3),
        };

        let result = render_still_image_animation(request).unwrap();
        assert_eq!(result.rendered_frame_indices, vec![0, 3, 6, 9]);
        assert_eq!(result.frame_count, 4);
    }

    #[test]
    fn process_batch_supports_multiply_blend() {
        let request = VideoFrameBatchRequest {
            width: 2,
            height: 2,
            frames: vec![make_frame(2, 2, 128)],
            layers: vec![EffectLayer {
                id: "layer-1".into(),
                algorithm: "Bayer 2x2".into(),
                enabled: true,
                intensity: 65.0,
                blend_mode: Some("multiply".into()),
                opacity: Some(0.8),
                palette_name: Some("Grayscale".into()),
                palette: None,
                contrast: Some(120.0),
                brightness: Some(90.0),
                saturation: Some(100.0),
                pixel_size: Some(2),
                blur: Some(1.0),
                sharpness: Some(20.0),
                noise: Some(5.0),
                glitch_type: None,
                sort_by: None,
                masking: None,
                threshold_min: None,
                threshold_max: None,
                direction_angle: None,
                sort_length: None,
                block_size: None,
                chaos: None,
                quantization: None,
                red_shift_x: None,
                red_shift_y: None,
                green_shift_x: None,
                green_shift_y: None,
                blue_shift_x: None,
                blue_shift_y: None,
                global_rgb_shift_intensity: None,
                slice_count: None,
                max_offset: None,
                randomness: None,
                scanline_thickness: None,
                scanline_gap: None,
                flicker: None,
                curvature: None,
                snap_to_palette: None,
                palette_mix: None,
                global_seed: None,
            }],
            temporal: TemporalVariationConfig::default(),
        };

        let result = process_frame_batch(request).unwrap();
        assert_eq!(result.frame_count, 1);
        assert_eq!(result.processed_frames[0].len(), (2 * 2 * 4) as usize);
    }
}
