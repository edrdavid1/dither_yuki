// Ordered dithering algorithms

use super::color::find_closest_color_oklab;
use super::context::FrameContext;
use super::types::{Effect, ImageData};

/// Bayer matrix 2x2
const BAYER_2X2: [[u8; 2]; 2] = [[0, 2], [3, 1]];

/// Bayer matrix 4x4
const BAYER_4X4: [[u8; 4]; 4] = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
];

/// Bayer matrix 8x8
const BAYER_8X8: [[u8; 8]; 8] = [
    [0, 48, 12, 60, 3, 51, 15, 63],
    [32, 16, 44, 28, 35, 19, 47, 31],
    [8, 56, 4, 52, 11, 59, 7, 55],
    [40, 24, 36, 20, 43, 27, 39, 23],
    [2, 50, 14, 62, 1, 49, 13, 61],
    [34, 18, 46, 30, 33, 17, 45, 29],
    [10, 58, 6, 54, 9, 57, 5, 53],
    [42, 26, 38, 22, 41, 25, 37, 21],
];

fn hash2d(x: u32, y: u32, seed: u64) -> u32 {
    let mut h = seed
        .wrapping_add((x as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15))
        .wrapping_add((y as u64).wrapping_mul(0xC2B2_AE3D_27D4_EB4F));
    h ^= h >> 33;
    h = h.wrapping_mul(0xff51_afd7_ed55_8ccd);
    h ^= h >> 33;
    h = h.wrapping_mul(0xc4ce_b9fe_1a85_ec53);
    h ^= h >> 33;
    (h & 0xFFFF_FFFF) as u32
}

fn threshold_to_shift(threshold: f32, intensity: f32) -> f32 {
    (threshold - 0.5) * (intensity / 100.0) * 96.0
}

fn apply_ordered_pixel(image: &mut ImageData, x: u32, y: u32, threshold_shift: f32, palette: &[[u8; 3]]) {
    let idx = (y * image.width + x) as usize * 4;

    let r = (image.data[idx] as f32 + threshold_shift).clamp(0.0, 255.0) as u8;
    let g = (image.data[idx + 1] as f32 + threshold_shift).clamp(0.0, 255.0) as u8;
    let b = (image.data[idx + 2] as f32 + threshold_shift).clamp(0.0, 255.0) as u8;

    let [new_r, new_g, new_b] = find_closest_color_oklab(r, g, b, palette);
    image.data[idx] = new_r;
    image.data[idx + 1] = new_g;
    image.data[idx + 2] = new_b;
}

/// Ordered dithering with Bayer matrix
pub struct BayerDither {
    pub size: u32, // 2, 4, or 8
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for BayerDither {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        for y in 0..image.height {
            for x in 0..image.width {
                let threshold = match self.size {
                    2 => BAYER_2X2[(y as usize) % 2][(x as usize) % 2] as f32 / 4.0,
                    4 => BAYER_4X4[(y as usize) % 4][(x as usize) % 4] as f32 / 16.0,
                    8 => BAYER_8X8[(y as usize) % 8][(x as usize) % 8] as f32 / 64.0,
                    _ => 0.5,
                };

                apply_ordered_pixel(
                    image,
                    x,
                    y,
                    threshold_to_shift(threshold, self.intensity),
                    &self.palette,
                );
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        match self.size {
            2 => "Bayer 2x2",
            4 => "Bayer 4x4",
            8 => "Bayer 8x8",
            _ => "Ordered",
        }
    }
}

pub struct BlueNoiseDither {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for BlueNoiseDither {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        for y in 0..image.height {
            for x in 0..image.width {
                let a = hash2d(x, y, ctx.seed) as f32 / u32::MAX as f32;
                let b = hash2d(x.wrapping_mul(3), y.wrapping_mul(5), ctx.seed ^ 0xA511E9B3) as f32
                    / u32::MAX as f32;
                let threshold = (a * 0.7 + b * 0.3).clamp(0.0, 1.0);
                apply_ordered_pixel(
                    image,
                    x,
                    y,
                    threshold_to_shift(threshold, self.intensity),
                    &self.palette,
                );
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Blue Noise"
    }
}

pub struct VoidAndClusterDither {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for VoidAndClusterDither {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        for y in 0..image.height {
            for x in 0..image.width {
                let coarse = hash2d(x / 4, y / 4, ctx.seed ^ 0xC001D00D) as f32 / u32::MAX as f32;
                let fine = hash2d(x, y, ctx.seed ^ 0x1BADB002) as f32 / u32::MAX as f32;
                let mut threshold = (coarse * 0.55 + fine * 0.45).clamp(0.0, 1.0);
                threshold = (threshold - 0.5) * 0.85 + 0.5;
                apply_ordered_pixel(
                    image,
                    x,
                    y,
                    threshold_to_shift(threshold, self.intensity),
                    &self.palette,
                );
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Void-and-Cluster"
    }
}

pub struct ClusteredHalftoneDither {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
    pub cell_size: u32,
}

impl Effect for ClusteredHalftoneDither {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let cell = self.cell_size.max(2) as f32;
        let center = (cell - 1.0) * 0.5;

        for y in 0..image.height {
            for x in 0..image.width {
                let dx = (x % self.cell_size.max(2)) as f32 - center;
                let dy = (y % self.cell_size.max(2)) as f32 - center;
                let dist = (dx * dx + dy * dy).sqrt();
                let max_dist = (2.0f32).sqrt() * center.max(1.0);
                let threshold = (dist / max_dist).clamp(0.0, 1.0);
                apply_ordered_pixel(
                    image,
                    x,
                    y,
                    threshold_to_shift(threshold, self.intensity),
                    &self.palette,
                );
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Clustered Halftone"
    }
}

pub struct DispersedHalftoneDither {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for DispersedHalftoneDither {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        for y in 0..image.height {
            for x in 0..image.width {
                let base = BAYER_4X4[(y as usize) % 4][(x as usize) % 4] as f32 / 16.0;
                let jitter = (hash2d(x, y, ctx.seed ^ 0xDEADBEEF) as f32 / u32::MAX as f32 - 0.5) * 0.22;
                let threshold = (base + jitter).clamp(0.0, 1.0);
                apply_ordered_pixel(
                    image,
                    x,
                    y,
                    threshold_to_shift(threshold, self.intensity),
                    &self.palette,
                );
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Dispersed Halftone"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tiny_image() -> ImageData {
        ImageData::from_rgba(
            2,
            2,
            vec![
                10, 20, 30, 255, 110, 120, 130, 255, 210, 220, 230, 255, 80, 90, 100, 255,
            ],
        )
    }

    fn palette() -> Vec<[u8; 3]> {
        vec![[0, 0, 0], [255, 255, 255]]
    }

    #[test]
    fn bayer_8x8_runs_and_quantizes() {
        let mut image = tiny_image();
        let effect = BayerDither {
            size: 8,
            palette: palette(),
            intensity: 100.0,
        };
        effect
            .apply(&mut image, &FrameContext::static_frame())
            .expect("bayer 8x8 should run");

        for idx in (0..image.data.len()).step_by(4) {
            assert!(image.data[idx] == 0 || image.data[idx] == 255);
            assert!(image.data[idx + 1] == 0 || image.data[idx + 1] == 255);
            assert!(image.data[idx + 2] == 0 || image.data[idx + 2] == 255);
        }
    }

    #[test]
    fn blue_noise_is_deterministic_for_same_seed() {
        let mut image_a = tiny_image();
        let mut image_b = tiny_image();
        let effect = BlueNoiseDither {
            palette: palette(),
            intensity: 75.0,
        };

        let ctx = FrameContext::new(5, 10);
        effect
            .apply(&mut image_a, &ctx)
            .expect("first run should succeed");
        effect
            .apply(&mut image_b, &ctx)
            .expect("second run should succeed");

        assert_eq!(image_a.data, image_b.data);
    }
}
