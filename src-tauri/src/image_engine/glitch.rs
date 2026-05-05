// Glitch effects (17 algorithms)

use std::f32::consts::PI;

use super::color::find_closest_color_oklab;
use super::context::FrameContext;
use super::types::{Effect, ImageData};

fn hash_u64(mut x: u64) -> u64 {
    x ^= x >> 33;
    x = x.wrapping_mul(0xff51_afd7_ed55_8ccd);
    x ^= x >> 33;
    x = x.wrapping_mul(0xc4ce_b9fe_1a85_ec53);
    x ^= x >> 33;
    x
}

fn rand01(x: u32, y: u32, seed: u64) -> f32 {
    let mixed = seed
        .wrapping_add((x as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15))
        .wrapping_add((y as u64).wrapping_mul(0xC2B2_AE3D_27D4_EB4F));
    let h = hash_u64(mixed);
    (h as f64 / u64::MAX as f64) as f32
}

fn clamp_sample_coord(value: i32, max: u32) -> u32 {
    if value < 0 {
        0
    } else if value as u32 >= max {
        max.saturating_sub(1)
    } else {
        value as u32
    }
}

fn pixel_idx(width: u32, x: u32, y: u32) -> usize {
    ((y * width + x) * 4) as usize
}

fn quantize(v: u8, levels: u8) -> u8 {
    let levels = levels.max(2) as f32;
    let step = 255.0 / (levels - 1.0);
    ((v as f32 / step).round() * step).clamp(0.0, 255.0) as u8
}

fn luma_of(r: u8, g: u8, b: u8) -> f32 {
    r as f32 * 0.2126 + g as f32 * 0.7152 + b as f32 * 0.0722
}

fn apply_palette(image: &mut ImageData, palette: &[[u8; 3]]) {
    if palette.is_empty() {
        return;
    }

    for y in 0..image.height {
        for x in 0..image.width {
            let idx = pixel_idx(image.width, x, y);
            let [r, g, b] = [image.data[idx], image.data[idx + 1], image.data[idx + 2]];
            let [nr, ng, nb] = find_closest_color_oklab(r, g, b, palette);
            image.data[idx] = nr;
            image.data[idx + 1] = ng;
            image.data[idx + 2] = nb;
        }
    }
}

pub struct ColorShift {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for ColorShift {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let src = image.data.clone();
        let strength = (self.intensity / 100.0).clamp(0.0, 1.0);
        let shift = ((ctx.frame_index % 8) as i32 + 1) as i32;

        for y in 0..image.height {
            for x in 0..image.width {
                let idx = pixel_idx(image.width, x, y);
                let rx = clamp_sample_coord(x as i32 + shift, image.width);
                let bx = clamp_sample_coord(x as i32 - shift, image.width);
                let r_idx = pixel_idx(image.width, rx, y);
                let b_idx = pixel_idx(image.width, bx, y);

                image.data[idx] = (src[idx] as f32 * (1.0 - strength) + src[r_idx] as f32 * strength) as u8;
                image.data[idx + 2] =
                    (src[idx + 2] as f32 * (1.0 - strength) + src[b_idx + 2] as f32 * strength) as u8;
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Color Shift"
    }
}

pub struct BlockCorruption {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for BlockCorruption {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let src = image.data.clone();
        let block = 8u32;
        let threshold = (self.intensity / 100.0).clamp(0.0, 1.0) * 0.25;

        for by in (0..image.height).step_by(block as usize) {
            for bx in (0..image.width).step_by(block as usize) {
                if rand01(bx, by, ctx.seed) < threshold {
                    let tx = clamp_sample_coord(
                        bx as i32 + (rand01(bx + 1, by + 2, ctx.seed) * 24.0 - 12.0) as i32,
                        image.width,
                    );
                    let ty = clamp_sample_coord(
                        by as i32 + (rand01(bx + 3, by + 4, ctx.seed) * 24.0 - 12.0) as i32,
                        image.height,
                    );
                    let source_idx = pixel_idx(image.width, tx, ty);

                    for y in by..(by + block).min(image.height) {
                        for x in bx..(bx + block).min(image.width) {
                            let idx = pixel_idx(image.width, x, y);
                            image.data[idx] = src[source_idx];
                            image.data[idx + 1] = src[source_idx + 1];
                            image.data[idx + 2] = src[source_idx + 2];
                        }
                    }
                }
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Block Corruption"
    }
}

pub struct LineGlitch {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for LineGlitch {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let src = image.data.clone();
        let threshold = (self.intensity / 100.0).clamp(0.0, 1.0) * 0.4;
        let phase = (ctx.time_seconds * 8.0).sin();

        for y in 0..image.height {
            if rand01(0, y, ctx.seed) < threshold {
                let offset = ((phase * 10.0) + (rand01(1, y, ctx.seed) * 10.0 - 5.0)) as i32;
                for x in 0..image.width {
                    let sx = clamp_sample_coord(x as i32 + offset, image.width);
                    let idx = pixel_idx(image.width, x, y);
                    let sidx = pixel_idx(image.width, sx, y);
                    image.data[idx] = src[sidx];
                    image.data[idx + 1] = src[sidx + 1];
                    image.data[idx + 2] = src[sidx + 2];
                }
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Line Glitch"
    }
}

pub struct BitCorruption {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for BitCorruption {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let threshold = (self.intensity / 100.0).clamp(0.0, 1.0) * 0.08;
        for y in 0..image.height {
            for x in 0..image.width {
                if rand01(x, y, ctx.seed) < threshold {
                    let idx = pixel_idx(image.width, x, y);
                    let bit = 1 << ((rand01(x + 7, y + 11, ctx.seed) * 3.0) as u8);
                    image.data[idx] ^= bit;
                    image.data[idx + 1] ^= bit;
                    image.data[idx + 2] ^= bit;
                }
            }
        }
        Ok(())
    }

    fn name(&self) -> &str {
        "Bit Corruption"
    }
}

pub struct QuantizeGlitch {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for QuantizeGlitch {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let depth = (8.0 - (self.intensity / 100.0) * 6.0).clamp(2.0, 8.0) as u8;
        let levels = 1u8 << (depth.min(7) - 1);
        let animate = (ctx.frame_index % 3) as u8;

        for idx in (0..image.data.len()).step_by(4) {
            image.data[idx] = quantize(image.data[idx], levels.saturating_add(animate));
            image.data[idx + 1] = quantize(image.data[idx + 1], levels);
            image.data[idx + 2] = quantize(image.data[idx + 2], levels.saturating_sub(animate.min(1)));
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Quantize Glitch"
    }
}

pub struct ChromaticAberration {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for ChromaticAberration {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let src = image.data.clone();
        let shift = ((self.intensity / 100.0) * 6.0).round() as i32 + ((ctx.frame_index % 2) as i32);

        for y in 0..image.height {
            for x in 0..image.width {
                let idx = pixel_idx(image.width, x, y);
                let rx = clamp_sample_coord(x as i32 + shift, image.width);
                let gy = clamp_sample_coord(y as i32 + shift / 2, image.height);
                let bx = clamp_sample_coord(x as i32 - shift, image.width);
                image.data[idx] = src[pixel_idx(image.width, rx, y)];
                image.data[idx + 1] = src[pixel_idx(image.width, x, gy) + 1];
                image.data[idx + 2] = src[pixel_idx(image.width, bx, y) + 2];
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Chromatic Aberration"
    }
}

pub struct LineRepeat {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for LineRepeat {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let src = image.data.clone();
        let threshold = (self.intensity / 100.0).clamp(0.0, 1.0) * 0.3;

        for y in 1..image.height {
            if rand01(123, y, ctx.seed) < threshold {
                let from = clamp_sample_coord(
                    y as i32 - 1 - (rand01(124, y, ctx.seed) * 3.0) as i32,
                    image.height,
                );
                for x in 0..image.width {
                    let idx = pixel_idx(image.width, x, y);
                    let sidx = pixel_idx(image.width, x, from);
                    image.data[idx] = src[sidx];
                    image.data[idx + 1] = src[sidx + 1];
                    image.data[idx + 2] = src[sidx + 2];
                }
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Line Repeat"
    }
}

pub struct PixelSwap {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for PixelSwap {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        if image.width < 2 || image.height < 2 {
            return Ok(());
        }

        let threshold = (self.intensity / 100.0).clamp(0.0, 1.0) * 0.2;
        for y in 0..image.height - 1 {
            for x in 0..image.width - 1 {
                if rand01(x, y, ctx.seed) < threshold {
                    let idx1 = pixel_idx(image.width, x, y);
                    let idx2 = if rand01(x + 5, y + 9, ctx.seed) < 0.5 {
                        pixel_idx(image.width, x + 1, y)
                    } else {
                        pixel_idx(image.width, x, y + 1)
                    };

                    for c in 0..3 {
                        image.data.swap(idx1 + c, idx2 + c);
                    }
                }
            }
        }
        Ok(())
    }

    fn name(&self) -> &str {
        "Pixel Swap"
    }
}

pub struct NoiseInjection {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for NoiseInjection {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let amount = (self.intensity / 100.0) * 48.0;
        for y in 0..image.height {
            for x in 0..image.width {
                let idx = pixel_idx(image.width, x, y);
                let n = (rand01(x, y, ctx.seed) * 2.0 - 1.0) * amount;
                for c in 0..3 {
                    image.data[idx + c] = (image.data[idx + c] as f32 + n).clamp(0.0, 255.0) as u8;
                }
            }
        }
        Ok(())
    }

    fn name(&self) -> &str {
        "Noise Injection"
    }
}

pub struct Stripe {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for Stripe {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let darken = (self.intensity / 100.0) * 0.6;
        let phase = ctx.frame_index % 4;

        for y in 0..image.height {
            let is_stripe = ((y + phase) % 4) < 2;
            if is_stripe {
                for x in 0..image.width {
                    let idx = pixel_idx(image.width, x, y);
                    image.data[idx] = (image.data[idx] as f32 * (1.0 - darken)) as u8;
                    image.data[idx + 1] = (image.data[idx + 1] as f32 * (1.0 - darken)) as u8;
                    image.data[idx + 2] = (image.data[idx + 2] as f32 * (1.0 - darken)) as u8;
                }
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Stripe"
    }
}

pub struct PixelShift {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for PixelShift {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let src = image.data.clone();
        let amp = ((self.intensity / 100.0) * 12.0).max(1.0);

        for y in 0..image.height {
            let shift = (ctx.time_seconds * 6.0 + y as f32 * 0.05).sin() * amp;
            for x in 0..image.width {
                let sx = clamp_sample_coord(x as i32 + shift as i32, image.width);
                let idx = pixel_idx(image.width, x, y);
                let sidx = pixel_idx(image.width, sx, y);
                image.data[idx] = src[sidx];
                image.data[idx + 1] = src[sidx + 1];
                image.data[idx + 2] = src[sidx + 2];
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Pixel Shift"
    }
}

pub struct CompressArtifact {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for CompressArtifact {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let block = 8u32;
        let crush = ((self.intensity / 100.0) * 48.0).round().clamp(1.0, 64.0) as u8;

        for by in (0..image.height).step_by(block as usize) {
            for bx in (0..image.width).step_by(block as usize) {
                let mut sr = 0u32;
                let mut sg = 0u32;
                let mut sb = 0u32;
                let mut count = 0u32;

                for y in by..(by + block).min(image.height) {
                    for x in bx..(bx + block).min(image.width) {
                        let idx = pixel_idx(image.width, x, y);
                        sr += image.data[idx] as u32;
                        sg += image.data[idx + 1] as u32;
                        sb += image.data[idx + 2] as u32;
                        count += 1;
                    }
                }

                if count == 0 {
                    continue;
                }

                let mut r = (sr / count) as u8;
                let mut g = (sg / count) as u8;
                let mut b = (sb / count) as u8;
                r = quantize(r, crush);
                g = quantize(g, crush);
                b = quantize(b, crush);

                for y in by..(by + block).min(image.height) {
                    for x in bx..(bx + block).min(image.width) {
                        let idx = pixel_idx(image.width, x, y);
                        image.data[idx] = r;
                        image.data[idx + 1] = g;
                        image.data[idx + 2] = b;
                    }
                }
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Compress Artifact"
    }
}

pub struct Interlace {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for Interlace {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let src = image.data.clone();
        let field = ctx.frame_index % 2;
        let blend = (self.intensity / 100.0).clamp(0.0, 1.0) * 0.8;

        for y in 0..image.height {
            if y % 2 != field {
                let from_y = clamp_sample_coord(y as i32 - 1, image.height);
                for x in 0..image.width {
                    let idx = pixel_idx(image.width, x, y);
                    let sidx = pixel_idx(image.width, x, from_y);
                    for c in 0..3 {
                        image.data[idx + c] =
                            (src[idx + c] as f32 * (1.0 - blend) + src[sidx + c] as f32 * blend) as u8;
                    }
                }
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Interlace"
    }
}

pub struct Posterize {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for Posterize {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let levels = (2.0 + (1.0 - self.intensity / 100.0) * 14.0).round() as u8;
        for idx in (0..image.data.len()).step_by(4) {
            image.data[idx] = quantize(image.data[idx], levels);
            image.data[idx + 1] = quantize(image.data[idx + 1], levels);
            image.data[idx + 2] = quantize(image.data[idx + 2], levels);
        }
        Ok(())
    }

    fn name(&self) -> &str {
        "Posterize"
    }
}

pub struct DitherMix {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for DitherMix {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let src = image.data.clone();
        let mix = (self.intensity / 100.0).clamp(0.0, 1.0);

        for y in 0..image.height {
            for x in 0..image.width {
                let idx = pixel_idx(image.width, x, y);
                let mut r = src[idx] as f32;
                let mut g = src[idx + 1] as f32;
                let mut b = src[idx + 2] as f32;

                let checker = if ((x + y + ctx.frame_index) % 2) == 0 { 1.0 } else { -1.0 };
                let bayer_like = (((x % 4) * 4 + (y % 4)) as f32 / 16.0) - 0.5;
                let noise = rand01(x, y, ctx.seed) - 0.5;
                let t = checker * 8.0 + bayer_like * 12.0 + noise * 16.0;

                r = (r + t * mix).clamp(0.0, 255.0);
                g = (g + t * mix).clamp(0.0, 255.0);
                b = (b + t * mix).clamp(0.0, 255.0);

                image.data[idx] = r as u8;
                image.data[idx + 1] = g as u8;
                image.data[idx + 2] = b as u8;
            }
        }

        apply_palette(image, &self.palette);
        Ok(())
    }

    fn name(&self) -> &str {
        "Dither Mix"
    }
}

pub struct Temporal {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for Temporal {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let amount = (self.intensity / 100.0) * 32.0;
        for y in 0..image.height {
            for x in 0..image.width {
                let idx = pixel_idx(image.width, x, y);
                let wave = ((ctx.time_seconds * 3.0 + x as f32 * 0.01 + y as f32 * 0.02) * PI).sin();
                let n = (rand01(x + ctx.frame_index, y, ctx.seed) - 0.5) * amount + wave * amount * 0.5;
                for c in 0..3 {
                    image.data[idx + c] = (image.data[idx + c] as f32 + n).clamp(0.0, 255.0) as u8;
                }
            }
        }
        Ok(())
    }

    fn name(&self) -> &str {
        "Temporal"
    }
}

pub struct Warp {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for Warp {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let src = image.data.clone();
        let amp = (self.intensity / 100.0) * 10.0;

        for y in 0..image.height {
            for x in 0..image.width {
                let xf = x as f32;
                let yf = y as f32;
                let dx = (yf * 0.06 + ctx.time_seconds * 5.0).sin() * amp;
                let dy = (xf * 0.06 + ctx.time_seconds * 4.0).cos() * amp;
                let sx = clamp_sample_coord((xf + dx) as i32, image.width);
                let sy = clamp_sample_coord((yf + dy) as i32, image.height);
                let idx = pixel_idx(image.width, x, y);
                let sidx = pixel_idx(image.width, sx, sy);
                image.data[idx] = src[sidx];
                image.data[idx + 1] = src[sidx + 1];
                image.data[idx + 2] = src[sidx + 2];
            }
        }
        Ok(())
    }

    fn name(&self) -> &str {
        "Warp"
    }
}

pub struct PixelSort {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for PixelSort {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let threshold = 48.0 + (self.intensity / 100.0).clamp(0.0, 1.0) * 112.0;
        let max_run = 4 + ((self.intensity / 100.0) * 20.0) as u32;

        for y in 0..image.height {
            let mut x = 0u32;
            while x < image.width {
                let idx = pixel_idx(image.width, x, y);
                let lum = luma_of(image.data[idx], image.data[idx + 1], image.data[idx + 2]);
                if lum < threshold {
                    x += 1;
                    continue;
                }

                let start = x;
                let mut end = x;
                while end < image.width && (end - start) <= max_run {
                    let eidx = pixel_idx(image.width, end, y);
                    let el = luma_of(image.data[eidx], image.data[eidx + 1], image.data[eidx + 2]);
                    if el < threshold {
                        break;
                    }
                    end += 1;
                }

                if end > start + 1 {
                    let mut segment: Vec<[u8; 3]> = (start..end)
                        .map(|sx| {
                            let sidx = pixel_idx(image.width, sx, y);
                            [image.data[sidx], image.data[sidx + 1], image.data[sidx + 2]]
                        })
                        .collect();

                    let reverse = rand01(start, y, ctx.seed) > 0.5;
                    segment.sort_by(|a, b| {
                        let la = luma_of(a[0], a[1], a[2]);
                        let lb = luma_of(b[0], b[1], b[2]);
                        if reverse {
                            lb.partial_cmp(&la).unwrap_or(std::cmp::Ordering::Equal)
                        } else {
                            la.partial_cmp(&lb).unwrap_or(std::cmp::Ordering::Equal)
                        }
                    });

                    for (offset, rgb) in segment.iter().enumerate() {
                        let didx = pixel_idx(image.width, start + offset as u32, y);
                        image.data[didx] = rgb[0];
                        image.data[didx + 1] = rgb[1];
                        image.data[didx + 2] = rgb[2];
                    }
                }

                x = end.max(x + 1);
            }
        }

        if !self.palette.is_empty() {
            apply_palette(image, &self.palette);
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Pixel Sort"
    }
}

pub struct JpegArtifacts {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for JpegArtifacts {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let src = image.data.clone();
        let block = 8u32;
        let blend = (self.intensity / 100.0).clamp(0.0, 1.0);
        let jitter = 2.0 + blend * 6.0;

        for by in (0..image.height).step_by(block as usize) {
            for bx in (0..image.width).step_by(block as usize) {
                let mut sr = 0u32;
                let mut sg = 0u32;
                let mut sb = 0u32;
                let mut count = 0u32;

                for y in by..(by + block).min(image.height) {
                    for x in bx..(bx + block).min(image.width) {
                        let idx = pixel_idx(image.width, x, y);
                        sr += src[idx] as u32;
                        sg += src[idx + 1] as u32;
                        sb += src[idx + 2] as u32;
                        count += 1;
                    }
                }

                if count == 0 {
                    continue;
                }

                let mut br = (sr / count) as f32;
                let mut bg = (sg / count) as f32;
                let mut bb = (sb / count) as f32;

                let n = (rand01(bx, by, ctx.seed) - 0.5) * jitter;
                br = (br + n).clamp(0.0, 255.0);
                bg = (bg - n * 0.5).clamp(0.0, 255.0);
                bb = (bb + n * 0.75).clamp(0.0, 255.0);

                let q = (8.0 + (1.0 - blend) * 24.0).round() as u8;
                let qr = quantize(br as u8, q);
                let qg = quantize(bg as u8, q);
                let qb = quantize(bb as u8, q);

                for y in by..(by + block).min(image.height) {
                    for x in bx..(bx + block).min(image.width) {
                        let idx = pixel_idx(image.width, x, y);
                        image.data[idx] = (src[idx] as f32 * (1.0 - blend) + qr as f32 * blend) as u8;
                        image.data[idx + 1] =
                            (src[idx + 1] as f32 * (1.0 - blend) + qg as f32 * blend) as u8;
                        image.data[idx + 2] =
                            (src[idx + 2] as f32 * (1.0 - blend) + qb as f32 * blend) as u8;
                    }
                }
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "JPEG Artifacts"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_image() -> ImageData {
        ImageData::from_rgba(
            4,
            4,
            vec![
                10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255,
                25, 35, 45, 255, 55, 65, 75, 255, 85, 95, 105, 255, 115, 125, 135, 255,
                20, 30, 40, 255, 50, 60, 70, 255, 80, 90, 100, 255, 110, 120, 130, 255,
                15, 25, 35, 255, 45, 55, 65, 255, 75, 85, 95, 255, 105, 115, 125, 255,
            ],
        )
    }

    #[test]
    fn color_shift_is_deterministic_for_same_frame() {
        let mut a = sample_image();
        let mut b = sample_image();
        let effect = ColorShift {
            palette: vec![[0, 0, 0], [255, 255, 255]],
            intensity: 80.0,
        };
        let ctx = FrameContext::new(3, 10);

        effect.apply(&mut a, &ctx).unwrap();
        effect.apply(&mut b, &ctx).unwrap();

        assert_eq!(a.data, b.data);
    }

    #[test]
    fn temporal_changes_with_frame_index() {
        let mut a = sample_image();
        let mut b = sample_image();
        let effect = Temporal {
            palette: vec![[0, 0, 0], [255, 255, 255]],
            intensity: 65.0,
        };

        effect.apply(&mut a, &FrameContext::new(1, 10)).unwrap();
        effect.apply(&mut b, &FrameContext::new(2, 10)).unwrap();

        assert_ne!(a.data, b.data);
    }

    #[test]
    fn pixel_sort_runs_without_panics() {
        let mut image = sample_image();
        let effect = PixelSort {
            palette: vec![[0, 0, 0], [255, 255, 255]],
            intensity: 75.0,
        };

        effect.apply(&mut image, &FrameContext::new(3, 12)).unwrap();
        assert_eq!(image.data.len(), (4 * 4 * 4) as usize);
    }
}
