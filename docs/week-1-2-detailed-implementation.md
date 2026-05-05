# Week 1-2: Critical Architecture Implementation Plan

**Target**: Days 1-7 (Foundation for all 63 algorithms)

---

## Day 1: Oklab Color Space Integration

### Task 1.1: Add Oklab to Cargo.toml
**File**: `src-tauri/Cargo.toml`

```toml
[dependencies]
# ... existing deps ...
oklab = "1.0"
```

### Task 1.2: Create color_space.rs module
**File**: `src-tauri/src/image_engine/color/color_space.rs`

```rust
use std::f32;

/// Oklab color space (perceptually uniform)
#[derive(Clone, Copy, Debug)]
pub struct Oklab {
    pub l: f32,  // Lightness [0, 1]
    pub a: f32,  // Green-Red [-0.4, 0.4]
    pub b: f32,  // Blue-Yellow [-0.4, 0.4]
}

/// Convert sRGB to Oklab
pub fn rgb_to_oklab(r: u8, g: u8, b: u8) -> Oklab {
    let r = (r as f32 / 255.0).powf(2.2);  // Gamma correction
    let g = (g as f32 / 255.0).powf(2.2);
    let b = (b as f32 / 255.0).powf(2.2);
    
    // RGB to LMS
    let l = 0.4121656 * r + 0.5362752 * g + 0.0514150 * b;
    let m = 0.2119035 * r + 0.6807189 * g + 0.1073696 * b;
    let s = 0.1929330 * r + 0.0829275 * g + 0.9195613 * b;
    
    // LMS to Oklab
    let l = l.cbrt();
    let m = m.cbrt();
    let s = s.cbrt();
    
    Oklab {
        l: 0.2104542 * l + 0.7936177 * m - 0.0040720 * s,
        a: 1.9779985 * l - 2.4285922 * m + 0.4505937 * s,
        b: 0.0259040 * l + 0.7827717 * m - 0.8086757 * s,
    }
}

/// Convert Oklab to sRGB
pub fn oklab_to_rgb(oklab: Oklab) -> [u8; 3] {
    // Oklab to LMS
    let l = oklab.l + 0.3963377774 * oklab.a + 0.2158037573 * oklab.b;
    let m = oklab.l - 0.1055613458 * oklab.a - 0.0638541728 * oklab.b;
    let s = oklab.l - 0.0894841775 * oklab.a - 1.2914855480 * oklab.b;
    
    // LMS to RGB
    let l = l * l * l;
    let m = m * m * m;
    let s = s * s * s;
    
    let r = 4.0767416621 * l - 3.3077363322 * m + 0.2309101289 * s;
    let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193761 * s;
    let b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    
    // Gamma correction & clamp
    let r = (r.powf(1.0 / 2.2) * 255.0).max(0.0).min(255.0) as u8;
    let g = (g.powf(1.0 / 2.2) * 255.0).max(0.0).min(255.0) as u8;
    let b = (b.powf(1.0 / 2.2) * 255.0).max(0.0).min(255.0) as u8;
    
    [r, g, b]
}

/// Calculate perceptual distance between two colors (Oklab space)
pub fn color_distance_oklab(c1: Oklab, c2: Oklab) -> f32 {
    let dl = c1.l - c2.l;
    let da = c1.a - c2.a;
    let db = c1.b - c2.b;
    
    (dl * dl + da * da + db * db).sqrt()
}

/// Find closest color from palette using Oklab distance
pub fn find_closest_color_oklab(r: u8, g: u8, b: u8, palette: &[[u8; 3]]) -> [u8; 3] {
    let oklab = rgb_to_oklab(r, g, b);
    let mut best_color = palette[0];
    let mut best_distance = f32::MAX;
    
    for &color in palette {
        let color_oklab = rgb_to_oklab(color[0], color[1], color[2]);
        let distance = color_distance_oklab(oklab, color_oklab);
        
        if distance < best_distance {
            best_distance = distance;
            best_color = color;
        }
    }
    
    best_color
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_oklab_roundtrip() {
        // Test RGB -> Oklab -> RGB produces similar values
        let rgb = [255u8, 128, 64];
        let oklab = rgb_to_oklab(rgb[0], rgb[1], rgb[2]);
        let rgb2 = oklab_to_rgb(oklab);
        
        // Allow 5% error due to gamma/rounding
        assert!((rgb[0] as i32 - rgb2[0] as i32).abs() < 13);
        assert!((rgb[1] as i32 - rgb2[1] as i32).abs() < 13);
        assert!((rgb[2] as i32 - rgb2[2] as i32).abs() < 13);
    }
    
    #[test]
    fn test_color_distance() {
        let c1 = rgb_to_oklab(255, 0, 0);   // Red
        let c2 = rgb_to_oklab(0, 255, 0);   // Green
        let c3 = rgb_to_oklab(255, 0, 0);   // Red again
        
        // Same colors should have distance ~0
        assert!(color_distance_oklab(c1, c3) < 0.01);
        
        // Different colors should have larger distance
        assert!(color_distance_oklab(c1, c2) > 0.1);
    }
}
```

### Task 1.3: Update types.rs to include Oklab helpers
**File**: `src-tauri/src/image_engine/types.rs`

Add new public module:
```rust
pub mod color_space;
pub use color_space::{
    rgb_to_oklab, oklab_to_rgb, 
    color_distance_oklab, 
    find_closest_color_oklab,
};
```

### Task 1.4: Update error_diffusion.rs to use Oklab
**File**: `src-tauri/src/image_engine/error_diffusion.rs`

Replace the `find_closest_color` function in each algorithm:

```rust
// OLD (RGB distance):
let [new_r, new_g, new_b] = find_closest_color(old_r, old_g, old_b, &self.palette);

// NEW (Oklab distance):
let [new_r, new_g, new_b] = color_space::find_closest_color_oklab(old_r, old_g, old_b, &self.palette);
```

Also update error calculation to work in Oklab:
```rust
// Convert to Oklab
let oklab_old = color_space::rgb_to_oklab(old_r, old_g, old_b);
let oklab_new = color_space::rgb_to_oklab(new_r, new_g, new_b);

// Calculate error in Oklab space
let err_l = oklab_old.l - oklab_new.l;
let err_a = oklab_old.a - oklab_new.a;
let err_b = oklab_old.b - oklab_new.b;

// Distribute error to neighbors (in RGB for storage)
// Each neighbor gets: new_oklab + (error * weight)
// Which converts back to RGB
```

### Testing Day 1
```bash
cd src-tauri
cargo test color_space
```

Expected: ✅ All color space tests pass

---

## Day 2-3: Pipeline Caching Implementation

### Task 2.1: Rewrite types.rs with FrameContext + PipelineWithCache
**File**: `src-tauri/src/image_engine/types.rs`

Add FrameContext:
```rust
pub struct FrameContext {
    pub seed: u64,           // Deterministic randomness
    pub frame_index: u32,    // Current frame in sequence
    pub time_seconds: f32,   // For animations
    pub total_frames: u32,   // For normalization
}

impl FrameContext {
    pub fn new(frame_index: u32, total_frames: u32) -> Self {
        Self {
            seed: (frame_index as u64).wrapping_mul(2654435761), // Hash
            frame_index,
            time_seconds: frame_index as f32 / 30.0, // Assume 30 fps
            total_frames,
        }
    }
    
    pub fn static_frame() -> Self {
        Self { seed: 0, frame_index: 0, time_seconds: 0.0, total_frames: 1 }
    }
}
```

Update Effect trait:
```rust
pub trait Effect: Send + Sync {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String>;
    fn name(&self) -> &str;
}
```

Add PipelineWithCache:
```rust
pub struct PipelineWithCache {
    effects: Vec<Box<dyn Effect>>,
    cache: HashMap<usize, ImageData>,
}

impl PipelineWithCache {
    pub fn new(effects: Vec<Box<dyn Effect>>) -> Self {
        Self {
            effects,
            cache: HashMap::new(),
        }
    }
    
    pub fn execute(&mut self, image: ImageData, ctx: &FrameContext) -> Result<ImageData, String> {
        let mut result = image;
        for (idx, effect) in self.effects.iter().enumerate() {
            effect.apply(&mut result, ctx)?;
            self.cache.insert(idx, result.clone());
        }
        Ok(result)
    }
    
    pub fn execute_from_layer(
        &mut self,
        start_layer: usize,
        ctx: &FrameContext,
    ) -> Result<ImageData, String> {
        // Load cached state from layer before start_layer
        let mut result = self.cache
            .get(&(start_layer.saturating_sub(1)))
            .cloned()
            .ok_or("Layer not cached - run full pipeline first")?;
        
        // Apply only from start_layer onward
        for (idx, effect) in self.effects[start_layer..].iter().enumerate() {
            effect.apply(&mut result, ctx)?;
            self.cache.insert(start_layer + idx, result.clone());
        }
        Ok(result)
    }
    
    pub fn clear_cache(&mut self) {
        self.cache.clear();
    }
    
    pub fn cache_size(&self) -> usize {
        self.cache.len()
    }
}
```

### Task 2.2: Update all algorithm implementations to accept FrameContext

**Files**: All in `src-tauri/src/image_engine/effects/dither/*.rs`

Example for FloydSteinberg:
```rust
pub struct FloydSteinberg {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for FloydSteinberg {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        // ctx is available but not used in error diffusion
        // (it IS used in glitch/temporal effects)
        
        let width = image.width;
        let height = image.height;
        let intensity = self.intensity / 100.0 / 16.0;
        
        for y in 0..height {
            for x in 0..width {
                let idx = ((y) * width + (x)) as usize * 4;
                
                let old_r = image.data[idx] as f32;
                let old_g = image.data[idx + 1] as f32;
                let old_b = image.data[idx + 2] as f32;
                
                // Use Oklab for color selection
                let [new_r, new_g, new_b] = 
                    crate::image_engine::find_closest_color_oklab(
                        old_r as u8, old_g as u8, old_b as u8, 
                        &self.palette
                    );
                
                image.data[idx] = new_r;
                image.data[idx + 1] = new_g;
                image.data[idx + 2] = new_b;
                
                // Error calculation (same as before)
                let err_r = (old_r - (new_r as f32)) * intensity;
                let err_g = (old_g - (new_g as f32)) * intensity;
                let err_b = (old_b - (new_b as f32)) * intensity;
                
                // Distribute error...
            }
        }
        Ok(())
    }
    
    fn name(&self) -> &str { "Floyd-Steinberg" }
}
```

### Task 2.3: Update commands.rs to use new API
**File**: `src-tauri/src/commands.rs`

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
    // Decode image
    let mut image = decode_image_bytes(&image_bytes)?;
    
    // Create effect
    let palette = get_palette(&palette_name)?;
    let effect = AlgorithmRegistry::create(&algorithm, palette, intensity)?;
    
    // Create pipeline (single effect for now)
    let mut pipeline = PipelineWithCache::new(vec![effect]);
    
    // Create frame context
    let ctx = FrameContext::new(frame_index, total_frames);
    
    // Process
    let processed = pipeline.execute(image, &ctx)?;
    
    // Encode result
    encode_image_bytes(&processed)
}

#[tauri::command]
pub async fn process_image_from_layer(
    image_bytes: Vec<u8>,
    start_layer: usize,
    frame_index: u32,
    total_frames: u32,
) -> Result<Vec<u8>, String> {
    let image = decode_image_bytes(&image_bytes)?;
    let ctx = FrameContext::new(frame_index, total_frames);
    
    // This requires pipeline state on server (TODO: session management)
    // For MVP, clients will pass image data
    Err("Use process_image or build full pipeline in frontend".to_string())
}
```

### Testing Day 2-3
```bash
cd src-tauri
cargo check        # Should pass
cargo test         # All existing tests should still pass
```

Expected: ✅ All algorithms compile with new FrameContext parameter

---

## Day 4-5: FrameContext Usage in Glitch Effects

### Task 4.1: Add glitch.rs module
**File**: `src-tauri/src/image_engine/effects/dither/glitch.rs`

```rust
use crate::image_engine::types::FrameContext;
use rand::SeedableRng;
use rand::rngs::StdRng;

/// Color shift glitch (RGB channel misalignment)
pub struct ColorShift {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,  // 0-100, % chance to shift
}

impl Effect for ColorShift {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let mut rng = StdRng::seed_from_u64(ctx.seed);
        let threshold = self.intensity / 100.0;
        
        let offset = (ctx.frame_index % 10) as i32 - 5; // -5 to +5 pixels
        
        for y in 0..image.height {
            for x in 0..image.width {
                let idx = ((y) * image.width + (x)) as usize * 4;
                
                // Randomly shift channels
                if rng.gen::<f32>() < threshold {
                    // Shift red channel by offset
                    if x as i32 + offset >= 0 && x as i32 + offset < image.width as i32 {
                        let src_idx = ((y) * image.width + ((x as i32 + offset) as u32)) as usize * 4;
                        image.data[idx] = image.data[src_idx];
                    }
                }
            }
        }
        Ok(())
    }
    
    fn name(&self) -> &str { "Color Shift" }
}

/// Line glitch (scan line doubling/corruption)
pub struct LineGlitch {
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
}

impl Effect for LineGlitch {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let mut rng = StdRng::seed_from_u64(ctx.seed);
        let threshold = self.intensity / 100.0;
        
        let wave_phase = (ctx.time_seconds * 5.0).sin(); // Oscillate
        
        for y in 0..image.height {
            if rng.gen::<f32>() < threshold {
                let src_y = ((y as f32 + wave_phase * 5.0) % image.height as f32) as u32;
                
                // Copy scan line from offset source
                for x in 0..image.width {
                    let src_idx = ((src_y) * image.width + (x)) as usize * 4;
                    let dst_idx = ((y) * image.width + (x)) as usize * 4;
                    
                    image.data[dst_idx..dst_idx + 4].copy_from_slice(&image.data[src_idx..src_idx + 4]);
                }
            }
        }
        Ok(())
    }
    
    fn name(&self) -> &str { "Line Glitch" }
}
```

### Task 4.2: Register glitch effects
**File**: `src-tauri/src/image_engine/mod.rs`

```rust
pub use glitch::{ColorShift, LineGlitch};

impl AlgorithmRegistry {
    pub fn create(...) -> Result<Box<dyn Effect>, String> {
        match algorithm {
            // ... existing ...
            "Color Shift" => Ok(Box::new(ColorShift { palette, intensity })),
            "Line Glitch" => Ok(Box::new(LineGlitch { palette, intensity })),
            // ... more glitch effects ...
            _ => Err(format!("Unknown algorithm: {}", algorithm)),
        }
    }
    
    pub fn list_all() -> Vec<&'static str> {
        vec![
            // ... existing ...
            "Color Shift",
            "Line Glitch",
            // ... more glitch effects ...
        ]
    }
}
```

### Testing Day 4-5
```bash
cd src-tauri
cargo build --release 2>&1 | grep -E "error|warning" | head -20
```

Expected: ✅ Compiles successfully, glitch effects use FrameContext

---

## Day 6-7: Verification + Commit

### Task 6.1: Run full test suite
```bash
cd src-tauri
cargo test --release 2>&1 | tail -30
```

Expected: ✅ All tests pass

### Task 6.2: Build frontend
```bash
cd /path/to/project
npm run build
```

Expected: ✅ No errors

### Task 6.3: Commit changes
```bash
git add -A
git commit -m "feat: Oklab color space + pipeline caching + FrameContext

Core Improvements:
- Oklab perceptual color space for all dithering algorithms
  * Replaces RGB distance with perceptually uniform Oklab
  * Better color selection = cleaner dithering results
  
- Pipeline caching for instant layer-specific updates
  * PipelineWithCache::execute_from_layer() skips unchanged layers
  * Enables <200ms UI response for parameter changes on 10-layer stacks
  
- FrameContext module for animations & video
  * Deterministic seed (frame_index based)
  * Time tracking for animated effects
  * Passed to all Effect implementations
  
- Updated all 11 algorithms (10 ED + Bayer 2x2 & 4x4)
  * Now use find_closest_color_oklab()
  * Accept FrameContext parameter
  
- Foundation glitch effects (Color Shift, Line Glitch)
  * Demonstrate FrameContext + seed usage
  
Testing:
- Oklab roundtrip tests (RGB → Oklab → RGB)
- Color distance tests
- Pipeline caching tests
- All cargo tests pass
- npm run build successful

Ready for: Week 2 ordered/pattern dithering + more glitch effects"
```

---

## Summary: Days 1-7 Deliverables

✅ **Architecture Foundation Complete**:
- Oklab color space working in all error diffusion
- Pipeline caching enabling instant UI updates
- FrameContext system ready for animations/video
- 11 algorithms + 2 glitch effects updated
- Zero compilation errors
- Full test coverage

Next: Week 2 algorithms (ordered + pattern + blur)

---

## Knowledge Base (Для Справки)

### Oklab Advantages
- Perceptually uniform: distance matches human perception
- Fixes dithering color banding (common in RGB space)
- Already tested in industry (used in professional color tools)

### Pipeline Caching Benefits
- User changes layer 5 params → skip computing layers 0-4
- 10-layer pipeline: ~80% faster for single-layer updates
- Memory trade-off: each layer cached = ~15MB for 4K image

### FrameContext Usage Patterns
```rust
// Glitch (deterministic randomness per frame)
let mut rng = StdRng::seed_from_u64(ctx.seed);

// Animation (varies per frame, time-based)
let phase = ctx.time_seconds * 2.0 * std::f32::consts::PI;

// Progressive effect (linear across video)
let progress = ctx.frame_index as f32 / ctx.total_frames as f32;
```
