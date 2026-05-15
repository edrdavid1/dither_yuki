// TypeScript interfaces mirroring the Rust DyprojManifest types.
// Keep in sync with src-tauri/src/project/types.rs

import type { LayerTrack as VideoLayerTrack } from "@/lib/videoRuntime/layerTracks";

export type StorageMode = "embedded" | "external" | "auto";

export interface Keyframe {
  frame: number;
  value: unknown;
  easing: string;
}

export interface AnimationTrack {
  id: string;
  layerId: string;
  parameter: string;
  keyframes: Keyframe[];
}

export interface AnimationData {
  durationFrames: number;
  fps: number;
  tracks: AnimationTrack[];
}

export interface Layer {
  id: string;
  name: string;
  enabled: boolean;
  algorithm: string;
  intensity: number;
  params: Record<string, unknown>;
  paletteId: string | null;
  order: number;
}

export interface Palette {
  id: string;
  name: string;
  /** RGB triplets */
  colors: [number, number, number][];
}

export interface AssetRecord {
  id: string;
  name: string;
  assetType: string;
  storage: StorageMode;
  originalPath: string | null;
  hash: string | null;
  sizeBytes: number;
  offline: boolean;
}

export interface DyprojManifest {
  /** Format version, e.g. "1.0". Required. */
  version: string;
  /** UUID v4 project identifier. */
  id: string;
  createdAt: string;
  modifiedAt: string;
  name: string;
  description?: string | null;
  layers: Layer[];
  palettes: Palette[];
  assets: AssetRecord[];
  animation?: AnimationData | null;
  videoLayerTracks: VideoLayerTrack[];
  videoAssetPath?: string | null;
}

export interface LoadProjectResult {
  manifest: DyprojManifest;
  timelineData: number[] | null;
  offlineAssets: string[];
}
