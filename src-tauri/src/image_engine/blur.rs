// Fast separable Gaussian blur effect

use super::context::FrameContext;
use super::types::{Effect, ImageData};

pub struct FastGaussianBlur {
    pub radius: f32,
    pub intensity: f32,
}

impl FastGaussianBlur {
    fn gaussian_kernel(radius: usize) -> Vec<f32> {
        if radius == 0 {
            return vec![1.0];
        }

        let sigma = (radius as f32).max(1.0) * 0.5;
        let two_sigma_sq = 2.0 * sigma * sigma;
        let mut kernel = Vec::with_capacity(radius + 1);

        for i in 0..=radius {
            let x = i as f32;
            kernel.push((-x * x / two_sigma_sq).exp());
        }

        let mut sum = kernel[0];
        for value in kernel.iter().skip(1) {
            sum += value * 2.0;
        }
        for value in &mut kernel {
            *value /= sum;
        }

        kernel
    }

    fn blur_horizontal(src: &[u8], width: u32, height: u32, radius: usize, kernel: &[f32]) -> Vec<u8> {
        let mut out = src.to_vec();

        for y in 0..height {
            for x in 0..width {
                let mut acc_r = 0.0f32;
                let mut acc_g = 0.0f32;
                let mut acc_b = 0.0f32;

                for offset in 0..=radius {
                    let weight = kernel[offset];

                    let left_x = x.saturating_sub(offset as u32);
                    let left_idx = ((y * width + left_x) * 4) as usize;
                    acc_r += src[left_idx] as f32 * weight;
                    acc_g += src[left_idx + 1] as f32 * weight;
                    acc_b += src[left_idx + 2] as f32 * weight;

                    if offset > 0 {
                        let right_x = (x + offset as u32).min(width - 1);
                        let right_idx = ((y * width + right_x) * 4) as usize;
                        acc_r += src[right_idx] as f32 * weight;
                        acc_g += src[right_idx + 1] as f32 * weight;
                        acc_b += src[right_idx + 2] as f32 * weight;
                    }
                }

                let idx = ((y * width + x) * 4) as usize;
                out[idx] = acc_r.clamp(0.0, 255.0) as u8;
                out[idx + 1] = acc_g.clamp(0.0, 255.0) as u8;
                out[idx + 2] = acc_b.clamp(0.0, 255.0) as u8;
            }
        }

        out
    }

    fn blur_vertical(src: &[u8], width: u32, height: u32, radius: usize, kernel: &[f32]) -> Vec<u8> {
        let mut out = src.to_vec();

        for y in 0..height {
            for x in 0..width {
                let mut acc_r = 0.0f32;
                let mut acc_g = 0.0f32;
                let mut acc_b = 0.0f32;

                for offset in 0..=radius {
                    let weight = kernel[offset];

                    let top_y = y.saturating_sub(offset as u32);
                    let top_idx = ((top_y * width + x) * 4) as usize;
                    acc_r += src[top_idx] as f32 * weight;
                    acc_g += src[top_idx + 1] as f32 * weight;
                    acc_b += src[top_idx + 2] as f32 * weight;

                    if offset > 0 {
                        let bottom_y = (y + offset as u32).min(height - 1);
                        let bottom_idx = ((bottom_y * width + x) * 4) as usize;
                        acc_r += src[bottom_idx] as f32 * weight;
                        acc_g += src[bottom_idx + 1] as f32 * weight;
                        acc_b += src[bottom_idx + 2] as f32 * weight;
                    }
                }

                let idx = ((y * width + x) * 4) as usize;
                out[idx] = acc_r.clamp(0.0, 255.0) as u8;
                out[idx + 1] = acc_g.clamp(0.0, 255.0) as u8;
                out[idx + 2] = acc_b.clamp(0.0, 255.0) as u8;
            }
        }

        out
    }
}

impl Effect for FastGaussianBlur {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        if image.width == 0 || image.height == 0 {
            return Ok(());
        }

        let radius = self.radius.clamp(0.0, 10.0).round() as usize;
        if radius == 0 {
            return Ok(());
        }

        let kernel = Self::gaussian_kernel(radius);
        let horizontal = Self::blur_horizontal(&image.data, image.width, image.height, radius, &kernel);
        let vertical = Self::blur_vertical(&horizontal, image.width, image.height, radius, &kernel);

        let strength = (self.intensity / 100.0).clamp(0.0, 1.0);
        for idx in (0..image.data.len()).step_by(4) {
            for channel in 0..3 {
                let original = image.data[idx + channel] as f32;
                let blurred = vertical[idx + channel] as f32;
                image.data[idx + channel] =
                    (original * (1.0 - strength) + blurred * strength).clamp(0.0, 255.0) as u8;
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Fast Gaussian Blur"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blur_softens_sharp_pixel() {
        let mut image = ImageData::from_rgba(
            3,
            3,
            vec![
                0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
                0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255,
                0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
            ],
        );

        let effect = FastGaussianBlur {
            radius: 2.0,
            intensity: 100.0,
        };

        effect
            .apply(&mut image, &FrameContext::static_frame())
            .expect("blur should run");

        let center = ((1 * image.width + 1) * 4) as usize;
        let corner = ((0 * image.width + 0) * 4) as usize;

        assert!(image.data[center] < 255);
        assert!(image.data[corner] > 0);
    }
}
