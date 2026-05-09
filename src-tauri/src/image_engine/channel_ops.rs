// Channel operations — invert, scale, copy for individual RGBA channels

use crate::image_engine::{Effect, ImageData};
use crate::image_engine::context::FrameContext;

/// Channel selector: 0=R, 1=G, 2=B, 3=A
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Channel {
    Red = 0,
    Green = 1,
    Blue = 2,
    Alpha = 3,
}

impl Channel {
    pub fn from_index(index: u8) -> Option<Self> {
        match index {
            0 => Some(Channel::Red),
            1 => Some(Channel::Green),
            2 => Some(Channel::Blue),
            3 => Some(Channel::Alpha),
            _ => None,
        }
    }

    pub fn index(&self) -> usize {
        *self as usize
    }
}

/// Invert a specific channel (255 - value)
#[derive(Debug, Clone)]
pub struct ChannelInvert {
    pub channel: Channel,
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl ChannelInvert {
    pub fn new(channel: Channel) -> Self {
        Self {
            channel,
            palette: vec![],
            intensity: 1.0,
        }
    }
}

impl Effect for ChannelInvert {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let idx = self.channel.index();
        let intensity = self.intensity.clamp(0.0, 1.0);
        
        for chunk in image.data.chunks_exact_mut(4) {
            let original = chunk[idx];
            let inverted = 255 - original;
            // Blend based on intensity
            chunk[idx] = (original as f32 * (1.0 - intensity) + inverted as f32 * intensity) as u8;
        }
        Ok(())
    }

    fn name(&self) -> &str {
        match self.channel {
            Channel::Red => "Invert Red",
            Channel::Green => "Invert Green",
            Channel::Blue => "Invert Blue",
            Channel::Alpha => "Invert Alpha",
        }
    }
}

/// Scale (brightness) a specific channel by a factor
#[derive(Debug, Clone)]
pub struct ChannelScale {
    pub channel: Channel,
    pub factor: f32,
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl ChannelScale {
    pub fn new(channel: Channel, factor: f32) -> Self {
        Self {
            channel,
            factor,
            palette: vec![],
            intensity: 1.0,
        }
    }
}

impl Effect for ChannelScale {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let idx = self.channel.index();
        let factor = self.factor.max(0.0);
        let intensity = self.intensity.clamp(0.0, 1.0);
        
        for chunk in image.data.chunks_exact_mut(4) {
            let original = chunk[idx] as f32;
            let scaled = (original * factor).min(255.0) as u8;
            // Blend based on intensity
            chunk[idx] = (original as f32 * (1.0 - intensity) + scaled as f32 * intensity) as u8;
        }
        Ok(())
    }

    fn name(&self) -> &str {
        match self.channel {
            Channel::Red => "Scale Red",
            Channel::Green => "Scale Green",
            Channel::Blue => "Scale Blue",
            Channel::Alpha => "Scale Alpha",
        }
    }
}

/// Copy one channel to another
#[derive(Debug, Clone)]
pub struct ChannelCopy {
    pub src: Channel,
    pub dst: Channel,
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl ChannelCopy {
    pub fn new(src: Channel, dst: Channel) -> Self {
        Self {
            src,
            dst,
            palette: vec![],
            intensity: 1.0,
        }
    }
}

impl Effect for ChannelCopy {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let src_idx = self.src.index();
        let dst_idx = self.dst.index();
        
        // If src == dst, nothing to do
        if src_idx == dst_idx {
            return Ok(());
        }
        
        let intensity = self.intensity.clamp(0.0, 1.0);
        
        for chunk in image.data.chunks_exact_mut(4) {
            let src_val = chunk[src_idx];
            let dst_val = chunk[dst_idx];
            // Blend based on intensity
            chunk[dst_idx] = (dst_val as f32 * (1.0 - intensity) + src_val as f32 * intensity) as u8;
        }
        Ok(())
    }

    fn name(&self) -> &str {
        match (self.src, self.dst) {
            (Channel::Red, Channel::Green) => "Copy Red to Green",
            (Channel::Red, Channel::Blue) => "Copy Red to Blue",
            (Channel::Green, Channel::Red) => "Copy Green to Red",
            (Channel::Green, Channel::Blue) => "Copy Green to Blue",
            (Channel::Blue, Channel::Red) => "Copy Blue to Red",
            (Channel::Blue, Channel::Green) => "Copy Blue to Green",
            (Channel::Alpha, ch) => match ch {
                Channel::Red => "Copy Alpha to Red",
                Channel::Green => "Copy Alpha to Green",
                Channel::Blue => "Copy Alpha to Blue",
                _ => "Copy Channel",
            },
            (ch, Channel::Alpha) => match ch {
                Channel::Red => "Copy Red to Alpha",
                Channel::Green => "Copy Green to Alpha",
                Channel::Blue => "Copy Blue to Alpha",
                _ => "Copy Channel",
            },
            _ => "Copy Channel",
        }
    }
}

/// Swap two channels
#[derive(Debug, Clone)]
pub struct ChannelSwap {
    pub ch1: Channel,
    pub ch2: Channel,
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl ChannelSwap {
    pub fn new(ch1: Channel, ch2: Channel) -> Self {
        Self {
            ch1,
            ch2,
            palette: vec![],
            intensity: 1.0,
        }
    }
}

impl Effect for ChannelSwap {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        let idx1 = self.ch1.index();
        let idx2 = self.ch2.index();
        
        // If same channel, nothing to do
        if idx1 == idx2 {
            return Ok(());
        }
        
        let intensity = self.intensity.clamp(0.0, 1.0);
        
        for chunk in image.data.chunks_exact_mut(4) {
            let val1 = chunk[idx1];
            let val2 = chunk[idx2];
            // Partial swap based on intensity
            let new_val1 = (val1 as f32 * (1.0 - intensity) + val2 as f32 * intensity) as u8;
            let new_val2 = (val2 as f32 * (1.0 - intensity) + val1 as f32 * intensity) as u8;
            chunk[idx1] = new_val1;
            chunk[idx2] = new_val2;
        }
        Ok(())
    }

    fn name(&self) -> &str {
        match (self.ch1, self.ch2) {
            (Channel::Red, Channel::Green) | (Channel::Green, Channel::Red) => "Swap Red/Green",
            (Channel::Red, Channel::Blue) | (Channel::Blue, Channel::Red) => "Swap Red/Blue",
            (Channel::Green, Channel::Blue) | (Channel::Blue, Channel::Green) => "Swap Green/Blue",
            _ => "Swap Channels",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_channel_invert() {
        let mut image = ImageData::from_rgba(1, 1, vec![100, 150, 200, 255]);
        let effect = ChannelInvert::new(Channel::Red);
        effect.apply(&mut image, &FrameContext::static_frame()).unwrap();
        assert_eq!(image.data[0], 155); // 255 - 100 = 155
    }

    #[test]
    fn test_channel_scale() {
        let mut image = ImageData::from_rgba(1, 1, vec![100, 150, 200, 255]);
        let effect = ChannelScale::new(Channel::Red, 2.0);
        effect.apply(&mut image, &FrameContext::static_frame()).unwrap();
        assert_eq!(image.data[0], 200); // 100 * 2 = 200
    }

    #[test]
    fn test_channel_copy() {
        let mut image = ImageData::from_rgba(1, 1, vec![100, 150, 200, 255]);
        let effect = ChannelCopy::new(Channel::Red, Channel::Blue);
        effect.apply(&mut image, &FrameContext::static_frame()).unwrap();
        assert_eq!(image.data[2], 100); // Blue becomes Red value
    }

    #[test]
    fn test_channel_swap() {
        let mut image = ImageData::from_rgba(1, 1, vec![100, 150, 200, 255]);
        let effect = ChannelSwap::new(Channel::Red, Channel::Green);
        effect.apply(&mut image, &FrameContext::static_frame()).unwrap();
        assert_eq!(image.data[0], 150); // Red becomes Green
        assert_eq!(image.data[1], 100); // Green becomes Red
    }
}
