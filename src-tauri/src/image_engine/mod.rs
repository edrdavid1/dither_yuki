// Image engine module — orchestrates all effects

pub mod types;
pub mod error_diffusion;
pub mod ordered;

pub use types::{Effect, ImageData, EffectParams, EffectResult};
pub use error_diffusion::{FloydSteinberg, Atkinson};
pub use ordered::BayerDither;

/// Algorithm registry for creating effects by name
pub struct AlgorithmRegistry;

impl AlgorithmRegistry {
    pub fn create(
        algorithm: &str,
        palette: Vec<[u8; 3]>,
        intensity: f32,
    ) -> Result<Box<dyn Effect>, String> {
        match algorithm {
            "Floyd-Steinberg" => Ok(Box::new(FloydSteinberg { palette, intensity })),
            "Atkinson" => Ok(Box::new(Atkinson { palette, intensity })),
            "Bayer 2x2" => Ok(Box::new(BayerDither {
                size: 2,
                palette,
                intensity,
            })),
            "Bayer 4x4" => Ok(Box::new(BayerDither {
                size: 4,
                palette,
                intensity,
            })),
            _ => Err(format!("Unknown algorithm: {}", algorithm)),
        }
    }
}

/// Standard palettes
pub mod palettes {
    pub fn grayscale() -> Vec<[u8; 3]> {
        vec![
            [0, 0, 0],
            [85, 85, 85],
            [170, 170, 170],
            [255, 255, 255],
        ]
    }

    pub fn cga() -> Vec<[u8; 3]> {
        vec![
            [0, 0, 0],
            [0, 170, 170],
            [170, 0, 170],
            [170, 170, 170],
            [170, 85, 0],
            [85, 255, 85],
            [255, 255, 85],
            [255, 255, 255],
        ]
    }

    pub fn ega() -> Vec<[u8; 3]> {
        vec![
            [0, 0, 0],
            [0, 0, 170],
            [0, 170, 0],
            [0, 170, 170],
            [170, 0, 0],
            [170, 0, 170],
            [170, 85, 0],
            [170, 170, 170],
            [85, 85, 85],
            [85, 85, 255],
            [85, 255, 85],
            [85, 255, 255],
            [255, 85, 85],
            [255, 85, 255],
            [255, 255, 85],
            [255, 255, 255],
        ]
    }

    pub fn gameboy() -> Vec<[u8; 3]> {
        vec![
            [15, 56, 15],
            [48, 98, 48],
            [139, 172, 15],
            [155, 188, 15],
        ]
    }

    pub fn get_palette(name: &str) -> Option<Vec<[u8; 3]>> {
        match name {
            "Grayscale" => Some(grayscale()),
            "CGA" => Some(cga()),
            "EGA" => Some(ega()),
            "GameBoy" => Some(gameboy()),
            _ => None,
        }
    }
}
