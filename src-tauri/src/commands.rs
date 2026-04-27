// Tauri commands for image processing

use tauri::State;
use crate::image_engine::{self, ImageData, AlgorithmRegistry};

#[tauri::command]
pub async fn process_image(
    image_bytes: Vec<u8>,
    algorithm: String,
    palette_name: String,
    intensity: f32,
) -> Result<Vec<u8>, String> {
    // For now, assume image_bytes is RGBA raw data (width*height*4 bytes)
    // In production, you'd decode from PNG/JPG using `image` crate

    // Create a simple ImageData (assuming 256x256 for now; should be parameterized)
    let width = 256u32;
    let height = 256u32;

    let mut image = ImageData::from_rgba(width, height, image_bytes);

    // Get palette
    let palette = image_engine::palettes::get_palette(&palette_name)
        .ok_or_else(|| format!("Unknown palette: {}", palette_name))?;

    // Create effect
    let effect = AlgorithmRegistry::create(&algorithm, palette, intensity)?;

    // Apply effect
    effect.apply(&mut image)?;

    // Return RGBA bytes
    Ok(image.data)
}

#[tauri::command]
pub async fn list_algorithms() -> Result<Vec<String>, String> {
    Ok(vec![
        "Floyd-Steinberg".to_string(),
        "Atkinson".to_string(),
        "Bayer 2x2".to_string(),
        "Bayer 4x4".to_string(),
    ])
}

#[tauri::command]
pub async fn list_palettes() -> Result<Vec<String>, String> {
    Ok(vec![
        "Grayscale".to_string(),
        "CGA".to_string(),
        "EGA".to_string(),
        "GameBoy".to_string(),
    ])
}
