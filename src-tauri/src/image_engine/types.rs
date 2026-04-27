// Image processing core types and traits

use serde::{Deserialize, Serialize};

/// Raw image data in RGBA format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageData {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>, // RGBA: 4 bytes per pixel
}

impl ImageData {
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            width,
            height,
            data: vec![0; (width * height * 4) as usize],
        }
    }

    pub fn from_rgba(width: u32, height: u32, data: Vec<u8>) -> Self {
        Self { width, height, data }
    }

    /// Get pixel at (x, y) as [R, G, B, A]
    pub fn get_pixel(&self, x: u32, y: u32) -> [u8; 4] {
        if x >= self.width || y >= self.height {
            return [0, 0, 0, 255];
        }
        let idx = (y * self.width + x) as usize * 4;
        [
            self.data[idx],
            self.data[idx + 1],
            self.data[idx + 2],
            self.data[idx + 3],
        ]
    }

    /// Set pixel at (x, y) from [R, G, B, A]
    pub fn set_pixel(&mut self, x: u32, y: u32, pixel: [u8; 4]) {
        if x >= self.width || y >= self.height {
            return;
        }
        let idx = (y * self.width + x) as usize * 4;
        self.data[idx] = pixel[0];
        self.data[idx + 1] = pixel[1];
        self.data[idx + 2] = pixel[2];
        self.data[idx + 3] = pixel[3];
    }

    /// Get mutable slice of pixel data for (x, y)
    fn pixel_mut(&mut self, x: u32, y: u32) -> &mut [u8] {
        if x >= self.width || y >= self.height {
            return &mut [];
        }
        let idx = (y * self.width + x) as usize * 4;
        &mut self.data[idx..idx + 4]
    }
}

/// Effect trait — all effects implement this
pub trait Effect: Send + Sync {
    fn apply(&self, image: &mut ImageData) -> Result<(), String>;
    fn name(&self) -> &str;
}

/// Result type for effect operations
pub type EffectResult = Result<ImageData, String>;

/// Represents effect parameters that can be serialized
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectParams {
    pub algorithm: String,
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
    pub params: serde_json::Value, // Algorithm-specific params
}
