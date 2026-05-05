// Special effects (16) + CRT/LCD emulation (2)

use std::f32::consts::PI;

use super::blur::FastGaussianBlur;
use super::color::find_closest_color_oklab;
use super::context::FrameContext;
use super::types::{Effect, ImageData};

fn idx(width: u32, x: u32, y: u32) -> usize {
    ((y * width + x) * 4) as usize
}

fn clamp_coord(value: i32, max: u32) -> u32 {
    if value < 0 {
        0
    } else if value as u32 >= max {
        max.saturating_sub(1)
    } else {
        value as u32
    }
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

fn luminance(r: u8, g: u8, b: u8) -> f32 {
    0.2126 * r as f32 + 0.7152 * g as f32 + 0.0722 * b as f32
}

fn apply_palette(image: &mut ImageData, palette: &[[u8; 3]]) {
    if palette.is_empty() {
        return;
    }

    for y in 0..image.height {
        for x in 0..image.width {
            let i = idx(image.width, x, y);
            let [nr, ng, nb] = find_closest_color_oklab(
                image.data[i],
                image.data[i + 1],
                image.data[i + 2],
                palette,
            );
            image.data[i] = nr;
            image.data[i + 1] = ng;
            image.data[i + 2] = nb;
        }
    }
}

fn sobel_edge(src: &ImageData) -> Vec<f32> {
    let mut out = vec![0.0; (src.width * src.height) as usize];

    for y in 0..src.height {
        for x in 0..src.width {
            let mut gx = 0.0;
            let mut gy = 0.0;

            for ky in -1..=1 {
                for kx in -1..=1 {
                    let sx = clamp_coord(x as i32 + kx, src.width);
                    let sy = clamp_coord(y as i32 + ky, src.height);
                    let i = idx(src.width, sx, sy);
                    let l = luminance(src.data[i], src.data[i + 1], src.data[i + 2]);

                    let wx = match (kx, ky) {
                        (-1, -1) | (-1, 1) => -1.0,
                        (1, -1) | (1, 1) => 1.0,
                        (-1, 0) => -2.0,
                        (1, 0) => 2.0,
                        _ => 0.0,
                    };
                    let wy = match (kx, ky) {
                        (-1, -1) | (1, -1) => -1.0,
                        (-1, 1) | (1, 1) => 1.0,
                        (0, -1) => -2.0,
                        (0, 1) => 2.0,
                        _ => 0.0,
                    };
                    gx += l * wx;
                    gy += l * wy;
                }
            }

            out[(y * src.width + x) as usize] = (gx * gx + gy * gy).sqrt();
        }
    }

    out
}

pub struct PerlinDither {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for PerlinDither {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let amp = (self.intensity / 100.0) * 42.0;
        for y in 0..image.height {
            for x in 0..image.width {
                let i = idx(image.width, x, y);
                let coarse = noise01(x / 4, y / 4, ctx.seed ^ 0xABCDEF);
                let fine = noise01(x, y, ctx.seed);
                let n = (coarse * 0.7 + fine * 0.3 - 0.5) * amp;
                for c in 0..3 {
                    image.data[i + c] = (image.data[i + c] as f32 + n).clamp(0.0, 255.0) as u8;
                }
            }
        }
        apply_palette(image, &self.palette);
        Ok(())
    }
    fn name(&self) -> &str { "Perlin Dither" }
}

pub struct Stipple {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for Stipple {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let density = (self.intensity / 100.0).clamp(0.05, 1.0);
        for y in 0..image.height {
            for x in 0..image.width {
                let i = idx(image.width, x, y);
                let lum = luminance(image.data[i], image.data[i + 1], image.data[i + 2]) / 255.0;
                let dot = noise01(x, y, ctx.seed) < lum * density;
                let v = if dot { 255 } else { 0 };
                image.data[i] = v;
                image.data[i + 1] = v;
                image.data[i + 2] = v;
            }
        }
        apply_palette(image, &self.palette);
        Ok(())
    }
    fn name(&self) -> &str { "Stipple" }
}

pub struct Hatching {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for Hatching {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let step = (8.0 - (self.intensity / 100.0) * 6.0).round().max(2.0) as u32;
        for y in 0..image.height {
            for x in 0..image.width {
                let i = idx(image.width, x, y);
                let lum = luminance(image.data[i], image.data[i + 1], image.data[i + 2]);
                let d1 = (x + y) % step == 0;
                let d2 = (x + step - (y % step)) % step == 0;
                let ink = if lum < 200.0 && d1 || lum < 120.0 && d2 { 0 } else { 255 };
                image.data[i] = ink;
                image.data[i + 1] = ink;
                image.data[i + 2] = ink;
            }
        }
        apply_palette(image, &self.palette);
        Ok(())
    }
    fn name(&self) -> &str { "Hatching" }
}

pub struct WatercolorLike {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for WatercolorLike {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let original = image.clone();
        FastGaussianBlur {
            radius: 2.0 + (self.intensity / 100.0) * 3.0,
            intensity: 80.0,
        }
        .apply(image, &FrameContext::static_frame())?;

        let edges = sobel_edge(&original);
        let edge_mix = (self.intensity / 100.0) * 0.6;
        for y in 0..image.height {
            for x in 0..image.width {
                let i = idx(image.width, x, y);
                let e = (edges[(y * image.width + x) as usize] / 255.0).clamp(0.0, 1.0);
                let factor = 1.0 - e * edge_mix;
                image.data[i] = (image.data[i] as f32 * factor) as u8;
                image.data[i + 1] = (image.data[i + 1] as f32 * factor) as u8;
                image.data[i + 2] = (image.data[i + 2] as f32 * factor) as u8;
            }
        }
        apply_palette(image, &self.palette);
        Ok(())
    }
    fn name(&self) -> &str { "Watercolor-like" }
}

pub struct InkBleed {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for InkBleed {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let src = image.data.clone();
        let radius = (1.0 + (self.intensity / 100.0) * 2.0).round() as i32;
        for y in 0..image.height {
            for x in 0..image.width {
                let i = idx(image.width, x, y);
                let mut acc = [0f32; 3];
                let mut weight_sum = 0.0;
                for oy in -radius..=radius {
                    for ox in -radius..=radius {
                        let sx = clamp_coord(x as i32 + ox, image.width);
                        let sy = clamp_coord(y as i32 + oy, image.height);
                        let si = idx(image.width, sx, sy);
                        let dist = ((ox * ox + oy * oy) as f32).sqrt().max(1.0);
                        let bias = 1.0 + (noise01(sx, sy, ctx.seed) - 0.5) * 0.4;
                        let w = (1.0 / dist) * bias;
                        acc[0] += src[si] as f32 * w;
                        acc[1] += src[si + 1] as f32 * w;
                        acc[2] += src[si + 2] as f32 * w;
                        weight_sum += w;
                    }
                }
                image.data[i] = (acc[0] / weight_sum).clamp(0.0, 255.0) as u8;
                image.data[i + 1] = (acc[1] / weight_sum).clamp(0.0, 255.0) as u8;
                image.data[i + 2] = (acc[2] / weight_sum).clamp(0.0, 255.0) as u8;
            }
        }
        apply_palette(image, &self.palette);
        Ok(())
    }
    fn name(&self) -> &str { "Ink Bleed" }
}

pub struct ThresholdOnly {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for ThresholdOnly {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let threshold = 255.0 * (1.0 - (self.intensity / 100.0) * 0.5);
        for y in 0..image.height {
            for x in 0..image.width {
                let i = idx(image.width, x, y);
                let lum = luminance(image.data[i], image.data[i + 1], image.data[i + 2]);
                let v = if lum >= threshold { 255 } else { 0 };
                image.data[i] = v;
                image.data[i + 1] = v;
                image.data[i + 2] = v;
            }
        }
        apply_palette(image, &self.palette);
        Ok(())
    }
    fn name(&self) -> &str { "Threshold Only" }
}

pub struct GradientMap {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for GradientMap {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        if self.palette.is_empty() {
            return Ok(());
        }
        let n = self.palette.len().max(2) as f32;
        let blend = (self.intensity / 100.0).clamp(0.0, 1.0);
        for y in 0..image.height {
            for x in 0..image.width {
                let i = idx(image.width, x, y);
                let lum = luminance(image.data[i], image.data[i + 1], image.data[i + 2]) / 255.0;
                let p = (lum * (n - 1.0)).round() as usize;
                let c = self.palette[p.min(self.palette.len() - 1)];
                image.data[i] = (image.data[i] as f32 * (1.0 - blend) + c[0] as f32 * blend) as u8;
                image.data[i + 1] = (image.data[i + 1] as f32 * (1.0 - blend) + c[1] as f32 * blend) as u8;
                image.data[i + 2] = (image.data[i + 2] as f32 * (1.0 - blend) + c[2] as f32 * blend) as u8;
            }
        }
        Ok(())
    }
    fn name(&self) -> &str { "Gradient Map" }
}

pub struct HalftoneAngle {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for HalftoneAngle {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let angle = (ctx.frame_index as f32 * 0.5).to_radians();
        let cs = angle.cos();
        let sn = angle.sin();
        let scale = (10.0 - (self.intensity / 100.0) * 8.0).max(2.0);

        for y in 0..image.height {
            for x in 0..image.width {
                let i = idx(image.width, x, y);
                let xf = x as f32;
                let yf = y as f32;
                let xr = xf * cs - yf * sn;
                let tone = ((xr / scale).sin() * 0.5 + 0.5) * 255.0;
                let lum = luminance(image.data[i], image.data[i + 1], image.data[i + 2]);
                let v = if lum > tone { 255 } else { 0 };
                image.data[i] = v;
                image.data[i + 1] = v;
                image.data[i + 2] = v;
            }
        }
        apply_palette(image, &self.palette);
        Ok(())
    }
    fn name(&self) -> &str { "Halftone Angle" }
}

pub struct EdgeDither {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for EdgeDither {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let src = image.clone();
        let edges = sobel_edge(&src);
        let edge_threshold = 48.0 * (1.2 - (self.intensity / 100.0));

        for y in 0..image.height {
            for x in 0..image.width {
                let i = idx(image.width, x, y);
                let e = edges[(y * image.width + x) as usize];
                if e > edge_threshold {
                    let jitter = if noise01(x, y, ctx.seed) > 0.5 { 24.0 } else { -24.0 };
                    for c in 0..3 {
                        image.data[i + c] = (image.data[i + c] as f32 + jitter).clamp(0.0, 255.0) as u8;
                    }
                }
            }
        }
        apply_palette(image, &self.palette);
        Ok(())
    }
    fn name(&self) -> &str { "Edge Dither" }
}

pub struct WaveletDither {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for WaveletDither {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let src = image.data.clone();
        for y in 0..image.height {
            for x in 0..image.width {
                let i = idx(image.width, x, y);
                let right = idx(image.width, (x + 1).min(image.width - 1), y);
                let down = idx(image.width, x, (y + 1).min(image.height - 1));
                for c in 0..3 {
                    let low = (src[i + c] as u16 + src[right + c] as u16 + src[down + c] as u16) / 3;
                    let high = src[i + c] as i16 - low as i16;
                    let v = low as f32 + high as f32 * (self.intensity / 100.0);
                    image.data[i + c] = v.clamp(0.0, 255.0) as u8;
                }
            }
        }
        apply_palette(image, &self.palette);
        Ok(())
    }
    fn name(&self) -> &str { "Wavelet Dither" }
}

pub struct Voronoi {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for Voronoi {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let src = image.data.clone();
        let cell = (20.0 - (self.intensity / 100.0) * 16.0).max(4.0) as u32;
        for y in 0..image.height {
            for x in 0..image.width {
                let cx = (x / cell) * cell + (noise01(x / cell, y / cell, ctx.seed) * cell as f32) as u32;
                let cy = (y / cell) * cell + (noise01(x / cell + 1, y / cell + 2, ctx.seed) * cell as f32) as u32;
                let sx = cx.min(image.width - 1);
                let sy = cy.min(image.height - 1);
                let i = idx(image.width, x, y);
                let si = idx(image.width, sx, sy);
                image.data[i] = src[si];
                image.data[i + 1] = src[si + 1];
                image.data[i + 2] = src[si + 2];
            }
        }
        apply_palette(image, &self.palette);
        Ok(())
    }
    fn name(&self) -> &str { "Voronoi" }
}

pub struct Scanline {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for Scanline {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let strength = (self.intensity / 100.0) * 0.7;
        for y in 0..image.height {
            if y % 2 == 1 {
                for x in 0..image.width {
                    let i = idx(image.width, x, y);
                    image.data[i] = (image.data[i] as f32 * (1.0 - strength)) as u8;
                    image.data[i + 1] = (image.data[i + 1] as f32 * (1.0 - strength)) as u8;
                    image.data[i + 2] = (image.data[i + 2] as f32 * (1.0 - strength)) as u8;
                }
            }
        }
        apply_palette(image, &self.palette);
        Ok(())
    }
    fn name(&self) -> &str { "Scanline" }
}

pub struct Bloom {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for Bloom {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let base = image.data.clone();
        FastGaussianBlur {
            radius: 3.0,
            intensity: self.intensity,
        }
        .apply(image, &FrameContext::static_frame())?;

        let mix = (self.intensity / 100.0) * 0.5;
        for i in (0..image.data.len()).step_by(4) {
            for c in 0..3 {
                image.data[i + c] =
                    (base[i + c] as f32 * (1.0 - mix) + image.data[i + c] as f32 * (1.0 + mix))
                        .clamp(0.0, 255.0) as u8;
            }
        }

        Ok(())
    }
    fn name(&self) -> &str { "Bloom" }
}

pub struct BloomDither {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for BloomDither {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        Bloom {
            palette: self.palette.clone(),
            intensity: self.intensity,
        }
        .apply(image, &FrameContext::static_frame())?;
        apply_palette(image, &self.palette);
        Ok(())
    }
    fn name(&self) -> &str { "Bloom Dither" }
}

pub struct Marble {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for Marble {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let amp = (self.intensity / 100.0) * 30.0;
        for y in 0..image.height {
            for x in 0..image.width {
                let i = idx(image.width, x, y);
                let n = noise01(x, y, ctx.seed);
                let m = ((x as f32 * 0.08 + y as f32 * 0.05 + n * 6.0).sin() * amp) as f32;
                image.data[i] = (image.data[i] as f32 + m).clamp(0.0, 255.0) as u8;
                image.data[i + 1] = (image.data[i + 1] as f32 + m * 0.7).clamp(0.0, 255.0) as u8;
                image.data[i + 2] = (image.data[i + 2] as f32 + m * 0.5).clamp(0.0, 255.0) as u8;
            }
        }
        apply_palette(image, &self.palette);
        Ok(())
    }
    fn name(&self) -> &str { "Marble" }
}

pub struct EpsilonGlow {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for EpsilonGlow {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        apply_palette(image, &self.palette);
        FastGaussianBlur {
            radius: 1.0 + (self.intensity / 100.0) * 2.0,
            intensity: 25.0 + self.intensity * 0.4,
        }
        .apply(image, &FrameContext::static_frame())?;
        Ok(())
    }
    fn name(&self) -> &str { "Epsilon Glow" }
}

pub struct SubpixelLayout {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for SubpixelLayout {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let strength = (self.intensity / 100.0).clamp(0.0, 1.0);
        for y in 0..image.height {
            for x in 0..image.width {
                let i = idx(image.width, x, y);
                let channel = (x % 3) as usize;
                for c in 0..3 {
                    let keep = if c == channel { 1.0 } else { 1.0 - 0.6 * strength };
                    image.data[i + c] = (image.data[i + c] as f32 * keep).clamp(0.0, 255.0) as u8;
                }
            }
        }
        Ok(())
    }
    fn name(&self) -> &str { "Subpixel Layout" }
}

pub struct ScanlinesWithSoftness {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}
impl Effect for ScanlinesWithSoftness {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let strength = (self.intensity / 100.0) * 0.75;
        for y in 0..image.height {
            let t = (y as f32 / image.height.max(1) as f32) * PI;
            let softness = 0.5 + 0.5 * t.sin();
            let factor = if y % 2 == 0 { 1.0 } else { 1.0 - strength * softness };
            for x in 0..image.width {
                let i = idx(image.width, x, y);
                image.data[i] = (image.data[i] as f32 * factor) as u8;
                image.data[i + 1] = (image.data[i + 1] as f32 * factor) as u8;
                image.data[i + 2] = (image.data[i + 2] as f32 * factor) as u8;
            }
        }
        Ok(())
    }
    fn name(&self) -> &str { "Scanlines with Softness" }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn img() -> ImageData {
        ImageData::from_rgba(
            3,
            3,
            vec![
                10, 20, 30, 255, 90, 100, 110, 255, 200, 210, 220, 255,
                20, 30, 40, 255, 100, 110, 120, 255, 210, 220, 230, 255,
                30, 40, 50, 255, 110, 120, 130, 255, 220, 230, 240, 255,
            ],
        )
    }

    #[test]
    fn bloom_dither_runs() {
        let mut image = img();
        BloomDither {
            palette: vec![[0, 0, 0], [255, 255, 255]],
            intensity: 60.0,
        }
        .apply(&mut image, &FrameContext::static_frame())
        .unwrap();
        assert_eq!(image.data.len(), 3 * 3 * 4);
    }

    #[test]
    fn perlin_is_deterministic_for_same_context() {
        let mut a = img();
        let mut b = img();
        let fx = PerlinDither {
            palette: vec![[0, 0, 0], [255, 255, 255]],
            intensity: 50.0,
        };
        let ctx = FrameContext::new(4, 30);
        fx.apply(&mut a, &ctx).unwrap();
        fx.apply(&mut b, &ctx).unwrap();
        assert_eq!(a.data, b.data);
    }
}
