// Pattern dithering algorithms

use std::f32::consts::PI;

use super::color::find_closest_color_oklab;
use super::context::FrameContext;
use super::types::{Effect, ImageData};

fn apply_pattern_pixel(image: &mut ImageData, x: u32, y: u32, threshold_shift: f32, palette: &[[u8; 3]]) {
    let idx = (y * image.width + x) as usize * 4;

    let r = (image.data[idx] as f32 + threshold_shift).clamp(0.0, 255.0) as u8;
    let g = (image.data[idx + 1] as f32 + threshold_shift).clamp(0.0, 255.0) as u8;
    let b = (image.data[idx + 2] as f32 + threshold_shift).clamp(0.0, 255.0) as u8;

    let [new_r, new_g, new_b] = find_closest_color_oklab(r, g, b, palette);
    image.data[idx] = new_r;
    image.data[idx + 1] = new_g;
    image.data[idx + 2] = new_b;
}

fn shift_from_threshold(threshold: f32, intensity: f32) -> f32 {
    (threshold - 0.5) * (intensity / 100.0) * 96.0
}

pub struct DiagonalLinePattern {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
    pub spacing: u32,
}

impl Effect for DiagonalLinePattern {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let spacing = self.spacing.max(2);
        for y in 0..image.height {
            for x in 0..image.width {
                let stripe = ((x + y) % spacing) as f32 / spacing as f32;
                apply_pattern_pixel(
                    image,
                    x,
                    y,
                    shift_from_threshold(stripe, self.intensity),
                    &self.palette,
                );
            }
        }
        Ok(())
    }

    fn name(&self) -> &str {
        "Diagonal Line"
    }
}

pub struct CrossHatchPattern {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
    pub spacing: u32,
}

impl Effect for CrossHatchPattern {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let spacing = self.spacing.max(2);
        for y in 0..image.height {
            for x in 0..image.width {
                let a = ((x + y) % spacing) as f32 / spacing as f32;
                let b = ((x + spacing - (y % spacing)) % spacing) as f32 / spacing as f32;
                let threshold = (a.min(b) * 0.7 + a.max(b) * 0.3).clamp(0.0, 1.0);
                apply_pattern_pixel(
                    image,
                    x,
                    y,
                    shift_from_threshold(threshold, self.intensity),
                    &self.palette,
                );
            }
        }
        Ok(())
    }

    fn name(&self) -> &str {
        "Cross Hatch"
    }
}

pub struct CircleHalftonePattern {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
    pub cell_size: u32,
}

impl Effect for CircleHalftonePattern {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let cell_size = self.cell_size.max(2);
        let cell = cell_size as f32;
        let center = (cell - 1.0) * 0.5;
        let max_dist = center.max(1.0) * (2.0f32).sqrt();

        for y in 0..image.height {
            for x in 0..image.width {
                let dx = (x % cell_size) as f32 - center;
                let dy = (y % cell_size) as f32 - center;
                let threshold = (dx.hypot(dy) / max_dist).clamp(0.0, 1.0);
                apply_pattern_pixel(
                    image,
                    x,
                    y,
                    shift_from_threshold(threshold, self.intensity),
                    &self.palette,
                );
            }
        }
        Ok(())
    }

    fn name(&self) -> &str {
        "Circle Halftone"
    }
}

pub struct SquareHalftonePattern {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
    pub cell_size: u32,
}

impl Effect for SquareHalftonePattern {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let cell_size = self.cell_size.max(2);
        let center = (cell_size as f32 - 1.0) * 0.5;

        for y in 0..image.height {
            for x in 0..image.width {
                let dx = ((x % cell_size) as f32 - center).abs();
                let dy = ((y % cell_size) as f32 - center).abs();
                let threshold = (dx.max(dy) / center.max(1.0)).clamp(0.0, 1.0);
                apply_pattern_pixel(
                    image,
                    x,
                    y,
                    shift_from_threshold(threshold, self.intensity),
                    &self.palette,
                );
            }
        }
        Ok(())
    }

    fn name(&self) -> &str {
        "Square Halftone"
    }
}

pub struct TriangleWavePattern {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
    pub frequency: f32,
}

impl Effect for TriangleWavePattern {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let freq = self.frequency.max(0.001);
        let phase = ctx.time_seconds * freq;

        for y in 0..image.height {
            for x in 0..image.width {
                let t = ((x as f32 / image.width.max(1) as f32) * freq + phase).fract();
                let tri = if t < 0.5 { t * 2.0 } else { (1.0 - t) * 2.0 };
                let y_mod = ((y as f32 / image.height.max(1) as f32) * PI).sin() * 0.15;
                let threshold = (tri + y_mod).clamp(0.0, 1.0);
                apply_pattern_pixel(
                    image,
                    x,
                    y,
                    shift_from_threshold(threshold, self.intensity),
                    &self.palette,
                );
            }
        }
        Ok(())
    }

    fn name(&self) -> &str {
        "Triangle Wave"
    }
}

pub struct HexagonGridPattern {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
    pub cell_size: u32,
}

impl Effect for HexagonGridPattern {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let cell_size = self.cell_size.max(4) as f32;
        let hex_w = cell_size;
        let hex_h = (3.0f32).sqrt() * 0.5 * hex_w;

        for y in 0..image.height {
            for x in 0..image.width {
                let yf = y as f32;
                let xf = x as f32;

                let row = (yf / hex_h).floor();
                let row_offset = if (row as i32) % 2 == 0 { 0.0 } else { hex_w * 0.5 };
                let local_x = (xf + row_offset).rem_euclid(hex_w);
                let local_y = yf.rem_euclid(hex_h);

                let nx = (local_x / hex_w - 0.5).abs();
                let ny = (local_y / hex_h - 0.5).abs();
                let threshold = (nx * 0.7 + ny * 0.9).clamp(0.0, 1.0);

                apply_pattern_pixel(
                    image,
                    x,
                    y,
                    shift_from_threshold(threshold, self.intensity),
                    &self.palette,
                );
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Hexagon Grid"
    }
}

pub struct SpiralPattern {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
    pub turns: f32,
}

impl Effect for SpiralPattern {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let cx = (image.width as f32 - 1.0) * 0.5;
        let cy = (image.height as f32 - 1.0) * 0.5;
        let max_r = cx.hypot(cy).max(1.0);
        let turns = self.turns.max(0.25);
        let phase = ctx.time_seconds * 0.4;

        for y in 0..image.height {
            for x in 0..image.width {
                let dx = x as f32 - cx;
                let dy = y as f32 - cy;
                let r = dx.hypot(dy) / max_r;
                let angle = dy.atan2(dx);
                let spiral = (angle + r * turns * PI * 2.0 + phase).sin() * 0.5 + 0.5;
                let threshold = (spiral * 0.75 + r * 0.25).clamp(0.0, 1.0);

                apply_pattern_pixel(
                    image,
                    x,
                    y,
                    shift_from_threshold(threshold, self.intensity),
                    &self.palette,
                );
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Spiral"
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
                20, 20, 20, 255, 120, 120, 120, 255, 200, 200, 200, 255, 80, 80, 80, 255,
            ],
        )
    }

    fn palette() -> Vec<[u8; 3]> {
        vec![[0, 0, 0], [255, 255, 255]]
    }

    #[test]
    fn circle_halftone_quantizes_pixels() {
        let mut image = tiny_image();
        let effect = CircleHalftonePattern {
            palette: palette(),
            intensity: 100.0,
            cell_size: 4,
        };

        effect
            .apply(&mut image, &FrameContext::static_frame())
            .expect("circle halftone should run");

        for idx in (0..image.data.len()).step_by(4) {
            assert!(image.data[idx] == 0 || image.data[idx] == 255);
        }
    }

    #[test]
    fn triangle_wave_is_deterministic_for_same_context() {
        let mut image_a = tiny_image();
        let mut image_b = tiny_image();

        let effect = TriangleWavePattern {
            palette: palette(),
            intensity: 80.0,
            frequency: 4.0,
        };

        let ctx = FrameContext::new(12, 100);
        effect
            .apply(&mut image_a, &ctx)
            .expect("first triangle run should succeed");
        effect
            .apply(&mut image_b, &ctx)
            .expect("second triangle run should succeed");

        assert_eq!(image_a.data, image_b.data);
    }

    #[test]
    fn spiral_pattern_runs() {
        let mut image = tiny_image();
        let effect = SpiralPattern {
            palette: palette(),
            intensity: 70.0,
            turns: 3.0,
        };

        effect
            .apply(&mut image, &FrameContext::new(2, 24))
            .expect("spiral should run");

        assert_eq!(image.data.len(), 16);
    }
}
