// Error diffusion dithering algorithms

use super::context::FrameContext;
use super::types::{Effect, ImageData};
use super::color::find_closest_color_oklab;

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
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
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
                    find_closest_color_oklab(old_r as u8, old_g as u8, old_b as u8, &self.palette);

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
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
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
                    find_closest_color_oklab(old_r as u8, old_g as u8, old_b as u8, &self.palette);

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

/// Jarvis-Judice-Ninke dithering
pub struct JarvisJudiceNinke {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for JarvisJudiceNinke {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
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
                    find_closest_color_oklab(old_r as u8, old_g as u8, old_b as u8, &self.palette);

                image.data[idx] = new_r;
                image.data[idx + 1] = new_g;
                image.data[idx + 2] = new_b;

                let err_r = (old_r - (new_r as f32)) * intensity;
                let err_g = (old_g - (new_g as f32)) * intensity;
                let err_b = (old_b - (new_b as f32)) * intensity;

                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32, err_r * 7.0 / 48.0, err_g * 7.0 / 48.0, err_b * 7.0 / 48.0);
                distribute_error(&mut image.data, width, height, x as i32 + 2, y as i32, err_r * 5.0 / 48.0, err_g * 5.0 / 48.0, err_b * 5.0 / 48.0);
                distribute_error(&mut image.data, width, height, x as i32 - 2, y as i32 + 1, err_r * 3.0 / 48.0, err_g * 3.0 / 48.0, err_b * 3.0 / 48.0);
                distribute_error(&mut image.data, width, height, x as i32 - 1, y as i32 + 1, err_r * 5.0 / 48.0, err_g * 5.0 / 48.0, err_b * 5.0 / 48.0);
                distribute_error(&mut image.data, width, height, x as i32, y as i32 + 1, err_r * 7.0 / 48.0, err_g * 7.0 / 48.0, err_b * 7.0 / 48.0);
                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32 + 1, err_r * 5.0 / 48.0, err_g * 5.0 / 48.0, err_b * 5.0 / 48.0);
                distribute_error(&mut image.data, width, height, x as i32 + 2, y as i32 + 1, err_r * 3.0 / 48.0, err_g * 3.0 / 48.0, err_b * 3.0 / 48.0);
                distribute_error(&mut image.data, width, height, x as i32 - 2, y as i32 + 2, err_r * 1.0 / 48.0, err_g * 1.0 / 48.0, err_b * 1.0 / 48.0);
                distribute_error(&mut image.data, width, height, x as i32 - 1, y as i32 + 2, err_r * 3.0 / 48.0, err_g * 3.0 / 48.0, err_b * 3.0 / 48.0);
                distribute_error(&mut image.data, width, height, x as i32, y as i32 + 2, err_r * 5.0 / 48.0, err_g * 5.0 / 48.0, err_b * 5.0 / 48.0);
                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32 + 2, err_r * 3.0 / 48.0, err_g * 3.0 / 48.0, err_b * 3.0 / 48.0);
                distribute_error(&mut image.data, width, height, x as i32 + 2, y as i32 + 2, err_r * 1.0 / 48.0, err_g * 1.0 / 48.0, err_b * 1.0 / 48.0);
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Jarvis-Judice-Ninke"
    }
}

/// Sierra dithering
pub struct Sierra {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for Sierra {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
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
                    find_closest_color_oklab(old_r as u8, old_g as u8, old_b as u8, &self.palette);

                image.data[idx] = new_r;
                image.data[idx + 1] = new_g;
                image.data[idx + 2] = new_b;

                let err_r = (old_r - (new_r as f32)) * intensity;
                let err_g = (old_g - (new_g as f32)) * intensity;
                let err_b = (old_b - (new_b as f32)) * intensity;

                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32, err_r * 5.0 / 32.0, err_g * 5.0 / 32.0, err_b * 5.0 / 32.0);
                distribute_error(&mut image.data, width, height, x as i32 + 2, y as i32, err_r * 3.0 / 32.0, err_g * 3.0 / 32.0, err_b * 3.0 / 32.0);
                distribute_error(&mut image.data, width, height, x as i32 - 2, y as i32 + 1, err_r * 2.0 / 32.0, err_g * 2.0 / 32.0, err_b * 2.0 / 32.0);
                distribute_error(&mut image.data, width, height, x as i32 - 1, y as i32 + 1, err_r * 4.0 / 32.0, err_g * 4.0 / 32.0, err_b * 4.0 / 32.0);
                distribute_error(&mut image.data, width, height, x as i32, y as i32 + 1, err_r * 5.0 / 32.0, err_g * 5.0 / 32.0, err_b * 5.0 / 32.0);
                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32 + 1, err_r * 4.0 / 32.0, err_g * 4.0 / 32.0, err_b * 4.0 / 32.0);
                distribute_error(&mut image.data, width, height, x as i32 + 2, y as i32 + 1, err_r * 2.0 / 32.0, err_g * 2.0 / 32.0, err_b * 2.0 / 32.0);
                distribute_error(&mut image.data, width, height, x as i32 - 1, y as i32 + 2, err_r * 2.0 / 32.0, err_g * 2.0 / 32.0, err_b * 2.0 / 32.0);
                distribute_error(&mut image.data, width, height, x as i32, y as i32 + 2, err_r * 3.0 / 32.0, err_g * 3.0 / 32.0, err_b * 3.0 / 32.0);
                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32 + 2, err_r * 2.0 / 32.0, err_g * 2.0 / 32.0, err_b * 2.0 / 32.0);
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Sierra"
    }
}

/// Stucki dithering
pub struct Stucki {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for Stucki {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
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
                    find_closest_color_oklab(old_r as u8, old_g as u8, old_b as u8, &self.palette);

                image.data[idx] = new_r;
                image.data[idx + 1] = new_g;
                image.data[idx + 2] = new_b;

                let err_r = (old_r - (new_r as f32)) * intensity;
                let err_g = (old_g - (new_g as f32)) * intensity;
                let err_b = (old_b - (new_b as f32)) * intensity;

                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32, err_r * 8.0 / 42.0, err_g * 8.0 / 42.0, err_b * 8.0 / 42.0);
                distribute_error(&mut image.data, width, height, x as i32 + 2, y as i32, err_r * 4.0 / 42.0, err_g * 4.0 / 42.0, err_b * 4.0 / 42.0);
                distribute_error(&mut image.data, width, height, x as i32 - 2, y as i32 + 1, err_r * 2.0 / 42.0, err_g * 2.0 / 42.0, err_b * 2.0 / 42.0);
                distribute_error(&mut image.data, width, height, x as i32 - 1, y as i32 + 1, err_r * 4.0 / 42.0, err_g * 4.0 / 42.0, err_b * 4.0 / 42.0);
                distribute_error(&mut image.data, width, height, x as i32, y as i32 + 1, err_r * 8.0 / 42.0, err_g * 8.0 / 42.0, err_b * 8.0 / 42.0);
                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32 + 1, err_r * 4.0 / 42.0, err_g * 4.0 / 42.0, err_b * 4.0 / 42.0);
                distribute_error(&mut image.data, width, height, x as i32 + 2, y as i32 + 1, err_r * 2.0 / 42.0, err_g * 2.0 / 42.0, err_b * 2.0 / 42.0);
                distribute_error(&mut image.data, width, height, x as i32 - 2, y as i32 + 2, err_r * 1.0 / 42.0, err_g * 1.0 / 42.0, err_b * 1.0 / 42.0);
                distribute_error(&mut image.data, width, height, x as i32 - 1, y as i32 + 2, err_r * 2.0 / 42.0, err_g * 2.0 / 42.0, err_b * 2.0 / 42.0);
                distribute_error(&mut image.data, width, height, x as i32, y as i32 + 2, err_r * 4.0 / 42.0, err_g * 4.0 / 42.0, err_b * 4.0 / 42.0);
                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32 + 2, err_r * 2.0 / 42.0, err_g * 2.0 / 42.0, err_b * 2.0 / 42.0);
                distribute_error(&mut image.data, width, height, x as i32 + 2, y as i32 + 2, err_r * 1.0 / 42.0, err_g * 1.0 / 42.0, err_b * 1.0 / 42.0);
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Stucki"
    }
}

/// Burkes dithering
pub struct Burkes {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for Burkes {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
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
                    find_closest_color_oklab(old_r as u8, old_g as u8, old_b as u8, &self.palette);

                image.data[idx] = new_r;
                image.data[idx + 1] = new_g;
                image.data[idx + 2] = new_b;

                let err_r = (old_r - (new_r as f32)) * intensity;
                let err_g = (old_g - (new_g as f32)) * intensity;
                let err_b = (old_b - (new_b as f32)) * intensity;

                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32, err_r * 8.0 / 32.0, err_g * 8.0 / 32.0, err_b * 8.0 / 32.0);
                distribute_error(&mut image.data, width, height, x as i32 + 2, y as i32, err_r * 4.0 / 32.0, err_g * 4.0 / 32.0, err_b * 4.0 / 32.0);
                distribute_error(&mut image.data, width, height, x as i32 - 2, y as i32 + 1, err_r * 2.0 / 32.0, err_g * 2.0 / 32.0, err_b * 2.0 / 32.0);
                distribute_error(&mut image.data, width, height, x as i32 - 1, y as i32 + 1, err_r * 4.0 / 32.0, err_g * 4.0 / 32.0, err_b * 4.0 / 32.0);
                distribute_error(&mut image.data, width, height, x as i32, y as i32 + 1, err_r * 8.0 / 32.0, err_g * 8.0 / 32.0, err_b * 8.0 / 32.0);
                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32 + 1, err_r * 4.0 / 32.0, err_g * 4.0 / 32.0, err_b * 4.0 / 32.0);
                distribute_error(&mut image.data, width, height, x as i32 + 2, y as i32 + 1, err_r * 2.0 / 32.0, err_g * 2.0 / 32.0, err_b * 2.0 / 32.0);
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Burkes"
    }
}

/// Two-Row Sierra dithering
pub struct TwoRowSierra {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for TwoRowSierra {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
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
                    find_closest_color_oklab(old_r as u8, old_g as u8, old_b as u8, &self.palette);

                image.data[idx] = new_r;
                image.data[idx + 1] = new_g;
                image.data[idx + 2] = new_b;

                let err_r = (old_r - (new_r as f32)) * intensity;
                let err_g = (old_g - (new_g as f32)) * intensity;
                let err_b = (old_b - (new_b as f32)) * intensity;

                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32, err_r * 4.0 / 16.0, err_g * 4.0 / 16.0, err_b * 4.0 / 16.0);
                distribute_error(&mut image.data, width, height, x as i32 + 2, y as i32, err_r * 3.0 / 16.0, err_g * 3.0 / 16.0, err_b * 3.0 / 16.0);
                distribute_error(&mut image.data, width, height, x as i32 - 2, y as i32 + 1, err_r * 1.0 / 16.0, err_g * 1.0 / 16.0, err_b * 1.0 / 16.0);
                distribute_error(&mut image.data, width, height, x as i32 - 1, y as i32 + 1, err_r * 3.0 / 16.0, err_g * 3.0 / 16.0, err_b * 3.0 / 16.0);
                distribute_error(&mut image.data, width, height, x as i32, y as i32 + 1, err_r * 4.0 / 16.0, err_g * 4.0 / 16.0, err_b * 4.0 / 16.0);
                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32 + 1, err_r * 3.0 / 16.0, err_g * 3.0 / 16.0, err_b * 3.0 / 16.0);
                distribute_error(&mut image.data, width, height, x as i32 + 2, y as i32 + 1, err_r * 1.0 / 16.0, err_g * 1.0 / 16.0, err_b * 1.0 / 16.0);
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Two-Row Sierra"
    }
}

/// False Floyd-Steinberg dithering (simplified)
pub struct FalseFloydSteinberg {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for FalseFloydSteinberg {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
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
                    find_closest_color_oklab(old_r as u8, old_g as u8, old_b as u8, &self.palette);

                image.data[idx] = new_r;
                image.data[idx + 1] = new_g;
                image.data[idx + 2] = new_b;

                let err_r = (old_r - (new_r as f32)) * intensity;
                let err_g = (old_g - (new_g as f32)) * intensity;
                let err_b = (old_b - (new_b as f32)) * intensity;

                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32, err_r * 3.0 / 8.0, err_g * 3.0 / 8.0, err_b * 3.0 / 8.0);
                distribute_error(&mut image.data, width, height, x as i32 - 1, y as i32 + 1, err_r * 3.0 / 8.0, err_g * 3.0 / 8.0, err_b * 3.0 / 8.0);
                distribute_error(&mut image.data, width, height, x as i32, y as i32 + 1, err_r * 2.0 / 8.0, err_g * 2.0 / 8.0, err_b * 2.0 / 8.0);
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "False Floyd-Steinberg"
    }
}

/// Shiau Fan dithering
pub struct ShiauFan {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for ShiauFan {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
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
                    find_closest_color_oklab(old_r as u8, old_g as u8, old_b as u8, &self.palette);

                image.data[idx] = new_r;
                image.data[idx + 1] = new_g;
                image.data[idx + 2] = new_b;

                let err_r = (old_r - (new_r as f32)) * intensity;
                let err_g = (old_g - (new_g as f32)) * intensity;
                let err_b = (old_b - (new_b as f32)) * intensity;

                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32, err_r * 4.0 / 16.0, err_g * 4.0 / 16.0, err_b * 4.0 / 16.0);
                distribute_error(&mut image.data, width, height, x as i32 + 2, y as i32, err_r * 2.0 / 16.0, err_g * 2.0 / 16.0, err_b * 2.0 / 16.0);
                distribute_error(&mut image.data, width, height, x as i32 - 1, y as i32 + 1, err_r * 1.0 / 16.0, err_g * 1.0 / 16.0, err_b * 1.0 / 16.0);
                distribute_error(&mut image.data, width, height, x as i32, y as i32 + 1, err_r * 2.0 / 16.0, err_g * 2.0 / 16.0, err_b * 2.0 / 16.0);
                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32 + 1, err_r * 4.0 / 16.0, err_g * 4.0 / 16.0, err_b * 4.0 / 16.0);
                distribute_error(&mut image.data, width, height, x as i32 + 2, y as i32 + 1, err_r * 1.0 / 16.0, err_g * 1.0 / 16.0, err_b * 1.0 / 16.0);
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Shiau Fan"
    }
}

/// Sierra Lite dithering
pub struct SierraLite {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for SierraLite {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
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
                    find_closest_color_oklab(old_r as u8, old_g as u8, old_b as u8, &self.palette);

                image.data[idx] = new_r;
                image.data[idx + 1] = new_g;
                image.data[idx + 2] = new_b;

                let err_r = (old_r - (new_r as f32)) * intensity;
                let err_g = (old_g - (new_g as f32)) * intensity;
                let err_b = (old_b - (new_b as f32)) * intensity;

                distribute_error(&mut image.data, width, height, x as i32 + 1, y as i32, err_r * 2.0 / 4.0, err_g * 2.0 / 4.0, err_b * 2.0 / 4.0);
                distribute_error(&mut image.data, width, height, x as i32 - 1, y as i32 + 1, err_r * 1.0 / 4.0, err_g * 1.0 / 4.0, err_b * 1.0 / 4.0);
                distribute_error(&mut image.data, width, height, x as i32, y as i32 + 1, err_r * 1.0 / 4.0, err_g * 1.0 / 4.0, err_b * 1.0 / 4.0);
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Sierra Lite"
    }
}
