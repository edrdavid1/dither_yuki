import { DEFAULT_FRAME_SETTINGS, type FrameSettings } from "./frameSettings";
import { getPaletteColors, normalizeColorPalette, normalizeDitheringAlgorithm } from "@/utils/dithering";

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

const FRONTEND_TO_BACKEND_PALETTE: Partial<Record<string, string>> = {
  Gameboy: "GameBoy",
  GameBoy: "GameBoy",
  C64: "Commodore 64",
  "Commodore 64": "Commodore 64",
};

export function toBackendPaletteName(palette: string): string {
  const normalized = normalizeColorPalette(palette);
  return FRONTEND_TO_BACKEND_PALETTE[normalized] ?? normalized;
}

export function buildBackendLayersPayload(
  layers: Layer[],
  customPalette: [number, number, number][],
): BackendEffectLayerPayload[] {
  const payload: BackendEffectLayerPayload[] = [];

  for (const layer of layers) {
    if (!layer.visible) continue;

    const s = layer.settings;
    const common: BackendEffectLayerPayload = {
      id: layer.id,
      algorithm: normalizeDitheringAlgorithm(String(s.algorithm ?? "Floyd-Steinberg")),
      enabled: layer.visible && !layer.locked,
      intensity: Number(s.intensity ?? 100),
      blend_mode: String(s.blendMode ?? layer.blendMode),
      opacity: Number((s.layerOpacity ?? layer.opacity) as number) / 100,
      contrast: Number(s.contrast ?? 100),
      brightness: Number(s.brightness ?? 100),
      saturation: Number(s.saturation ?? 100),
      pixel_size: Number(s.pixelSize ?? 1),
      blur: Number(s.blur ?? 0),
      sharpness: Number(s.sharpness ?? 0),
      noise: Number(s.noise ?? 0),
      glitch_type: String(s.glitchType ?? "None"),
      sort_by: String(s.pixelSortMetric ?? "luma"),
      masking: String(s.pixelSortMask ?? "all"),
      mask_target: String(s.maskTarget ?? "all"),
      mask_feather: Number(s.maskFeather ?? 0.2),
      threshold_min: Number(s.thresholdMin ?? 20),
      threshold_max: Number(s.thresholdMax ?? 80),
      direction_angle: Number(s.angle ?? 0),
      sort_length: Number(s.sortLength ?? 64),
      block_size: Number(s.blockSize ?? 16),
      chaos: Number(s.chaos ?? 40),
      quantization: Number(s.quantization ?? 45),
      red_shift_x: Number(s.redShiftX ?? 4),
      red_shift_y: Number(s.redShiftY ?? 0),
      green_shift_x: Number(s.greenShiftX ?? 0),
      green_shift_y: Number(s.greenShiftY ?? 0),
      blue_shift_x: Number(s.blueShiftX ?? -4),
      blue_shift_y: Number(s.blueShiftY ?? 0),
      global_rgb_shift_intensity: Number(s.globalRgbShiftIntensity ?? 70),
      slice_count: Number(s.sliceCount ?? 14),
      max_offset: Number(s.maxOffset ?? 48),
      randomness: Number(s.randomness ?? 50),
      scanline_thickness: Number(s.scanlineThickness ?? 1),
      scanline_gap: Number(s.scanlineGap ?? 2),
      flicker: Number(s.flicker ?? 16),
      curvature: Number(s.curvature ?? 12),
      snap_to_palette: Boolean(s.snapGlitchToPalette ?? false),
      palette_mix: Number(s.paletteMix ?? 100),
      global_seed: Number(s.globalSeed ?? 1337),
    };

    if (String(s.palette ?? "Grayscale") === "Custom") {
      payload.push({
        ...common,
        palette: customPalette.length > 0
          ? customPalette
          : getPaletteColors("Grayscale").map((color) => [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0] as [number, number, number]),
      });
    } else {
      payload.push({
        ...common,
        palette_name: toBackendPaletteName(String(s.palette ?? "Grayscale")),
      });
    }
  }

  return payload;
}

export function createDefaultLayer(name = "Layer", type: LayerType = "adjustment"): Layer {
  return makeLayer({ name, type });
}
