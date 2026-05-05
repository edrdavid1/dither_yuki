# Phase A: Backend Foundation — Detailed Implementation Plan

**Duration**: Weeks 1–4  
**Objective**: Solid, testable Rust engine for all 63 algorithms + IPC layer

---

## CRITICAL ARCHITECTURE UPGRADES

Before proceeding with algorithms, these core improvements are **required** for quality and performance:

### 1. Color Space Management (Oklab/CIELAB)
**Why**: RGB dithering causes visible color banding. Perceptual color spaces produce cleaner results.

**Add to `src-tauri/src/image_engine/color/color_space.rs`:**
```rust
pub struct Oklab {
    pub l: f32,    // Lightness [0, 1]
    pub a: f32,    // Green-Red [-0.4, 0.4]
    pub b: f32,    // Blue-Yellow [-0.4, 0.4]
}

pub fn rgb_to_oklab(r: u8, g: u8, b: u8) -> Oklab { /* ... */ }
pub fn oklab_to_rgb(oklab: Oklab) -> [u8; 3] { /* ... */ }
pub fn color_distance_oklab(c1: Oklab, c2: Oklab) -> f32 { /* Euclidean */ }
```

Update all dithering algorithms to use `color_distance_oklab()` instead of RGB Euclidean distance.

### 2. Pipeline Caching (Intermediate States)
**Why**: When user tweaks last effect in 10-layer stack, UI shouldn't recompute all 9 previous effects.

**Modify `src-tauri/src/image_engine/pipeline.rs`:**
```rust
pub struct PipelineWithCache {
    effects: Vec<Box<dyn Effect>>,
    cache: HashMap<usize, ImageData>, // index → cached result
}

impl PipelineWithCache {
    pub fn execute_from_layer(
        &mut self,
        image: ImageData,
        start_layer: usize,
    ) -> Result<ImageData, String> {
        // Use cache[start_layer-1] if available, otherwise run from 0
        let mut current = self.cache.get(&(start_layer - 1))
            .cloned()
            .unwrap_or(image);
        
        for (idx, effect) in self.effects[start_layer..].iter().enumerate() {
            effect.apply(&mut current)?;
            self.cache.insert(start_layer + idx, current.clone());
        }
        Ok(current)
    }
}
```

### 3. Frame Context Module (Seed + Animation)
**Why**: Animated dithering, temporal coherence, procedural generation need per-frame state.

**Add `src-tauri/src/image_engine/context.rs`:**
```rust
pub struct FrameContext {
    pub seed: u64,              // For deterministic randomness
    pub frame_index: u32,       // Current frame in sequence
    pub time_seconds: f32,      // For sine waves, animations
    pub total_frames: u32,      // Total in sequence (for normalization)
}

impl FrameContext {
    pub fn new(frame_index: u32, total_frames: u32) -> Self {
        Self {
            seed: frame_index as u64 * 2654435761, // Deterministic
            frame_index,
            time_seconds: frame_index as f32 / 30.0, // Assume 30 fps
            total_frames,
        }
    }
}
```

Update `Effect` trait:
```rust
pub trait Effect: Send + Sync {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String>;
    fn name(&self) -> &str;
}
```

---

## Week 1: Architecture Setup + Error Diffusion (10 algorithms)

### Day 1–2: Module Structure & Build Setup

**Tasks:**
1. Reorganize `src-tauri/src/` to match blueprint:
   ```
   src-tauri/src/
   ├── image_engine/
   │   ├── mod.rs                 # Exports main API
   │   ├── types.rs               # ImageData, Effect trait
   │   ├── pipeline.rs            # Pipeline executor
   │   ├── effects/
   │   │   ├── mod.rs
   │   │   ├── blur.rs
   │   │   ├── adjust.rs
   │   │   ├── sharpen.rs
   │   │   ├── noise.rs
   │   │   ├── pixel_scale.rs
   │   │   └── dither/
   │   │       ├── mod.rs
   │   │       ├── error_diffusion.rs
   │   │       ├── ordered.rs
   │   │       ├── pattern.rs
   │   │       ├── glitch.rs
   │   │       └── special.rs
   │   └── color/
   │       ├── palette.rs
   │       └── quantize.rs
   ├── commands/
   │   ├── mod.rs
   │   └── image.rs               # Tauri commands
   └── lib.rs                      # Facade
   ```

2. Update `Cargo.toml`:
   ```toml
   [dependencies]
   image = "0.24"
   rayon = "1.7"
   tokio = { version = "1.35", features = ["full"] }
   serde = { version = "1.0", features = ["derive"] }
   serde_json = "1.0"
   uuid = { version = "1.6", features = ["v4", "serde"] }
   ffmpeg-next = "7.0"              # For video processing (Phase C)
   ndarray = "0.15"                 # For matrix ops (Oklab, blur)
   ```

3. Compile and verify no errors

**Output**: Clean module structure with dependencies, color space foundation, caching infrastructure

---

### Day 3–5: Core Types & Error Diffusion (10 algorithms)

**Core Types** (`src-tauri/src/image_engine/types.rs`):
```rust
pub struct ImageData {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>, // RGBA
}

pub struct FrameContext {
    pub seed: u64,
    pub frame_index: u32,
    pub time_seconds: f32,
    pub total_frames: u32,
}

pub trait Effect: Send + Sync {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String>;
    fn name(&self) -> &str;
}

pub struct PipelineWithCache {
    effects: Vec<Box<dyn Effect>>,
    cache: HashMap<usize, ImageData>,
}

impl PipelineWithCache {
    pub fn execute(&mut self, image: ImageData, ctx: &FrameContext) -> Result<ImageData, String> {
        let mut result = image;
        for (idx, effect) in self.effects.iter().enumerate() {
            effect.apply(&mut result, ctx)?;
            self.cache.insert(idx, result.clone());
        }
        Ok(result)
    }
    
    pub fn execute_from_layer(&mut self, start_layer: usize, ctx: &FrameContext) -> Result<ImageData, String> {
        let mut result = self.cache.get(&(start_layer - 1))
            .cloned()
            .ok_or("Layer not cached".to_string())?;
        
        for (offset, effect) in self.effects[start_layer..].iter().enumerate() {
            effect.apply(&mut result, ctx)?;
            self.cache.insert(start_layer + offset, result.clone());
        }
        Ok(result)
    }
}
```

**Error Diffusion Algorithms** (`src-tauri/src/image_engine/effects/dither/error_diffusion.rs`):
Implement:
1. Floyd-Steinberg
2. Jarvis-Judice-Ninke
3. Sierra
4. Atkinson
5. Stucki
6. Burkes
7. Diffusion (simple)
8. Two-row Sierra
9. False Floyd-Steinberg
10. Shiau Fan

Each as a struct implementing `Effect` with Oklab color distance:
```rust
pub struct FloydSteinberg {
    palette: Vec<[u8; 3]>,
    intensity: f32,
}

impl Effect for FloydSteinberg {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        // Implementation: scan left-to-right, top-to-bottom
        // For each pixel:
        //   1. Convert RGB → Oklab
        //   2. Find closest palette color using color_distance_oklab()
        //   3. Calculate error in Oklab space
        //   4. Distribute error: 7/16, 3/16, 5/16, 1/16
        //   5. Convert back → RGB
    }
    
    fn name(&self) -> &str { "Floyd-Steinberg" }
}
```

**Tests**: Add deterministic test for each (input: fixed image + palette → verify output exactly)

**Output**: 10 error diffusion algorithms + test suite

---

## Week 2: Ordered + Pattern (13) + Fast Gaussian Blur

### Day 1–2: Enhanced Ordered Dithering (7)

Implement:
1. Bayer 2×2 ✅ (already done)
2. Bayer 4×4 ✅ (already done)
3. Bayer 8×8 (extend existing)
4. Blue Noise (texture-based, sampled from precomputed blue noise texture)
5. Void-and-Cluster (procedural blue noise variant)
6. Clustered Half-tone (dot pattern with varying sizes)
7. Dispersed Half-tone (scattered dots, random-looking)

Each with configurable threshold matrix.

```rust
pub struct BayerDither {
    size: usize, // 2, 4, or 8
    palette: Vec<[u8; 3]>,
    intensity: f32,
}
```

**Output**: 7 ordered algorithms + blue noise texture assets

---

### Day 3–5: Pattern Dithering (6) + Fast Gaussian Blur (NEW)

**Pattern Dithering:**
Implement geometric/halftone patterns:
1. Diagonal Line (45° repeating stripes)
2. Cross Hatch (perpendicular lines)
3. Circle Half-tone (expanding circles, size = error)
4. Square Half-tone (expanding squares, rotation option)
5. Triangle Wave (sine-wave pattern)
6. Hexagon Grid (honeycomb)

Each creates repeating pattern at configurable scale.

**NEW: Fast Gaussian Blur** (`src-tauri/src/image_engine/effects/blur.rs`)
**Why**: Needed for Epsilon Glow (dither + blur = soft pixel effect), Bloom effects

```rust
pub struct FastGaussianBlur {
    pub radius: f32,      // 1.0 - 10.0
    pub intensity: f32,   // 0.0 - 100.0
}

impl Effect for FastGaussianBlur {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        // Use separable 1D Gaussian: O(n*r) instead of O(n*r²)
        // Apply horizontal pass, then vertical
    }
}
```

**Output**: 6 pattern algorithms + Fast Gaussian Blur foundation

---

## Week 3: Glitch (17) + Special (16) + CRT/LCD Emulation (2)

### Day 1–3: Glitch Effects (17)

These are creative/procedural distortions (all use `ctx.seed` for reproducibility):
1. Color Shift (RGB channel shift, `ctx.frame_index` for temporal variation)
2. Block Corruption (random block replacement using `ctx.seed`)
3. Line Glitch (horizontal/vertical scan lines with `ctx.time_seconds` for animation)
4. Bit Corruption (flip random bits in LSB, reproducible via `ctx.seed`)
5. Quantize Glitch (reduce bit depth, frame-indexed for temporal effect)
6. Chromatic Aberration (RGB channel separation by offset)
7. Line Repeat (duplicate random scan lines, seeded)
8. Pixel Swap (swap random neighboring pixels)
9. Noise Injection (add Perlin noise using `ctx.seed`)
10. Stripe (alternating horizontal lines, phase varies by `ctx.frame_index`)
11. Pixel Shift (directional pixel offset by `ctx.time_seconds`)
12. Compress Artifact (simulate JPEG DCT blocking, intensity-based)
13. Interlace (field doubling, frame-dependent deinterlacing artifact)
14. Posterize (reduce color levels uniformly, customizable depth)
15. Dither Mix (blend 2-3 dither modes, controlled by `ctx.frame_index`)
16. Temporal (animated procedural noise, varies per frame)
17. Warp (apply sine/wave distortion, phase = `ctx.time_seconds`)

**Output**: 17 glitch algorithms

---

### Day 4–5: Special Effects (16) + CRT/LCD Emulation (2)

**Special Effects (Advanced artistic filters):**
1. Perlin Dither (noise-based, seeded via `ctx.seed`)
2. Stipple (dot-based distribution, size-adaptive)
3. Hatching (line-based, angle-configurable)
4. Watercolor-like (soft edges via Gaussian blur + edge detection)
5. Ink Bleed (organic spread with asymmetric error distribution)
6. Threshold Only (pure B&W, no dither)
7. Gradient Map (tone-based color remapping)
8. Halftone Angle (rotated lines, angle = `ctx.frame_index * 0.5°`)
9. Edge Dither (only dither edges detected via Sobel)
10. Wavelet Dither (multi-scale dithering)
11. Voronoi (cell-based, seed-generated centroids)
12. Scanline (retro TV with configurable line height)
13. Bloom (glow effect via Fast Gaussian Blur)
14. Bloom Dither (glow + dither combination)
15. Marble (texture overlay, procedurally generated)
16. Epsilon Glow (NEW: dither + subtle blur for soft pixel effect)

**CRT/LCD Emulation (NEW):**
1. Subpixel Layout (RGB stripe simulation, imitate LCD pixel layout)
2. Scanlines with Softness (configurable height + falloff curve)
   - Both use physical monitor parameters: pixel pitch, phosphor bloom

**Output**: 16 special algorithms + 2 physical monitor emulation

---

## Week 4: Color Management + Export + Video Commands

### Day 1–2: Color Management (Enhanced)

1. **Palette Quantization** (in Oklab space for better color selection):
   ```rust
   pub fn extract_palette(
       image: &ImageData,
       color_count: u32,
       method: QuantizationMethod,
   ) -> Result<Vec<[u8; 3]>, String>
   ```
   Implement:
   - **Median Cut** (fast, good for varied palettes)
   - **K-Means** (slower, better convergence, iterative in Oklab)
   - **Octree Quantization** (memory-efficient)

2. **Built-in Palettes** (50+):
   - Grayscale (4, 8, 16 levels)
   - CGA (16 colors) + CGA High-Intensity
   - EGA (16, 256 colors)
   - ZX Spectrum (8 colors, bright + normal)
   - Commodore 64 (16 colors)
   - GameBoy (4 colors, original + pocket)
   - Apple II (8, 16 colors)
   - VGA (256 colors)
   - Windows 3.11 (256 colors)
   - Atari ST (512 colors subset)
   - Master System (64 colors)
   - Sega Genesis (512 colors subset)
   - SNES (256 color subsets)
   - Artistic: vintage film, vaporwave, cyberpunk, sepia, etc. (20+)

3. **Palette Import/Export** (NEW):
   ```rust
   pub fn export_palette(palette: &[[u8; 3]], format: PaletteFormat) -> Result<Vec<u8>, String>
   pub fn import_palette(data: &[u8], format: PaletteFormat) -> Result<Vec<[u8; 3]>, String>
   ```
   Formats:
   - `.ase` (Adobe Swatch Exchange, binary)
   - `.gpl` (GIMP Palette, text)
   - `.pal` (PAL/PAC format)
   - `.act` (Adobe Color Table)
   - `.txt` (Hex color list)

**Output**: Palette extraction (3 methods), 50+ presets, import/export support

---

### Day 2.5: Export & Upscaling (NEW)

**SVG Vector Export** (`src-tauri/src/export/svg.rs`):
```rust
pub fn export_to_svg(
    image: &ImageData,
    palette: &[[u8; 3]],
    scale: u32,          // Pixels → SVG units
    shape: SVGShape,     // Rect, Circle, Hexagon
) -> Result<String, String>
```
Logic:
- Iterate dithered pixels
- Group consecutive pixels of same color
- Generate `<rect>` or `<circle>` elements
- Batch colors for file size optimization

**Upscale Processor** (`src-tauri/src/export/upscale.rs`):
```rust
pub fn upscale_nearest_neighbor(
    image: &ImageData,
    scale: u32,  // 2x, 4x, 8x
) -> Result<ImageData, String>
```
Render at 2×, 4×, 8× size preserving pixel crisp edges (no interpolation).

**Output**: SVG export + upscaling pipeline

---

### Day 3–4: Pipeline Integration + Video Commands

1. Create `Pipeline` builder:
   ```rust
   pub struct PipelineBuilder {
       effects: Vec<Box<dyn Effect>>,
   }
   
   impl PipelineBuilder {
       pub fn add_effect(mut self, effect: Box<dyn Effect>) -> Self {
           self.effects.push(effect);
           self
       }
       
       pub fn build(self) -> Pipeline {
           Pipeline { effects: self.effects }
       }
   }
   ```

2. Create factory functions for each algorithm:
   ```rust
   pub fn floyd_steinberg(palette: Vec<[u8; 3]>, intensity: f32) -> Box<dyn Effect> {
       Box::new(FloydSteinberg { palette, intensity })
   }
   ```

3. Serialize/deserialize pipeline from JSON (for presets)

**Output**: Pipeline system complete

---

### Day 4: Tauri Commands (Extended)

**Image Processing Commands** (`src-tauri/src/commands/image.rs`):
```rust
#[tauri::command]
pub async fn process_image(
    image_bytes: Vec<u8>,
    algorithm: String,
    palette_name: String,
    intensity: f32,
    frame_index: u32,
    total_frames: u32,
) -> Result<Vec<u8>, String> {
    let ctx = FrameContext::new(frame_index, total_frames);
    let effect = AlgorithmRegistry::create(&algorithm, palette, intensity)?;
    // ... apply with ctx ...
}

#[tauri::command]
pub fn list_algorithms() -> Vec<String> { /* Return all 63 names */ }

#[tauri::command]
pub fn list_palettes() -> Vec<PaletteInfo> { /* Name, color_count, type */ }

#[tauri::command]
pub fn extract_palette(
    image_bytes: Vec<u8>,
    color_count: u32,
    method: String, // "median-cut", "kmeans", "octree"
) -> Result<Vec<[u8; 3]>, String> { /* ... */ }

#[tauri::command]
pub fn export_palette(
    palette: Vec<[u8; 3]>,
    format: String, // "ase", "gpl", "pal", "act", "txt"
) -> Result<Vec<u8>, String> { /* ... */ }

#[tauri::command]
pub fn export_svg(
    image_bytes: Vec<u8>,
    palette: Vec<[u8; 3]>,
    scale: u32,
    shape: String, // "rect", "circle", "hexagon"
) -> Result<String, String> { /* ... */ }

#[tauri::command]
pub fn upscale_image(
    image_bytes: Vec<u8>,
    scale: u32, // 2, 4, or 8
) -> Result<Vec<u8>, String> { /* ... */ }
```

**Video Commands (Placeholder for Phase D):**
```rust
#[tauri::command]
pub async fn process_video_stream(
    video_path: String,
    algorithm: String,
    palette_name: String,
) -> Result<String, String> {
    // Returns job_id for progress tracking
    // Implementation in Phase D with FFmpeg
}

#[tauri::command]
pub async fn get_video_progress(job_id: String) -> Result<VideoProgress, String> {
    // Returns {current_frame, total_frames, estimated_seconds_remaining}
}
```

2. Register commands in `src-tauri/src/lib.rs`

**Output**: Full Tauri IPC command set for Phase A + B + D

---

### Day 5: Tests + Documentation

Add comprehensive tests:
- Unit test per algorithm (deterministic, same input = same output)
- Integration test: 5-effect pipeline with caching
- Color space test: RGB vs Oklab quality comparison
- Benchmark: processing time @ 512×512, 1K, 2K, 4K resolutions
- Regression test: visual comparison against golden images

```bash
cargo test --release
cargo bench
```

**Output**: All 63 algorithms tested, benchmarked, documented

---

## Testing Strategy (Per Week)

Each algorithm gets:
1. **Deterministic test**: Same input → Same output (use fixed seed)
2. **Regression test**: Visual comparison (save golden image)
3. **Performance test**: Measure time @ 1K, 2K, 4K

Total: ~63 unit tests + 5 integration tests + 10 benchmarks

---

## Success Criteria (End of Phase A)

**CORE:**
- ✅ All 63 algorithms implemented
- ✅ Oklab/CIELAB color space for dithering
- ✅ Pipeline caching for instant UI preview
- ✅ Frame context (seed, time, frame_index) passed to all effects
- ✅ 50+ palettes (retro + artistic)
- ✅ Palette quantization (Median Cut, K-Means, Octree)
- ✅ Palette import/export (.ase, .gpl, .pal, .act, .txt)

**ADVANCED:**
- ✅ Fast Gaussian Blur (for Bloom/Glow effects)
- ✅ CRT/LCD physical emulation (subpixel + scanlines)
- ✅ SVG vector export
- ✅ Image upscaling (2×, 4×, 8× Nearest Neighbor)
- ✅ Blue Noise + Void-and-Cluster ordered dithering

**ROBUSTNESS:**
- ✅ All tests passing (unit + integration + regression)
- ✅ No panics or crashes on any algorithm
- ✅ Benchmark suite: performance @ 512×512, 1K, 2K, 4K
- ✅ Documentation on algorithm parameters + visual examples
- ✅ Full Tauri command API documented

---

## Build Instructions (For Developer)

```bash
cd src-tauri
cargo build --release

# Run tests
cargo test --release

# Run benchmarks
cargo bench
```

**Frontend Integration Ready:**
```javascript
// Basic image processing
await invoke('process_image', {
    imageBytes,
    algorithm: 'Floyd-Steinberg',
    paletteName: 'GameBoy',
    intensity: 100,
    frameIndex: 0,
    totalFrames: 1,
})

// Extract palette from image
const palette = await invoke('extract_palette', {
    imageBytes,
    colorCount: 8,
    method: 'median-cut',
})

// Export to SVG
const svg = await invoke('export_svg', {
    imageBytes,
    palette,
    scale: 4,
    shape: 'rect',
})

// Upscale for crisp display
const upscaled = await invoke('upscale_image', {
    imageBytes,
    scale: 4,
})
```

---

## Handoff to Phase B

Once Phase A is complete:
- React team has stable Tauri command API
- All algorithms tested
- Performance baseline established
- Ready to build UI layer (PipelinePanel, etc.)

