import { DEFAULT_FRAME_SETTINGS, type FrameSettings } from "./frameSettings";
import { mapLayersToBackendPayload, type LayerToBackendOptions } from "@/lib/layerMapping";

export type { ColorPalette, DitheringAlgorithm } from "@/utils/dithering";

export type LayerType = "image" | "generator" | "adjustment";
export type LayerBlendMode = "normal" | "multiply" | "screen" | "overlay" | "add";

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  blendMode: LayerBlendMode;
  opacity: number;
  settings: FrameSettings;
}

export interface BackendEffectLayerPayload {
  id: string;
  algorithm: string;
  enabled: boolean;
  intensity: number;
  blend_mode?: string;
  opacity?: number;
  palette_name?: string;
  palette?: [number, number, number][];
  contrast?: number;
  brightness?: number;
  saturation?: number;
  pixel_size?: number;
  blur?: number;
  sharpness?: number;
  noise?: number;
  glitch_type?: string;
  sort_by?: string;
  masking?: string;
  mask_target?: string;
  mask_feather?: number;
  threshold_min?: number;
  threshold_max?: number;
  direction_angle?: number;
  sort_length?: number;
  block_size?: number;
  chaos?: number;
  quantization?: number;
  red_shift_x?: number;
  red_shift_y?: number;
  green_shift_x?: number;
  green_shift_y?: number;
  blue_shift_x?: number;
  blue_shift_y?: number;
  global_rgb_shift_intensity?: number;
  slice_count?: number;
  max_offset?: number;
  randomness?: number;
  scanline_thickness?: number;
  scanline_gap?: number;
  flicker?: number;
  curvature?: number;
  snap_to_palette?: boolean;
  palette_mix?: number;
  global_seed?: number;
  // Channel Mask parameters
  mask_r?: boolean;
  mask_g?: boolean;
  mask_b?: boolean;
  mask_a?: boolean;
}

export function makeLayerId(): string {
  return `layer-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

export function makeLayer(partial?: Partial<Layer>): Layer {
  return {
    id: makeLayerId(),
    name: "Layer",
    type: "adjustment",
    visible: true,
    locked: false,
    blendMode: "normal",
    opacity: 100,
    settings: { ...DEFAULT_FRAME_SETTINGS, ...(partial?.settings ?? {}) },
    ...partial,
  };
}

export function cloneLayer(layer: Layer): Layer {
  return {
    ...layer,
    settings: { ...layer.settings },
  };
}

export function cloneLayers(layers: Layer[]): Layer[] {
  return layers.map((layer) => cloneLayer(layer));
}

/**
 * Canonical function to build backend payload from domain layers.
 * Uses pure mapper functions from @/lib/layerMapping with runtime validation.
 */
export function buildBackendLayersPayload(
  layers: Layer[],
  customPalette: [number, number, number][],
): BackendEffectLayerPayload[] {
  const options: LayerToBackendOptions = { customPalette };
  // Type assertion: validated payload matches BackendEffectLayerPayload structure
  return mapLayersToBackendPayload(layers, options) as BackendEffectLayerPayload[];
}

export function createDefaultLayer(name = "Layer", type: LayerType = "adjustment"): Layer {
  return makeLayer({ name, type });
}

/**
 * Default base layer used for new/open project bootstrap.
 * It renders source unchanged until the user explicitly enables an effect.
 */
export function createNeutralLayer(name = "1", type: LayerType = "adjustment"): Layer {
  return makeLayer({
    name,
    type,
    settings: {
      ...DEFAULT_FRAME_SETTINGS,
      algorithm: "None",
    },
  });
}
