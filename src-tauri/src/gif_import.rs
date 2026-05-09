use gif::{ColorOutput, DecodeOptions, Repeat};
use gif_dispose::Screen;
use std::io::Cursor;
use base64::Engine;

/// A single decoded GIF frame ready for use in the animation system
#[derive(Debug, Clone)]
pub struct GifFrame {
    /// Frame width in pixels
    pub width: u32,
    /// Frame height in pixels
    pub height: u32,
    /// RGBA pixel data (width * height * 4 bytes)
    pub rgba: Vec<u8>,
    /// Frame delay in seconds (as a fraction for precision)
    pub delay_ms: u32,
    /// Whether this frame should be treated as a keyframe
    pub is_keyframe: bool,
}

/// Result of importing a GIF file
#[derive(Debug)]
pub struct GifImportResult {
    /// All decoded frames
    pub frames: Vec<GifFrame>,
    /// Loop count (0 = infinite)
    pub loop_count: u16,
    /// Global canvas width
    pub width: u32,
    /// Global canvas height
    pub height: u32,
}

/// Import a GIF file from raw bytes
/// 
/// This handles:
/// - Decoding all frames
/// - Applying disposal methods via gif-dispose
/// - Extracting timing information
/// - Compositing frames correctly
pub fn import_gif_from_bytes(bytes: &[u8]) -> Result<GifImportResult, String> {
    let cursor = Cursor::new(bytes);
    
    // gif-dispose expects indexed frames, not RGBA-expanded frames.
    let mut options = DecodeOptions::new();
    options.set_color_output(ColorOutput::Indexed);
    let mut decoder = options
        .read_info(cursor)
        .map_err(|e| format!("Failed to create GIF decoder: {}", e))?;

    let width = decoder.width() as usize;
    let height = decoder.height() as usize;

    // Create screen for composition using the decoder's palette handling.
    let mut screen = Screen::new_decoder(&decoder);
    
    let mut frames = Vec::new();
    let loop_count: u16 = match decoder.repeat() {
        Repeat::Infinite => 0,
        Repeat::Finite(count) => count,
    };
    
    // Process each frame
    loop {
        let frame = match decoder.read_next_frame() {
            Ok(Some(frame)) => frame,
            Ok(None) => break, // No more frames
            Err(e) => return Err(format!("Failed to read GIF frame: {}", e)),
        };
        
        // Draw frame to screen (handles disposal methods internally)
        screen.blit_frame(frame)
            .map_err(|e| format!("Failed to composite frame: {}", e))?;
        
        // Extract RGBA pixels from screen
        let rgba = screen.pixels_rgba()
            .rows()
            .flat_map(|row| row.iter().flat_map(|p| [p.r, p.g, p.b, p.a]))
            .collect();
        
        // Calculate delay (GIF delay is in hundredths of a second)
        let delay_cs = frame.delay;
        let delay_ms = (delay_cs as u32) * 10;
        
        // Extract transparency info (frame.transparent contains transparent color index if any)
        
        // This frame is a keyframe if it clears the previous content
        let is_keyframe = matches!(
            frame.dispose,
            gif::DisposalMethod::Background | gif::DisposalMethod::Previous
        );
        
        frames.push(GifFrame {
            width: width as u32,
            height: height as u32,
            rgba,
            delay_ms,
            is_keyframe,
        });
        
    }
    
    if frames.is_empty() {
        return Err("GIF file contains no frames".to_string());
    }
    
    Ok(GifImportResult {
        frames,
        loop_count,
        width: width as u32,
        height: height as u32,
    })
}

/// Convert RGBA bytes to a PNG data URL for frontend preview
pub fn rgba_to_data_url(width: u32, height: u32, rgba: &[u8]) -> Result<String, String> {
    use image::ImageEncoder;
    
    let mut png_buffer: Vec<u8> = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(&mut png_buffer);
    
    encoder.write_image(
        rgba,
        width,
        height,
        image::ExtendedColorType::Rgba8,
    ).map_err(|e| format!("Failed to encode PNG: {}", e))?;
    
    let base64 = base64::engine::general_purpose::STANDARD.encode(&png_buffer);
    Ok(format!("data:image/png;base64,{}", base64))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_simple_gif() {
        // Create a minimal 1x1 GIF with 2 frames
        let gif_data = create_test_gif();
        let result = import_gif_from_bytes(&gif_data);
        assert!(result.is_ok());
        
        let import = result.unwrap();
        assert_eq!(import.frames.len(), 2);
        assert_eq!(import.width, 1);
        assert_eq!(import.height, 1);
    }
    
    fn create_test_gif() -> Vec<u8> {
        // Simple 1x1 black/white alternating GIF
        // This is a minimal valid GIF87a file
        vec![
            0x47, 0x49, 0x46, 0x38, 0x37, 0x61, // GIF87a
            0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, // 1x1, no global color table
            0x2C, // Image descriptor
            0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // 1x1 at (0,0)
            0x02, 0x02, 0x44, 0x01, 0x00, // LZW min code size + data
            0x3B, // Trailer
        ]
    }
}
