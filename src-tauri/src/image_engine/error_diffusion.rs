// Error diffusion dithering algorithms

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

/// Distribute error to neighboring pixels
fn distribute_error(
    data: &mut [u8],
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    err_r: f32,
    err_g: f32,
    err_b: f32,
) {
    if x < 0 || x >= width as i32 || y < 0 || y >= height as i32 {
        return;
    }

    let idx = ((y as u32) * width + (x as u32)) as usize * 4;
    if idx + 3 < data.len() {
        data[idx] = ((data[idx] as f32) + err_r).max(0.0).min(255.0) as u8;
        data[idx + 1] = ((data[idx + 1] as f32) + err_g).max(0.0).min(255.0) as u8;
        data[idx + 2] = ((data[idx + 2] as f32) + err_b).max(0.0).min(255.0) as u8;
    }
}

/// Floyd-Steinberg dithering
pub struct FloydSteinberg {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for FloydSteinberg {
    fn apply(&self, image: &mut ImageData) -> Result<(), String> {
        let width = image.width;
        let height = image.height;
        let intensity = self.intensity / 100.0;

        for y in 0..height {
            for x in 0..width {
                let idx = ((y) * width + (x)) as usize * 4;

                let old_r = image.data[idx] as f32;
                let old_g = image.data[idx + 1] as f32;
                let old_b = image.data[idx + 2] as f32;

                let [new_r, new_g, new_b] =
                    find_closest_color(old_r as u8, old_g as u8, old_b as u8, &self.palette);

                image.data[idx] = new_r;
                image.data[idx + 1] = new_g;
                image.data[idx + 2] = new_b;

                let err_r = (old_r - (new_r as f32)) * intensity;
                let err_g = (old_g - (new_g as f32)) * intensity;
                let err_b = (old_b - (new_b as f32)) * intensity;

                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32, err_r * 7.0 / 16.0, err_g * 7.0 / 16.0, err_b * 7.0 / 16.0);
                distribute_error(&mut image.data, width, height, x as i32 - 1, y as i32 + 1, err_r * 3.0 / 16.0, err_g * 3.0 / 16.0, err_b * 3.0 / 16.0);
                distribute_error(&mut image.data, width, height, x as i32, y as i32 + 1, err_r * 5.0 / 16.0, err_g * 5.0 / 16.0, err_b * 5.0 / 16.0);
                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32 + 1, err_r * 1.0 / 16.0, err_g * 1.0 / 16.0, err_b * 1.0 / 16.0);
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Floyd-Steinberg"
    }
}

/// Atkinson dithering
pub struct Atkinson {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for Atkinson {
    fn apply(&self, image: &mut ImageData) -> Result<(), String> {
        let width = image.width;
        let height = image.height;
        let intensity = self.intensity / 100.0 / 8.0; // Atkinson divides by 8

        for y in 0..height {
            for x in 0..width {
                let idx = ((y) * width + (x)) as usize * 4;

                let old_r = image.data[idx] as f32;
                let old_g = image.data[idx + 1] as f32;
                let old_b = image.data[idx + 2] as f32;

                let [new_r, new_g, new_b] =
                    find_closest_color(old_r as u8, old_g as u8, old_b as u8, &self.palette);

                image.data[idx] = new_r;
                image.data[idx + 1] = new_g;
                image.data[idx + 2] = new_b;

                let err_r = (old_r - (new_r as f32)) * intensity;
                let err_g = (old_g - (new_g as f32)) * intensity;
                let err_b = (old_b - (new_b as f32)) * intensity;

                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32, err_r, err_g, err_b);
                distribute_error(&mut image.data, width, height, x as i32 + 2, y as i32, err_r, err_g, err_b);
                distribute_error(&mut image.data, width, height, x as i32 - 1, y as i32 + 1, err_r, err_g, err_b);
                distribute_error(&mut image.data, width, height, x as i32, y as i32 + 1, err_r, err_g, err_b);
                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32 + 1, err_r, err_g, err_b);
                distribute_error(&mut image.data, width, height, x as i32, y as i32 + 2, err_r, err_g, err_b);
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Atkinson"
    }
}
