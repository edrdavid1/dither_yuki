# Scaling Roadmap (Pipeline-First)

## Current status

- Dedicated branch: `feature/pipeline-foundation-v1`
- Pipeline foundation added under `src/core/pipeline/`
- `Index.tsx` now routes processing through pipeline engine

## Phase 1 — Stackable pipeline UI

1. Add effect list state (array of `PipelineEffect`) in app state
2. Create `PipelinePanel` component:
   - enable/disable effect
   - drag & drop reorder
   - per-effect parameter controls
3. Persist pipeline presets to localStorage

## Phase 2 — Performance baseline

1. Move `runImagePipeline` execution to Web Worker
2. Add debounced preview updates for slider changes
3. Add stage timing metrics (blur/adjust/dither/etc.)
4. Cache intermediate stages for unchanged upstream effects

## Phase 3 — Algorithm expansion

1. Split algorithms into modules by category
2. Implement registry-based algorithm catalog
3. Add metadata per algorithm: category, params, default values
4. Add validation tests for output dimensions and deterministic modes

## Phase 4 — Video MVP (desktop)

1. Add FFmpeg-based frame extraction and assembly in Tauri layer
2. Apply pipeline per frame with progress and cancellation
3. Add low-res proxy preview for timeline clips
4. Export MP4 with preserved audio stream

## Phase 5 — Advanced exports

1. True PNG with alpha-safe output path
2. SVG export mode for compatible ordered/pattern algorithms
3. Batch processing for PNG sequences
