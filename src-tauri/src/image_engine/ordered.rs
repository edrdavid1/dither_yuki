// Ordered dithering algorithms (Bayer matrices)

use super::types::{Effect, ImageData};

/// Find closest color in palette
fn find_closest_color(r: u8, g: u8, b: u8, palette: &[[u8; 3]]) -> [u8; 3] {
    let mut min_dist = f32::MAX;
    let mut closest = palette[0];

    for color in palette {
        let dr = (r as f32) - (color[0] as f32);
        let dg = (g as f32) - (color[1] as f32);
        let db = (b as f32) - (color[2] as f32);
        let dist = dr * dr + dg * dg + db * db;

        if dist < min_dist {
            min_dist = dist;
            closest = *color;
        }
    }

    closest
}

/// Bayer matrix 2x2
const BAYER_2X2: [[u8; 2]; 2] = [[0, 2], [3, 1]];

/// Bayer matrix 4x4
const BAYER_4X4: [[u8; 4]; 4] = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
];

/// Ordered dithering with Bayer matrix
pub struct BayerDither {
    pub size: u32, // 2, 4, or 8
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for BayerDither {
    fn apply(&self, image: &mut ImageData) -> Result<(), String> {
        let width = image.width;
        let height = image.height;
        let intensity = self.intensity / 100.0;

        let threshold_factor = intensity * 64.0;

        for y in 0..height {
            for x in 0..width {
                let idx = ((y) * width + (x)) as usize * 4;

                let threshold = match self.size {
                    2 => {
                        let val = BAYER_2X2[(y as usize) % 2][(x as usize) % 2] as f32;
                        (val / 4.0 - 0.5) * threshold_factor
                    }
                    4 => {
                        let val = BAYER_4X4[(y as usize) % 4][(x as usize) % 4] as f32;
                        (val / 16.0 - 0.5) * threshold_factor
                    }
                    _ => 0.0, // Default: no dither
                };

                let r = ((image.data[idx] as f32) + threshold).max(0.0).min(255.0) as u8;
                let g = ((image.data[idx + 1] as f32) + threshold).max(0.0).min(255.0) as u8;
                let b = ((image.data[idx + 2] as f32) + threshold).max(0.0).min(255.0) as u8;

                let [new_r, new_g, new_b] = find_closest_color(r, g, b, &self.palette);

                image.data[idx] = new_r;
                image.data[idx + 1] = new_g;
                image.data[idx + 2] = new_b;
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        match self.size {
            2 => "Bayer 2x2",
            4 => "Bayer 4x4",
            _ => "Ordered",
        }
    }
}
