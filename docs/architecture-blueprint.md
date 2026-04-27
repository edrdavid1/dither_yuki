# Dither Yuki: Architecture & Scaling Blueprint

**Version**: 1.0  
**Status**: Design Document  
**Approach**: Redesign from ground-up, Rust-first backend

---

## Executive Summary

We're building a professional, standalone dithering application with video support, 63+ algorithms, and advanced effects. The architecture is **backend-heavy (Rust)** for performance, **frontend-light (React/Tauri)** for UX, with clear separation of concerns.

## Part 1: System Architecture

### 1.1 High-Level Layers

```
┌─────────────────────────────────────────┐
│   React Frontend (Vite)                 │
│   - UI state (effects, params)          │
│   - Timeline editor                     │
│   - Live preview (proxy)                │
│   - Export dialog                       │
└────────────┬────────────────────────────┘
             │ Tauri IPC (JSON + binary)
             ▼
┌─────────────────────────────────────────┐
│   Tauri Desktop Bridge                  │
│   - Invoke (async request/response)     │
│   - Listen (streaming events)           │
│   - File I/O (image, video, export)     │
└────────────┬────────────────────────────┘
             │ Rust FFI
             ▼
┌─────────────────────────────────────────┐
│   Rust Backend (Tokio async)            │
│                                         │
│   [Image Engine]                        │
│   - Core pixel processing               │
│   - All 63 algorithms                   │
│   - Pipeline execution                  │
│                                         │
│   [Video Engine]                        │
│   - FFmpeg wrapper (frame extract)      │
│   - Frame queue processing              │
│   - Async render task manager           │
│                                         │
│   [Data/State]                          │
│   - Project serialization               │
│   - Preset management                   │
│   - Cache layer                         │
│                                         │
└─────────────────────────────────────────┘
```

### 1.2 Data Flow (Single Image Processing)

```
User sets param (React)
         │
         ▼
[State update + preview toggle]
         │
         ▼
Tauri: invoke "process_image"
  + settings (algorithm, params)
  + image data (binary)
         │
         ▼
Rust: process_image_pipeline()
  + Load settings into Effect structs
  + Execute chain: blur → adjust → dither → ...
  + Measure timing per effect
  + Return processed ImageData + metadata
         │
         ▼
React: update preview + status bar
```

### 1.3 Data Flow (Video Batch Processing)

```
User selects video + settings (React)
         │
         ▼
Tauri: invoke "video_render_start"
  + video path, settings, output codec
         │
         ▼
Rust: video_render_task()
  + FFmpeg: extract frames to temp dir
  + Spawn thread pool (N workers)
  + Queue task: process_frame(frame_n, settings)
  + Listen loop: send progress events
         │
         ▼ (async events via Tauri listen)
React: update progress bar, ETA
         │
         ▼
[On complete or cancel]
Rust: cleanup temp files + return result
         │
         ▼
React: show export dialog
```

---

## Part 2: Backend Architecture (Rust)

### 2.1 Core Image Engine

**Module structure:**

```
src-tauri/src/
├── image_engine/
│   ├── mod.rs                 # Main API
│   ├── effects/
│   │   ├── mod.rs
│   │   ├── blur.rs
│   │   ├── adjust.rs
│   │   ├── dither/
│   │   │   ├── mod.rs
│   │   │   ├── error_diffusion.rs    (Floyd-Steinberg, etc.)
│   │   │   ├── ordered.rs            (Bayer, etc.)
│   │   │   ├── pattern.rs
│   │   │   ├── glitch.rs
│   │   │   └── special.rs
│   │   └── ...
│   ├── pipeline.rs            # Effect chain execution
│   ├── color/
│   │   ├── palette.rs         # Palette management + auto-extraction
│   │   └── quantize.rs        # K-means, median cut
│   └── types.rs               # ImageData wrapper, Effect trait
├── video_engine/
│   ├── mod.rs
│   ├── ffmpeg.rs              # FFmpeg process management
│   ├── frame_queue.rs         # Task queue for frames
│   └── encoder.rs             # Output video assembly
├── presets/
│   ├── mod.rs
│   └── storage.rs
└── commands/                   # Tauri commands
    ├── image.rs               # process_image, etc.
    ├── video.rs               # video_render_start, etc.
    └── preset.rs              # save_preset, list_presets
```

### 2.2 Key Types

```rust
// Effect trait - all effects implement this
pub trait Effect: Send + Sync {
    fn apply(&self, image: &mut ImageData) -> Result<()>;
    fn name(&self) -> &str;
}

// Pipeline: ordered list of effects
pub struct ImagePipeline {
    effects: Vec<Box<dyn Effect>>,
    settings: PipelineSettings,
}

// Project state (serialized to JSON)
pub struct Project {
    name: String,
    created_at: DateTime<Utc>,
    pipeline: ImagePipeline,
    export_settings: ExportSettings,
    presets: Vec<PipelinePreset>,
}

// Streaming render task
pub struct RenderTask {
    id: Uuid,
    video_path: PathBuf,
    frame_count: u32,
    processed: u32,
    status: RenderStatus,
}
```

### 2.3 Performance Patterns

1. **Thread Pool**: Use `rayon` or `tokio::task_spawn_blocking` for CPU-heavy tasks
2. **Caching**: Cache intermediate stages when params don't change
3. **SIMD**: Use `packed_simd` or `simdnoise` for blur, noise
4. **Memory**: Pre-allocate buffers, reuse ImageData structs where possible

---

## Part 3: Frontend Architecture (React)

### 3.1 State Structure

```javascript
// Global state (Zustand or Redux)
type AppState = {
  currentProject: Project;
  
  // UI state
  previewMode: 'before' | 'after';
  zoomLevel: number;
  
  // Pipeline state
  pipeline: PipelineEffect[];
  
  // Video state
  videoRenderTasks: RenderTask[];
  
  // Timeline state (future)
  currentFrame: number;
  timeline: TimelineTrack[];
};
```

### 3.2 Component Hierarchy

```
App
├── MenuBar
├── Toolbar
├── MainLayout
│   ├── LeftPanel
│   │   ├── PipelinePanel (NEW)
│   │   │   ├── EffectList (reorderable)
│   │   │   ├── EffectControls (per-effect params)
│   │   │   └── AddEffectButton
│   │   └── PreviewSettings
│   ├── CenterPanel
│   │   └── PreviewCanvas
│   │       ├── ImageDisplay
│   │       ├── BeforeAfterToggle
│   │       └── ZoomControls
│   └── RightPanel (future)
│       └── TimelineEditor
├── StatusBar
└── Modals
    ├── PaletteEditor
    ├── ExportDialog
    ├── VideoRenderProgress
    └── PresetManager
```

### 3.3 Tauri Commands (IPC API)

```rust
// Image commands
#[tauri::command]
async fn process_image(
    image_data: Vec<u8>,
    settings: ProcessSettings,
) -> Result<ProcessResult>

#[tauri::command]
async fn extract_palette(
    image_data: Vec<u8>,
    color_count: u32,
) -> Result<Vec<Color>>

// Video commands
#[tauri::command]
async fn video_render_start(
    video_path: String,
    settings: ProcessSettings,
    output_path: String,
) -> Result<Uuid>

#[tauri::command]
async fn video_render_cancel(task_id: Uuid) -> Result<()>

// Preset commands
#[tauri::command]
async fn save_preset(preset: PipelinePreset) -> Result<()>

#[tauri::command]
async fn list_presets() -> Result<Vec<PipelinePreset>>
```

---

## Part 4: Roadmap (Phased Delivery)

### Phase A: Backend Foundation (Weeks 1–4)

**Goal**: Solid Rust engine for all algorithms

**Tasks**:
1. Refactor `src-tauri/src/` with new module structure
2. Implement `Effect` trait + all 63 algorithms
   - Error diffusion (Floyd-Steinberg, Sierra, Jarvis, etc.)
   - Ordered (Bayer 2x2, 4x4, 8x8, etc.)
   - Pattern, Glitch, Special categories
3. Create `ImagePipeline` struct + execution engine
4. Add color quantization (K-means, median cut) for palette extraction
5. Tauri commands: `process_image`, `extract_palette`
6. Unit tests for all algorithms (deterministic modes)

**Deliverable**: Rust library ready for image processing + Tauri command API

**Time**: 3–4 weeks (depending on algorithm complexity)

---

### Phase B: Frontend Refactor (Weeks 5–7)

**Goal**: UI for stackable pipeline + existing features

**Tasks**:
1. Create `PipelinePanel` component (enable/disable, reorder)
2. Refactor `Index.tsx` to use new pipeline state
3. Create `EffectControls` (dynamic param UI per effect)
4. Update `PresetManager` to save/load full pipelines
5. Add algorithm category filtering + preview
6. Test integration with Rust backend via Tauri

**Deliverable**: Desktop app with full stackable effect UI

**Time**: 2–3 weeks

---

### Phase C: Performance & Optimization (Weeks 8–9)

**Goal**: Real-time preview without UI freeze

**Tasks**:
1. Implement Web Worker for canvas rendering (React side)
2. Add debounce/throttle on slider changes (300ms)
3. Implement frame caching in Rust (LRU cache for intermediate stages)
4. Profiling + benchmarks (measure per-effect timing)
5. Optimize hot paths (blur kernel, color distance, error diffusion)
6. Tauri invoke optimization (binary buffer encoding)

**Deliverable**: App handles 4K images without major UI lag

**Time**: 1–2 weeks

---

### Phase D: Video MVP (Weeks 10–15)

**Goal**: Basic video dithering (import, preview, export)

**Tasks**:
1. Integrate FFmpeg (via Tauri sidecar or system binary)
2. Implement `VideoEngine` in Rust:
   - Frame extraction to temp dir
   - Thread pool for parallel frame processing
   - Frame reassembly with H.264 encoder
3. Tauri commands: `video_render_start`, `video_render_cancel`, `video_render_progress`
4. React: `VideoRenderProgress` component + task management
5. Audio passthrough (copy audio stream unchanged)
6. Test with 1-2 min video clips @ 1080p/30fps

**Deliverable**: Import MP4 → dither → export dithered MP4

**Time**: 4–6 weeks (heavy FFmpeg integration)

---

### Phase E: Batch & Temporal (Weeks 16–20)

**Goal**: PNG sequences, timeline preview, animation effects

**Tasks**:
1. Batch PNG processing (queue images → render all → zip)
2. Timeline UI (scrub, keyframes, preview low-res)
3. Temporal Variation effects (9 modes of animated dither)
4. Keyframe interpolation for effect parameters
5. Export animated GIF / MP4 with effects over time

**Deliverable**: Create pixel-art animations from dithering

**Time**: 4–5 weeks

---

### Phase F: Advanced Exports (Weeks 21–23)

**Goal**: SVG + True PNG + polish

**Tasks**:
1. SVG export (trace dithered regions → vectorize for compatible modes)
2. True PNG support (alpha channel + color accuracy)
3. Export profiles (preset compression, color space)
4. Quality assurance + edge case fixes

**Deliverable**: Professional export capabilities

**Time**: 2–3 weeks

---

### Phase G: Finalization (Weeks 24–26)

**Goal**: Release v1.0

**Tasks**:
1. Full regression testing
2. Performance profiling on real user hardware
3. Documentation + user guide
4. Code cleanup + security audit
5. Build macOS + Windows releases
6. Create GitHub releases + DMG/EXE

**Deliverable**: v1.0 ready for public use

**Time**: 2–3 weeks

---

## Part 5: Dependency Matrix

```
Phase A (Backend)
    ↓
Phase B (Frontend) ← depends on A
    ↓
Phase C (Performance) ← depends on B
    ↓
Phase D (Video) ← depends on A + C
    ↓
Phase E (Batch/Temporal) ← depends on D
    ↓
Phase F (Advanced Exports) ← depends on E
    ↓
Phase G (Release) ← depends on all
```

**Can parallelize:**
- Phase D can start once Phase A is ~80% done
- Phase C can refine during Phase B

---

## Part 6: Technical Debt & Considerations

### 6.1 Build System

- Ensure `src-tauri/Cargo.toml` has:
  - `image = "0.24"` (image I/O)
  - `rayon = "1.7"` (parallelism)
  - `tokio = "1.35"` (async runtime)
  - `serde_json = "1.0"` (state serialization)
  - `ffmpeg-sys` or shell out to system FFmpeg (video)

### 6.2 Testing Strategy

- Unit tests for every algorithm (deterministic seeds)
- Integration tests for pipeline (chain of 5+ effects)
- Benchmark suite (measure effect timing)
- Manual QA (visual inspection of dithered images)

### 6.3 Release & Distribution

- Tauri auto-updater for major releases
- Changelog per version
- Code signing (macOS) + notarization
- GitHub Actions CI/CD for building releases

### 6.4 Licensing

- Fair Creative License (FCL) 1.0 file header in all source
- No AI model usage (all procedural)

---

## Part 7: Success Metrics

| Metric | Target |
|--------|--------|
| Algorithms | 63 implemented + tested |
| Image size support | Up to 8K × 8K |
| Video fps (1080p) | 30+ fps processing (non-realtime preview ok) |
| Export time | <2 sec for 2K image |
| Build size | <150 MB (app + dependencies) |
| Startup time | <2 sec |
| CPU (single image) | <1 core @ 100% for 5 sec |
| Memory footprint | <500 MB for 4K image |

---

## Next Steps

1. **Week 1 action**: Start Phase A — set up Rust module structure + implement first 10 algorithms
2. **Weekly sync**: Review progress on roadmap
3. **Deployment**: Target v1.0 by end of Phase G (~6 months from start)

