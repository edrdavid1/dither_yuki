// Image engine module — orchestrates all effects

pub mod types;
pub mod context;
pub mod pipeline;
pub mod blur;
pub mod error_diffusion;
pub mod ordered;
pub mod pattern;
pub mod glitch;
pub mod special;
pub mod presets;
pub mod color;
pub mod video;

pub use types::{Effect, ImageData, EffectParams, EffectResult};
pub use context::FrameContext;
pub use pipeline::PipelineWithCache;
pub use blur::FastGaussianBlur;
pub use error_diffusion::{
    FloydSteinberg, Atkinson, JarvisJudiceNinke, Sierra, Stucki, Burkes,
    TwoRowSierra, FalseFloydSteinberg, ShiauFan, SierraLite,
};
pub use ordered::{
    BayerDither, BlueNoiseDither, ClusteredHalftoneDither, DispersedHalftoneDither,
    VoidAndClusterDither,
};
pub use pattern::{
    CircleHalftonePattern, CrossHatchPattern, DiagonalLinePattern, HexagonGridPattern,
    SquareHalftonePattern, TriangleWavePattern, SpiralPattern,
};
pub use glitch::{
    BitCorruption, BlockCorruption, ChromaticAberration, ColorShift, CompressArtifact, DitherMix,
    Interlace, LineGlitch, LineRepeat, NoiseInjection, PixelShift, PixelSwap, Posterize,
    QuantizeGlitch, Stripe, Temporal, Warp, PixelSort, JpegArtifacts,
};
pub use special::{
    Bloom, BloomDither, EdgeDither, EpsilonGlow, GradientMap, HalftoneAngle, Hatching, InkBleed,
    Marble, PerlinDither, Scanline, ScanlinesWithSoftness, Stipple, SubpixelLayout,
    ThresholdOnly, Voronoi, WatercolorLike, WaveletDither,
};
pub use presets::{
    is_shareable_pattern_algorithm, PatternPreset, PatternPresetFile,
};
pub use color::{
    export_palette, extract_palette, find_closest_color_oklab, import_palette, oklab_to_rgb,
    rgb_to_oklab, PaletteFormat, QuantizationMethod,
};
pub use video::{
    export_frames_pack, list_temporal_variation_modes, prepare_video_layers, process_frame_batch,
    ChannelMask,
    process_frame_batch_packed,
    process_single_video_frame, process_single_video_frame_with_animation, reorder_layers,
    render_still_image_animation, list_animation_easing_modes,
    list_animation_parameter_modes, AnimationEasing, AnimationParameter, AnimationRenderMode,
    AnimationTrack, EffectLayer, PreparedVideoLayers, StillImageAnimationRequest,
    StillImageAnimationResult, TemporalVariationConfig, VideoFrameBatchPackedRequest,
    VideoFrameBatchPackedResult, VideoFrameBatchRequest, VideoFrameBatchResult,
};

struct NoDither;

impl Effect for NoDither {
    fn apply(&self, _image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        Ok(())
    }

    fn name(&self) -> &str {
        "None"
    }
}

/// Algorithm registry for creating effects by name
pub struct AlgorithmRegistry;

impl AlgorithmRegistry {
    pub fn create(
        algorithm: &str,
        palette: Vec<[u8; 3]>,
        intensity: f32,
    ) -> Result<Box<dyn Effect>, String> {
        match algorithm {
            "None" => Ok(Box::new(NoDither)),
            // Error Diffusion algorithms
            "Floyd-Steinberg" => Ok(Box::new(FloydSteinberg { palette, intensity })),
            "Atkinson" => Ok(Box::new(Atkinson { palette, intensity })),
            "Jarvis-Judice-Ninke" => Ok(Box::new(JarvisJudiceNinke { palette, intensity })),
            "Sierra" => Ok(Box::new(Sierra { palette, intensity })),
            "Stucki" => Ok(Box::new(Stucki { palette, intensity })),
            "Burkes" => Ok(Box::new(Burkes { palette, intensity })),
            "Two-Row Sierra" => Ok(Box::new(TwoRowSierra { palette, intensity })),
            "False Floyd-Steinberg" => Ok(Box::new(FalseFloydSteinberg { palette, intensity })),
            "Shiau Fan" => Ok(Box::new(ShiauFan { palette, intensity })),
            "Sierra Lite" => Ok(Box::new(SierraLite { palette, intensity })),
            // Ordered dithering algorithms
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
            "Bayer 8x8" => Ok(Box::new(BayerDither {
                size: 8,
                palette,
                intensity,
            })),
            "Blue Noise" => Ok(Box::new(BlueNoiseDither { palette, intensity })),
            "Void-and-Cluster" => Ok(Box::new(VoidAndClusterDither { palette, intensity })),
            "Clustered Halftone" => Ok(Box::new(ClusteredHalftoneDither {
                palette,
                intensity,
                cell_size: 6,
            })),
            "Dispersed Halftone" => Ok(Box::new(DispersedHalftoneDither { palette, intensity })),
            "Fast Gaussian Blur" => Ok(Box::new(FastGaussianBlur {
                radius: 2.0,
                intensity,
            })),
            "Diagonal Line" => Ok(Box::new(DiagonalLinePattern {
                palette,
                intensity,
                spacing: 6,
            })),
            "Cross Hatch" => Ok(Box::new(CrossHatchPattern {
                palette,
                intensity,
                spacing: 6,
            })),
            "Circle Halftone" => Ok(Box::new(CircleHalftonePattern {
                palette,
                intensity,
                cell_size: 6,
            })),
            "Square Halftone" => Ok(Box::new(SquareHalftonePattern {
                palette,
                intensity,
                cell_size: 6,
            })),
            "Triangle Wave" => Ok(Box::new(TriangleWavePattern {
                palette,
                intensity,
                frequency: 4.0,
            })),
            "Hexagon Grid" => Ok(Box::new(HexagonGridPattern {
                palette,
                intensity,
                cell_size: 8,
            })),
            "Spiral" => Ok(Box::new(SpiralPattern {
                palette,
                intensity,
                turns: 3.0,
            })),
            "Color Shift" => Ok(Box::new(ColorShift { palette, intensity })),
            "RGB Shift" => Ok(Box::new(ColorShift { palette, intensity })),
            "Block Corruption" => Ok(Box::new(BlockCorruption { palette, intensity })),
            "Line Glitch" => Ok(Box::new(LineGlitch { palette, intensity })),
            "Bit Corruption" => Ok(Box::new(BitCorruption { palette, intensity })),
            "Quantize Glitch" => Ok(Box::new(QuantizeGlitch { palette, intensity })),
            "Chromatic Aberration" => Ok(Box::new(ChromaticAberration { palette, intensity })),
            "Line Repeat" => Ok(Box::new(LineRepeat { palette, intensity })),
            "Pixel Swap" => Ok(Box::new(PixelSwap { palette, intensity })),
            "Noise Injection" => Ok(Box::new(NoiseInjection { palette, intensity })),
            "Stripe" => Ok(Box::new(Stripe { palette, intensity })),
            "Pixel Shift" => Ok(Box::new(PixelShift { palette, intensity })),
            "Compress Artifact" => Ok(Box::new(CompressArtifact { palette, intensity })),
            "Interlace" => Ok(Box::new(Interlace { palette, intensity })),
            "Posterize" => Ok(Box::new(Posterize { palette, intensity })),
            "Dither Mix" => Ok(Box::new(DitherMix { palette, intensity })),
            "Temporal" => Ok(Box::new(Temporal { palette, intensity })),
            "Warp" => Ok(Box::new(Warp { palette, intensity })),
            "Pixel Sort" => Ok(Box::new(PixelSort { palette, intensity })),
            "JPEG Artifacts" => Ok(Box::new(JpegArtifacts { palette, intensity })),
            "Perlin Dither" => Ok(Box::new(PerlinDither { palette, intensity })),
            "Stipple" => Ok(Box::new(Stipple { palette, intensity })),
            "Hatching" => Ok(Box::new(Hatching { palette, intensity })),
            "Watercolor-like" => Ok(Box::new(WatercolorLike { palette, intensity })),
            "Ink Bleed" => Ok(Box::new(InkBleed { palette, intensity })),
            "Threshold Only" => Ok(Box::new(ThresholdOnly { palette, intensity })),
            "Gradient Map" => Ok(Box::new(GradientMap { palette, intensity })),
            "Halftone Angle" => Ok(Box::new(HalftoneAngle { palette, intensity })),
            "Edge Dither" => Ok(Box::new(EdgeDither { palette, intensity })),
            "Wavelet Dither" => Ok(Box::new(WaveletDither { palette, intensity })),
            "Voronoi" => Ok(Box::new(Voronoi { palette, intensity })),
            "Scanline" => Ok(Box::new(Scanline { palette, intensity })),
            "Bloom" => Ok(Box::new(Bloom { palette, intensity })),
            "Bloom Dither" => Ok(Box::new(BloomDither { palette, intensity })),
            "Marble" => Ok(Box::new(Marble { palette, intensity })),
            "Epsilon Glow" => Ok(Box::new(EpsilonGlow { palette, intensity })),
            "Subpixel Layout" => Ok(Box::new(SubpixelLayout { palette, intensity })),
            "Scanlines with Softness" => Ok(Box::new(ScanlinesWithSoftness { palette, intensity })),
            _ => Err(format!("Unknown algorithm: {}", algorithm)),
        }
    }

    /// List all available algorithms
    pub fn list_all() -> Vec<&'static str> {
        vec![
            "None",
            "Floyd-Steinberg",
            "Atkinson",
            "Jarvis-Judice-Ninke",
            "Sierra",
            "Stucki",
            "Burkes",
            "Two-Row Sierra",
            "False Floyd-Steinberg",
            "Shiau Fan",
            "Sierra Lite",
            "Bayer 2x2",
            "Bayer 4x4",
            "Bayer 8x8",
            "Blue Noise",
            "Void-and-Cluster",
            "Clustered Halftone",
            "Dispersed Halftone",
            "Fast Gaussian Blur",
            "Diagonal Line",
            "Cross Hatch",
            "Circle Halftone",
            "Square Halftone",
            "Triangle Wave",
            "Hexagon Grid",
            "Spiral",
            "Color Shift",
            "RGB Shift",
            "Block Corruption",
            "Line Glitch",
            "Bit Corruption",
            "Quantize Glitch",
            "Chromatic Aberration",
            "Line Repeat",
            "Pixel Swap",
            "Noise Injection",
            "Stripe",
            "Pixel Shift",
            "Compress Artifact",
            "Interlace",
            "Posterize",
            "Dither Mix",
            "Temporal",
            "Warp",
            "Pixel Sort",
            "JPEG Artifacts",
            "Perlin Dither",
            "Stipple",
            "Hatching",
            "Watercolor-like",
            "Ink Bleed",
            "Threshold Only",
            "Gradient Map",
            "Halftone Angle",
            "Edge Dither",
            "Wavelet Dither",
            "Voronoi",
            "Scanline",
            "Bloom",
            "Bloom Dither",
            "Marble",
            "Epsilon Glow",
            "Subpixel Layout",
            "Scanlines with Softness",
        ]
    }
}

/// Standard palettes
pub mod palettes {
    fn clamp(v: i32) -> u8 {
        v.clamp(0, 255) as u8
    }

    fn tint_palette(base: &[[u8; 3]], tint: [i32; 3]) -> Vec<[u8; 3]> {
        base.iter()
            .map(|c| {
                [
                    clamp(c[0] as i32 + tint[0]),
                    clamp(c[1] as i32 + tint[1]),
                    clamp(c[2] as i32 + tint[2]),
                ]
            })
            .collect()
    }

    fn grayscale_steps(levels: usize) -> Vec<[u8; 3]> {
        if levels <= 1 {
            return vec![[0, 0, 0]];
        }
        (0..levels)
            .map(|i| {
                let v = ((i as f32 / (levels as f32 - 1.0)) * 255.0).round() as u8;
                [v, v, v]
            })
            .collect()
    }

    fn gradient_palette(start: [u8; 3], end: [u8; 3], levels: usize) -> Vec<[u8; 3]> {
        (0..levels)
            .map(|i| {
                let t = if levels <= 1 {
                    0.0
                } else {
                    i as f32 / (levels as f32 - 1.0)
                };
                [
                    (start[0] as f32 * (1.0 - t) + end[0] as f32 * t).round() as u8,
                    (start[1] as f32 * (1.0 - t) + end[1] as f32 * t).round() as u8,
                    (start[2] as f32 * (1.0 - t) + end[2] as f32 * t).round() as u8,
                ]
            })
            .collect()
    }

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

    pub fn list_all_names() -> Vec<&'static str> {
        vec![
            // Grayscale family
            "Grayscale", "Grayscale 2", "Grayscale 4", "Grayscale 8", "Grayscale 16",
            // Retro cores
            "CGA", "EGA", "GameBoy", "ZX Spectrum", "Commodore 64", "Apple II",
            "VGA 16", "Windows 3.11", "Master System", "Sega Genesis", "SNES",
            // Artistic / cinematic
            "Vaporwave", "Cyberpunk", "Sepia", "Vintage Film", "Noir", "Synth Sunset",
            "Ocean Mist", "Forest Moss", "Desert Sand", "Neon Lime", "Plasma", "Lavender",
            "Amber Glow", "Ice Blue", "Rose Gold", "Teal Punch", "Night Drive", "Arcade",
            "Paper Ink", "CRT Warm", "CRT Cool", "LCD Soft", "Aurora", "Ember",
            "Pastel Dream", "Mono Green", "Mono Amber", "Mono Cyan", "Mono Purple",
            "Sunset 8", "Ocean 8", "Candy 8", "Matrix", "Terminal", "Dusk", "Dawn",
            "Infrared", "Blueprint", "Toxic", "Peach", "Mint", "Royal", "Copper",
        ]
    }

    pub fn get_palette(name: &str) -> Option<Vec<[u8; 3]>> {
        match name {
            "Grayscale" => Some(grayscale()),
            "Grayscale 2" => Some(grayscale_steps(2)),
            "Grayscale 4" => Some(grayscale_steps(4)),
            "Grayscale 8" => Some(grayscale_steps(8)),
            "Grayscale 16" => Some(grayscale_steps(16)),
            "CGA" => Some(cga()),
            "EGA" => Some(ega()),
            "GameBoy" => Some(gameboy()),
            "ZX Spectrum" => Some(vec![
                [0, 0, 0], [0, 0, 205], [205, 0, 0], [205, 0, 205],
                [0, 205, 0], [0, 205, 205], [205, 205, 0], [205, 205, 205],
            ]),
            "Commodore 64" => Some(vec![
                [0, 0, 0], [255, 255, 255], [136, 0, 0], [170, 255, 238],
                [204, 68, 204], [0, 204, 85], [0, 0, 170], [238, 238, 119],
                [221, 136, 85], [102, 68, 0], [255, 119, 119], [51, 51, 51],
                [119, 119, 119], [170, 255, 102], [0, 136, 255], [187, 187, 187],
            ]),
            "Apple II" => Some(vec![
                [0, 0, 0], [227, 30, 96], [96, 78, 189], [255, 68, 253],
                [0, 163, 96], [156, 156, 156], [20, 207, 253], [208, 195, 255],
            ]),
            "VGA 16" => Some(ega()),
            "Windows 3.11" => Some(vec![
                [0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0],
                [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
                [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0],
                [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255],
            ]),
            "Master System" => Some(gradient_palette([0, 0, 0], [255, 255, 255], 16)),
            "Sega Genesis" => Some(gradient_palette([0, 0, 32], [255, 255, 192], 16)),
            "SNES" => Some(gradient_palette([16, 16, 16], [240, 240, 240], 16)),

            "Vaporwave" => Some(gradient_palette([255, 105, 180], [0, 255, 255], 8)),
            "Cyberpunk" => Some(gradient_palette([10, 10, 25], [255, 0, 180], 8)),
            "Sepia" => Some(gradient_palette([30, 20, 10], [240, 220, 170], 8)),
            "Vintage Film" => Some(gradient_palette([25, 22, 16], [222, 198, 154], 8)),
            "Noir" => Some(gradient_palette([0, 0, 0], [210, 210, 210], 8)),
            "Synth Sunset" => Some(gradient_palette([30, 0, 60], [255, 170, 80], 8)),
            "Ocean Mist" => Some(gradient_palette([10, 40, 70], [180, 240, 255], 8)),
            "Forest Moss" => Some(gradient_palette([10, 30, 10], [170, 210, 120], 8)),
            "Desert Sand" => Some(gradient_palette([40, 24, 8], [240, 210, 150], 8)),
            "Neon Lime" => Some(gradient_palette([10, 20, 10], [190, 255, 40], 8)),
            "Plasma" => Some(gradient_palette([25, 0, 70], [255, 70, 200], 8)),
            "Lavender" => Some(gradient_palette([30, 20, 50], [220, 180, 255], 8)),
            "Amber Glow" => Some(gradient_palette([30, 18, 0], [255, 190, 40], 8)),
            "Ice Blue" => Some(gradient_palette([5, 20, 40], [180, 230, 255], 8)),
            "Rose Gold" => Some(gradient_palette([50, 20, 24], [255, 210, 190], 8)),
            "Teal Punch" => Some(gradient_palette([0, 40, 40], [80, 255, 220], 8)),
            "Night Drive" => Some(gradient_palette([5, 5, 18], [130, 170, 255], 8)),
            "Arcade" => Some(gradient_palette([20, 0, 40], [255, 255, 80], 8)),
            "Paper Ink" => Some(gradient_palette([35, 33, 26], [245, 242, 228], 8)),
            "CRT Warm" => Some(gradient_palette([20, 16, 8], [255, 220, 170], 8)),
            "CRT Cool" => Some(gradient_palette([8, 16, 20], [170, 220, 255], 8)),
            "LCD Soft" => Some(gradient_palette([18, 22, 30], [210, 220, 240], 8)),
            "Aurora" => Some(gradient_palette([10, 30, 35], [180, 255, 200], 8)),
            "Ember" => Some(gradient_palette([30, 8, 4], [255, 120, 60], 8)),
            "Pastel Dream" => Some(gradient_palette([150, 150, 190], [255, 230, 220], 8)),

            "Mono Green" => Some(tint_palette(&grayscale_steps(8), [-140, 10, -140])),
            "Mono Amber" => Some(tint_palette(&grayscale_steps(8), [40, 10, -120])),
            "Mono Cyan" => Some(tint_palette(&grayscale_steps(8), [-120, 20, 20])),
            "Mono Purple" => Some(tint_palette(&grayscale_steps(8), [30, -120, 40])),

            "Sunset 8" => Some(gradient_palette([40, 0, 40], [255, 180, 80], 8)),
            "Ocean 8" => Some(gradient_palette([0, 20, 40], [100, 220, 255], 8)),
            "Candy 8" => Some(gradient_palette([255, 80, 180], [255, 255, 150], 8)),
            "Matrix" => Some(tint_palette(&grayscale_steps(8), [-150, 0, -150])),
            "Terminal" => Some(tint_palette(&grayscale_steps(8), [-120, -20, -120])),
            "Dusk" => Some(gradient_palette([20, 20, 60], [255, 170, 190], 8)),
            "Dawn" => Some(gradient_palette([30, 30, 80], [255, 220, 150], 8)),
            "Infrared" => Some(gradient_palette([10, 0, 0], [255, 80, 20], 8)),
            "Blueprint" => Some(gradient_palette([0, 15, 60], [140, 200, 255], 8)),
            "Toxic" => Some(gradient_palette([20, 40, 0], [220, 255, 40], 8)),
            "Peach" => Some(gradient_palette([70, 20, 10], [255, 210, 170], 8)),
            "Mint" => Some(gradient_palette([20, 50, 35], [200, 255, 220], 8)),
            "Royal" => Some(gradient_palette([20, 10, 70], [180, 170, 255], 8)),
            "Copper" => Some(gradient_palette([40, 20, 10], [230, 150, 90], 8)),
            _ => None,
        }
    }
}
