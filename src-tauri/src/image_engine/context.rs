// Frame context for deterministic and temporal effects

#[derive(Debug, Clone, Copy)]
pub struct FrameContext {
    pub seed: u64,
    pub frame_index: u32,
    pub time_seconds: f32,
    pub total_frames: u32,
}

impl FrameContext {
    pub fn new(frame_index: u32, total_frames: u32) -> Self {
        let total_frames = total_frames.max(1);
        Self {
            seed: (frame_index as u64).wrapping_mul(2_654_435_761),
            frame_index,
            time_seconds: frame_index as f32 / 30.0,
            total_frames,
        }
    }

    pub fn static_frame() -> Self {
        Self {
            seed: 0,
            frame_index: 0,
            time_seconds: 0.0,
            total_frames: 1,
        }
    }
}
