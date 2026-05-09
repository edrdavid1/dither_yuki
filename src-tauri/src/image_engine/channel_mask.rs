// Channel mask effect — toggle R, G, B, A channels on/off

use crate::image_engine::{Effect, ImageData};
use crate::image_engine::context::FrameContext;

/// Channel mask effect — controls visibility of individual RGBA channels
#[derive(Debug, Clone)]
pub struct ChannelMask {
    pub mask_r: bool,
    pub mask_g: bool,
    pub mask_b: bool,
    pub mask_a: bool,
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl ChannelMask {
    pub fn new(mask_r: bool, mask_g: bool, mask_b: bool, mask_a: bool) -> Self {
        Self {
            mask_r,
            mask_g,
            mask_b,
            mask_a,
            palette: vec![],
            intensity: 1.0,
        }
    }

    /// Create with all channels visible (default passthrough)
    pub fn all_visible() -> Self {
        Self::new(true, true, true, true)
    }

    /// Create from single mask byte (bits: 0=R, 1=G, 2=B, 3=A)
    pub fn from_mask_byte(mask: u8) -> Self {
        Self::new(
            mask & 0b0001 != 0,
            mask & 0b0010 != 0,
            mask & 0b0100 != 0,
            mask & 0b1000 != 0,
        )
    }
}

impl Effect for ChannelMask {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        // If all channels visible, nothing to do
        if self.mask_r && self.mask_g && self.mask_b && self.mask_a {
            return Ok(());
        }

        let data = &mut image.data;
        
        // Process pixel by pixel
        for chunk in data.chunks_exact_mut(4) {
            // R channel (index 0)
            if !self.mask_r {
                chunk[0] = 0;
            }
            // G channel (index 1)
            if !self.mask_g {
                chunk[1] = 0;
            }
            // B channel (index 2)
            if !self.mask_b {
                chunk[2] = 0;
            }
            // A channel (index 3) — if disabled, show as fully opaque (255)
            // Original alpha is preserved in data but displayed as 255
            if !self.mask_a {
                chunk[3] = 255;
            }
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "Channel Mask"
    }
}

/// Apply channel mask to a raw RGBA buffer (utility function)
pub fn apply_channel_mask_to_buffer(
    buffer: &mut [u8],
    mask_r: bool,
    mask_g: bool,
    mask_b: bool,
    mask_a: bool,
) {
    if mask_r && mask_g && mask_b && mask_a {
        return;
    }

    for chunk in buffer.chunks_exact_mut(4) {
        if !mask_r {
            chunk[0] = 0;
        }
        if !mask_g {
            chunk[1] = 0;
        }
        if !mask_b {
            chunk[2] = 0;
        }
        if !mask_a {
            chunk[3] = 255;
        }
    }
}

/// Apply channel mask to ImageData using the video.rs ChannelMask struct
/// This is used as post-processing after any effect is applied
pub fn apply_channel_mask_to_image(
    image: &mut super::ImageData,
    mask: &super::video::ChannelMask,
    keep_alpha: bool,
    source: &super::ImageData,
) {
    let n = image.data.len();
    let mut i = 0;
    while i + 3 < n {
        // Apply mask: if channel is disabled, set to 0 (or 255 for alpha display)
        if !mask.r {
            image.data[i] = 0;
        }
        if !mask.g {
            image.data[i + 1] = 0;
        }
        if !mask.b {
            image.data[i + 2] = 0;
        }
        if !mask.a {
            // When alpha is disabled, show as fully opaque (255)
            // Original alpha is preserved in source but not used for display
            image.data[i + 3] = 255;
        }
        i += 4;
    }

    // If keep_alpha is set, restore original alpha values from source
    if keep_alpha {
        let mut i = 0;
        while i + 3 < n {
            image.data[i + 3] = source.data[i + 3];
            i += 4;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_all_visible() {
        let mask = ChannelMask::all_visible();
        assert!(mask.mask_r);
        assert!(mask.mask_g);
        assert!(mask.mask_b);
        assert!(mask.mask_a);
    }

    #[test]
    fn test_from_mask_byte() {
        // R only
        let mask = ChannelMask::from_mask_byte(0b0001);
        assert!(mask.mask_r);
        assert!(!mask.mask_g);
        assert!(!mask.mask_b);
        assert!(!mask.mask_a);

        // All channels
        let mask = ChannelMask::from_mask_byte(0b1111);
        assert!(mask.mask_r);
        assert!(mask.mask_g);
        assert!(mask.mask_b);
        assert!(mask.mask_a);
    }

    #[test]
    fn test_apply_mask() {
        let mut image = ImageData::from_rgba(2, 1, vec![
            255, 128, 64, 200,  // pixel 1
            10, 20, 30, 40,     // pixel 2
        ]);

        let mask = ChannelMask::new(true, false, true, false);
        mask.apply(&mut image, &FrameContext::static_frame()).unwrap();

        // After mask: R kept, G=0, B kept, A=255
        assert_eq!(image.data, vec![
            255, 0, 64, 255,    // pixel 1: G cleared, A forced to 255
            10, 0, 30, 255,     // pixel 2: G cleared, A forced to 255
        ]);
    }

    #[test]
    fn test_apply_all_visible_no_change() {
        let original = vec![255, 128, 64, 200];
        let mut image = ImageData::from_rgba(1, 1, original.clone());

        let mask = ChannelMask::all_visible();
        mask.apply(&mut image, &FrameContext::static_frame()).unwrap();

        assert_eq!(image.data, original);
    }
}
