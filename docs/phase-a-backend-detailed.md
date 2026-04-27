# Phase A: Backend Foundation — Detailed Implementation Plan

**Duration**: Weeks 1–4  
**Objective**: Solid, testable Rust engine for all 63 algorithms + IPC layer

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
   ```

3. Compile and verify no errors

**Output**: Clean module structure, ready for algorithms

---

### Day 3–5: Core Types & Error Diffusion (10 algorithms)

**Core Types** (`src-tauri/src/image_engine/types.rs`):
```rust
pub struct ImageData {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>, // RGBA
}

pub trait Effect: Send + Sync {
    fn apply(&self, image: &mut ImageData) -> Result<(), String>;
    fn name(&self) -> &str;
}

pub struct Pipeline {
    effects: Vec<Box<dyn Effect>>,
}

impl Pipeline {
    pub fn execute(&self, image: ImageData) -> Result<ImageData, String> {
        let mut result = image;
        for effect in &self.effects {
            effect.apply(&mut result)?;
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

Each as a struct implementing `Effect`:
```rust
pub struct FloydSteinberg {
    palette: Vec<[u8; 3]>,
    intensity: f32,
}

impl Effect for FloydSteinberg {
    fn apply(&self, image: &mut ImageData) -> Result<(), String> {
        // Implementation: scan left-to-right, top-to-bottom
        // Distribute error: 7/16, 3/16, 5/16, 1/16
    }
    
    fn name(&self) -> &str { "Floyd-Steinberg" }
}
```

**Tests**: Add deterministic test for each (input: fixed image + palette → verify output exactly)

**Output**: 10 error diffusion algorithms + test suite

---

## Week 2: Ordered Dithering (5) + Pattern (8)

### Day 1–2: Ordered Dithering

Implement:
1. Bayer 2×2
2. Bayer 4×4
3. Bayer 8×8
4. Clustered (Dot)
5. Dispersed (Random-looking)

Each with configurable threshold matrix.

```rust
pub struct BayerDither {
    size: usize, // 2, 4, or 8
    palette: Vec<[u8; 3]>,
    intensity: f32,
}
```

**Output**: 5 ordered algorithms

---

### Day 3–5: Pattern Dithering (8)

Implement geometric/halftone patterns:
1. Diagonal Line
2. Cross Hatch
3. Circle Half-tone
4. Square Half-tone
5. Triangle
6. Hexagon
7. Spiral
8. Organic Blob

Each creates repeating pattern at configurable scale.

**Output**: 8 pattern algorithms

---

## Week 3: Glitch (17) + Special (16)

### Day 1–3: Glitch Effects (17)

These are creative/procedural distortions:
1. Color Shift (RGB channel shift)
2. Block Corruption (random block replacement)
3. Line Glitch (horizontal/vertical scan lines)
4. Bit Corruption (flip random bits)
5. Quantize Glitch (reduce bit depth drastically)
6. Chromatic Aberration (RGB split)
7. Line Repeat (duplicate random scan lines)
8. Pixel Swap (swap random neighbors)
9. Noise Injection (add correlated noise)
10. Stripe (alternating lines)
11. Pixel Shift (shift pixels by offset)
12. Compress Artifact (simulate JPEG)
13. Interlace (field doubling effect)
14. Posterize (reduce color levels)
15. Dither Mix (blend multiple dither modes)
16. Temporal (animated noise; frame-dependent)
17. Warp (apply sine/wave distortion)

Each takes seed/variation parameters for reproducibility.

**Output**: 17 glitch algorithms

---

### Day 4–5: Special Effects (16)

Advanced artistic filters:
1. Perlin Dither (noise-based)
2. Stipple (dot-based distribution)
3. Hatching (line-based)
4. Watercolor-like (soft edges)
5. Ink Bleed (organic spread)
6. Threshold Only (pure B&W, no dither)
7. Gradient Map (tone-based color)
8. Halftone Angle (rotated lines)
9. Edge Dither (only dither edges)
10. Wavelet Dither
11. Voronoi (cell-based)
12. Scanline (retro TV)
13. Bloom (glow effect)
14. Bloom Dither (glow + dither)
15. Marble (texture overlay)
16. User Custom (hook for user scripts in future)

**Output**: 16 special algorithms

---

## Week 4: Color + Integration

### Day 1–2: Color Management

1. **Palette quantization**:
   ```rust
   pub fn extract_palette(
       image: &ImageData,
       color_count: u32,
   ) -> Result<Vec<[u8; 3]>, String>
   ```
   Implement:
   - Median Cut
   - K-Means (simple)
   - Octree quantization

2. **Built-in palettes** (store as constants):
   - Grayscale (4, 8, 16 levels)
   - CGA (16 colors)
   - EGA (16, 256 colors)
   - ZX Spectrum (8 colors)
   - Commodore 64 (16 colors)
   - GameBoy (4 colors)
   - Apple II (8, 16 colors)
   - VGA (256 colors)
   - Windows 3.11 (256 colors)
   - And 40+ more retro/artistic palettes

**Output**: Palette extraction + 50+ presets

---

### Day 3–4: Pipeline Integration

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

### Day 5: Tauri Commands + Tests

1. Create `src-tauri/src/commands/image.rs`:
   ```rust
   #[tauri::command]
   pub async fn process_image(
       image_bytes: Vec<u8>,
       algorithm: String,
       palette_name: String,
       intensity: f32,
   ) -> Result<Vec<u8>, String> {
       // Decode image_bytes → ImageData
       // Find algorithm by name
       // Apply effect
       // Encode back to bytes
       // Return
   }
   ```

2. Register commands in `src-tauri/src/lib.rs`

3. Add comprehensive tests:
   - Unit test per algorithm (deterministic)
   - Integration test: 5-effect pipeline
   - Benchmark: measure processing time @ 1K, 2K, 4K

**Output**: Working Tauri IPC + test suite

---

## Testing Strategy (Per Week)

Each algorithm gets:
1. **Deterministic test**: Same input → Same output (use fixed seed)
2. **Regression test**: Visual comparison (save golden image)
3. **Performance test**: Measure time @ 1K, 2K, 4K

Total: ~63 unit tests + 5 integration tests + 10 benchmarks

---

## Success Criteria (End of Phase A)

- ✅ All 63 algorithms implemented
- ✅ 50+ palettes available
- ✅ Pipeline system complete
- ✅ Tauri commands working
- ✅ All tests passing
- ✅ No algorithm produces panics or crashes
- ✅ Documentation on algorithm parameters

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

Frontend team can now call:
```javascript
await invoke('process_image', {
    imageBytes,
    algorithm: 'Floyd-Steinberg',
    paletteName: 'GameBoy',
    intensity: 100,
})
```

---

## Handoff to Phase B

Once Phase A is complete:
- React team has stable Tauri command API
- All algorithms tested
- Performance baseline established
- Ready to build UI layer (PipelinePanel, etc.)

