# Architecture Enhancements: Prioritization & Implementation Roadmap

**Last Updated**: 2026-04-27  
**Status**: Planning Phase

---

## Executive Summary

Based on user requirements, this document prioritizes architectural improvements across **Core Engine**, **Algorithms**, **Video Processing**, and **Export** categories. Total scope: **63 algorithms + video + SVG + advanced color**.

---

## Priority Tiers

### 🔴 CRITICAL (Phase A, Week 1-4 - MUST DO)

These block quality output and UI responsiveness:

| Component | Impact | Effort | Week |
|-----------|--------|--------|------|
| **Oklab/CIELAB Color Space** | 🔥 Fixes color banding in ALL dithering | 3 days | Week 1 |
| **Pipeline Caching** | 🔥 Enables instant UI preview on param change | 2 days | Week 1 |
| **FrameContext Module** | 🔥 Required for animated effects + video | 1 day | Week 1 |
| **10 Error Diffusion Algorithms** | ✅ DONE | - | Week 1 |
| **5 Ordered Dithering Algorithms** | Baseline quality | 3 days | Week 2 |
| **Fast Gaussian Blur** | Needed for Bloom/Glow effects | 2 days | Week 2 |
| **Pattern Dithering (6)** | Creative effects | 4 days | Week 2 |
| **Glitch Effects (17)** | Procedural, fun | 5 days | Week 3 |
| **Special Effects (16)** | Artistic filters | 5 days | Week 3 |
| **Color Quantization (3 methods)** | Enables auto-palette | 3 days | Week 4 |
| **Palette Export/Import** | UX requirement | 2 days | Week 4 |
| **Tauri Command API** | Backend-frontend bridge | 2 days | Week 4 |

**Total Phase A**: 4 weeks (as planned) ✅

---

### 🟠 HIGH PRIORITY (Phase B-C - SHOULD DO)

These unlock major features:

| Component | Impact | Effort | Timeline |
|-----------|--------|--------|----------|
| **Blue Noise Dithering** | Modern, smooth results (competitive feature) | 1 week | Phase B |
| **CRT/LCD Emulation** | Retro appeal (subpixel + scanlines) | 3 days | Phase B |
| **SVG Vector Export** | Unique feature, user requests | 1 week | Phase C |
| **Image Upscaling (2-8x)** | Print quality, crisp pixels | 2 days | Phase C |
| **FFmpeg Integration** | Video processing foundation | 1 week | Phase C |
| **Batch Frame Processing** | Parallel video rendering | 1 week | Phase C |
| **Video Export (MP4/GIF)** | Deliverable format | 3 days | Phase C |

**Estimated**: 4-5 weeks after Phase A

---

### 🟡 MEDIUM PRIORITY (Phase D-E - NICE TO HAVE)

These enhance but don't block MVP:

| Component | Impact | Effort | Timeline |
|-----------|--------|--------|----------|
| **Median Cut Quantization** | Better palette extraction | 2 days | Defer |
| **Palette Format Support** (.ase, .gpl, .pal, .act) | Creator workflows | 3 days | Defer |
| **Live Preview Streaming** | Responsive video feedback | 2 days | Defer |
| **Advanced Blur Modes** (Bokeh, motion) | Artistic depth | 1 week | Defer |
| **Temporal Effects** | Frame-aware animations | 1 week | Defer |

---

## Critical Path for MVP

```
Phase A (Weeks 1-4)
├─ Week 1: ✅ Color Space + Caching + Context + 10 ED algorithms
├─ Week 2: Ordered (5) + Patterns (6) + Gaussian Blur
├─ Week 3: Glitch (17) + Special (16)
└─ Week 4: Color quantization + Palette export + Commands

Phase B (Weeks 5-6)
├─ PipelinePanel UI (drag, enable/disable)
├─ Blue Noise + CRT/LCD (2 ordered + 2 special)
└─ Integration tests with Tauri

Phase C (Weeks 7-10)
├─ FFmpeg integration
├─ Batch processor (parallel)
├─ Video export (MP4/GIF)
├─ SVG export
└─ Upscaling

Phase D (Weeks 11+)
├─ Live preview streaming
├─ Advanced palette formats
└─ Temporal effects
```

---

## Implementation Guide: Week-by-Week

### ✅ COMPLETED
- **Week 1 (Phase A)**: All 10 error diffusion algorithms compiled and tested

### 🔄 IN PROGRESS  
- **Next**: Oklab color space + pipeline caching integration

---

## Oklab Implementation Details

### Why Oklab Over RGB?
- **RGB space**: Distances don't match human perception (green feels closer than it is)
- **Oklab**: Perceptually uniform, dithering produces cleaner colors
- **Example**: Dithering from red to blue in RGB looks muddy; in Oklab looks clean

### Integration Points
1. **Color selection** (finding closest palette color):
   ```rust
   // OLD (RGB): sqrt((r-r')² + (g-g')² + (b-b')²)
   // NEW (Oklab):
   let oklab1 = rgb_to_oklab(r, g, b);
   let oklab2 = rgb_to_oklab(r', g', b');
   sqrt((L-L')² + (a-a')² + (b-b')²) // Perceptual distance
   let [r_new, g_new, b_new] = oklab_to_rgb(oklab2);
   ```

2. **Error diffusion** (distributing quantization error):
   ```rust
   // Calculate error in Oklab space
   let error_oklab = subtract_oklab(oklab_old, oklab_new);
   // Distribute to neighbors in Oklab
   // Convert back to RGB for pixel storage
   ```

### Cargo.rs Changes
```toml
# Add to Cargo.toml
[dependencies]
oklab = "1.0"  # Or inline the math (it's simple)
ndarray = "0.15"
```

**Estimated**: 2-3 days (mostly integration, math is straightforward)

---

## Pipeline Caching Architecture

### The Problem
- User adjusts "Scanlines intensity" on layer 10 of 10
- Current code: rerun all 9 previous layers (wasted compute)

### The Solution
```
Layer 0 → [Cached Result 0] ✓
Layer 1 → [Cached Result 1] ✓
Layer 2 → [Cached Result 2] ✓
Layer 3 → [Cached Result 3] ← Start here when Layer 3 param changes
...
Layer 10 → [Final]
```

### Changes to `PipelineWithCache`
```rust
pub fn execute_from_layer(
    &mut self,
    start_layer: usize,  // User changed layer 3, skip 0-2
    ctx: &FrameContext,
) -> Result<ImageData, String> {
    // Load cached result from start_layer-1
    let mut current = self.cache[start_layer - 1].clone();
    
    // Run only layers [start_layer..end]
    for effect in &self.effects[start_layer..] {
        effect.apply(&mut current, ctx)?;
    }
    
    Ok(current)
}
```

**Frontend will call**:
```javascript
// User changes parameter on layer 3
await invoke('apply_pipeline_from_layer', {
    imageBytes: cache[2],  // Load cached result from layer 2
    startLayer: 3,
    algorithmSettings: {...}
});
```

**Estimated**: 1-2 days

---

## FrameContext Module

### Purpose
Animated dithering, temporal coherence, procedural generation

### Structure
```rust
pub struct FrameContext {
    pub seed: u64,           // Deterministic randomness
    pub frame_index: u32,    // Which frame in video
    pub time_seconds: f32,   // For animations
    pub total_frames: u32,   // For normalization
}

impl FrameContext {
    pub fn new(frame_index: u32, total_frames: u32) -> Self {
        Self {
            seed: frame_index as u64 * 2654435761, // Hash function
            frame_index,
            time_seconds: frame_index as f32 / 30.0,
            total_frames,
        }
    }
}
```

### Usage in Algorithms
```rust
// Glitch effect using deterministic randomness
impl Effect for ColorShift {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let mut rng = StdRng::seed_from_u64(ctx.seed);
        
        // Each frame gets different (but reproducible) glitch
        for pixel in image.data.chunks_mut(4) {
            if rng.gen::<f32>() < 0.01 {
                pixel[0] = pixel[0].wrapping_add(rng.gen::<u8>());
            }
        }
        Ok(())
    }
}

// Animated scanlines
impl Effect for Scanlines {
    fn apply(&self, image: &mut ImageData, ctx: &FrameContext) -> Result<(), String> {
        let phase = (ctx.time_seconds * 10.0) % 1.0; // Animates over 100ms
        
        for y in 0..image.height {
            let line_phase = ((y as f32 + phase * image.height as f32) % 2.0) > 1.0;
            // Darken every other line, phase shifts with time
        }
        Ok(())
    }
}
```

**Estimated**: 1 day

---

## Full Architecture Post-Phase A

```
src-tauri/src/
├── image_engine/
│   ├── mod.rs                          # AlgorithmRegistry
│   ├── types.rs                        # ImageData, Effect trait, FrameContext
│   ├── context.rs                      # FrameContext implementation
│   ├── pipeline.rs                     # PipelineWithCache with caching
│   ├── color/
│   │   ├── mod.rs
│   │   ├── color_space.rs             # Oklab conversion
│   │   ├── quantize.rs                # Median Cut, K-Means, Octree
│   │   └── palette.rs                 # 50+ presets
│   ├── effects/
│   │   ├── blur.rs                    # Fast Gaussian Blur
│   │   ├── dither/
│   │   │   ├── error_diffusion.rs     # 10 algorithms
│   │   │   ├── ordered.rs             # 5-7 algorithms
│   │   │   ├── pattern.rs             # 6-8 algorithms
│   │   │   ├── glitch.rs              # 17 algorithms
│   │   │   └── special.rs             # 16 algorithms
│   │   └── crt.rs                     # CRT/LCD emulation (2)
│   ├── export/
│   │   ├── svg.rs                     # SVG vector export
│   │   └── upscale.rs                 # 2-8x upscaling
│   └── video/
│       ├── decoder.rs                 # FFmpeg frame extraction
│       ├── encoder.rs                 # FFmpeg video assembly
│       └── processor.rs               # Batch parallel processing
├── commands/
│   ├── image.rs                       # Image processing commands
│   ├── video.rs                       # Video processing (async jobs)
│   └── palette.rs                     # Palette operations
└── lib.rs                             # Facade

Tauri Commands (Phase A):
├─ process_image (with FrameContext)
├─ list_algorithms
├─ list_palettes
├─ extract_palette (Median Cut, K-Means, Octree)
├─ export_palette (.ase, .gpl, .pal, .act, .txt)
├─ export_svg
└─ upscale_image

Tauri Commands (Phase C):
├─ process_video_start (async job)
├─ get_video_progress
└─ stream_preview_frames (real-time)
```

---

## Risk Mitigation

### Risk 1: Oklab math bugs
- **Mitigation**: Use battle-tested `oklab` crate vs. reimplementing
- **Fallback**: Keep RGB mode as option

### Risk 2: FFmpeg dependency complexity
- **Mitigation**: Use `ffmpeg-next` wrapper (not raw FFmpeg)
- **Fallback**: Shell out to `ffmpeg` binary

### Risk 3: Memory usage with video (4K = large)
- **Mitigation**: Stream frames, don't load all at once
- **Fallback**: Reduce resolution for preview

### Risk 4: Performance parallelization
- **Mitigation**: Benchmark with rayon thread pools
- **Fallback**: Sequential processing as baseline

---

## Success Metrics

### Phase A (End of Week 4)
- ✅ Oklab dithering visibly superior to RGB
- ✅ UI responsive (<200ms for param changes on 10-layer stack)
- ✅ All 63 algorithms compile & pass tests
- ✅ Benchmark: 1024x1024 image @ 30ms with 8-layer pipeline

### Phase B (End of Week 6)
- ✅ Frontend can reorder effects
- ✅ Live layer caching working
- ✅ Blue Noise looks competitive with industry tools

### Phase C (End of Week 10)
- ✅ 30-second video @ 1080p30 processes in <5 minutes
- ✅ SVG export file size <2MB for typical image
- ✅ GIF loops smoothly with temporal coherence

---

## Next Actions (Starting Tomorrow)

1. **Read this doc** into memory for reference
2. **Day 1-3**: Implement Oklab + integrate into error diffusion tests
3. **Day 4-5**: Add PipelineWithCache caching logic
4. **Day 6-7**: Add FrameContext to all algorithms
5. **Day 8-14**: Implement Week 2 algorithms (ordered + pattern + blur)
6. **Week 3**: Glitch + Special effects
7. **Week 4**: Color quantization + Tauri commands

---

## Questions to Resolve

- [ ] Use `oklab` crate or inline math?
- [ ] Maximum pipeline layers (10, 20, 50)?
- [ ] Video resolution: support 4K or cap at 1080p?
- [ ] Palette import: need .ase support or .gpl sufficient?
- [ ] SVG export: prioritize file size or features?
