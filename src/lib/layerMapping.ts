/**
 * Layer Mapping Layer
 * Pure functions for transforming between Domain Models and DTOs
 * No side effects, no external dependencies
 */

import type { Layer, BackendEffectLayerPayload, LayerBlendMode } from "@/types/layers";
import type { FrameSettings } from "@/types/frameSettings";
import {
  LayerSchema,
  BackendEffectLayerPayloadSchema,
  LayerSettingsSchema,
  type ValidatedLayer,
  type ValidatedBackendPayload,
} from "@/validation/layerSchemas";
import { normalizeDitheringAlgorithm, normalizeColorPalette, getPaletteColors } from "@/utils/dithering";

// ═════════════════════════════════════════════════════════════════════════════
// Domain → DTO Mapping
// ═════════════════════════════════════════════════════════════════════════════

export interface LayerToBackendOptions {
  customPalette: [number, number, number][];
}

/**
 * Maps a domain Layer to BackendEffectLayerPayload DTO
 * This is the canonical transformation for backend communication
 */
export function mapLayerToBackendPayload(
  layer: Layer,
  options: LayerToBackendOptions,
): ValidatedBackendPayload {
  const s = layer.settings;
  const normalizedAlgorithmInput = String(s.algorithm ?? "Floyd-Steinberg");

  const payload: ValidatedBackendPayload = {
    id: layer.id,
    algorithm: normalizeDitheringAlgorithm(
      normalizedAlgorithmInput.toLowerCase() === "ordered"
        ? "Ordered"
        : normalizedAlgorithmInput.toLowerCase() === "random"
          ? "Random"
          : normalizedAlgorithmInput
    ),
    enabled: layer.visible,
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
    mask_r: Boolean(s.maskR ?? true),
    mask_g: Boolean(s.maskG ?? true),
    mask_b: Boolean(s.maskB ?? true),
    mask_a: Boolean(s.maskA ?? true),
  };

  // Handle palette: either custom colors or named palette
  if (String(s.palette ?? "Grayscale") === "Custom") {
    const palette = Array.isArray(s.customPalette) && s.customPalette.length > 0
      ? s.customPalette
      : options.customPalette.length > 0
        ? options.customPalette
        : getPaletteColors("Grayscale").map((color) => [
            color[0] ?? 0,
            color[1] ?? 0,
            color[2] ?? 0,
          ] as [number, number, number]);

    return { ...payload, palette };
  } else {
    const paletteName = toBackendPaletteName(String(s.palette ?? "Grayscale"));
    return { ...payload, palette_name: paletteName };
  }
}

/**
 * Maps multiple layers to backend payload array
 * Skips invisible layers (they don't affect rendering)
 */
export function mapLayersToBackendPayload(
  layers: Layer[],
  options: LayerToBackendOptions,
): ValidatedBackendPayload[] {
  return layers
    .filter((layer) => layer.visible)
    .map((layer) => mapLayerToBackendPayload(layer, options));
}

// ═════════════════════════════════════════════════════════════════════════════
// Validation
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Validates and normalizes a layer payload
 * Returns null if invalid (should never happen with correct domain code)
 */
export function validateBackendPayload(
  payload: unknown,
): ValidatedBackendPayload | null {
  const result = BackendEffectLayerPayloadSchema.safeParse(payload);
  return result.success ? result.data : null;
}

/**
 * Validates a domain layer
 * Applies defaults for missing fields
 */
export function validateLayer(layer: unknown): ValidatedLayer | null {
  const result = LayerSchema.safeParse(layer);
  return result.success ? result.data : null;
}

/**
 * Validates layer settings
 */
export function validateLayerSettings(settings: unknown): ValidatedLayer["settings"] | null {
  const result = LayerSettingsSchema.safeParse(settings);
  return result.success ? result.data : null;
}

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════

const FRONTEND_TO_BACKEND_PALETTE: Partial<Record<string, string>> = {
  Original: "Grayscale",
  Gameboy: "GameBoy",
  GameBoy: "GameBoy",
  C64: "Commodore 64",
  "Commodore 64": "Commodore 64",
};

function toBackendPaletteName(palette: string): string {
  const normalized = normalizeColorPalette(palette);
  return FRONTEND_TO_BACKEND_PALETTE[normalized] ?? normalized;
}

// ═════════════════════════════════════════════════════════════════════════════
// Migration (for future .dyproj version handling)
// ═════════════════════════════════════════════════════════════════════════════

export interface MigrationContext {
  fromVersion: string;
  toVersion: string;
}

/**
 * Placeholder for future migration logic
 * When we need to handle breaking changes in .dyproj format
 */
export function migrateLayerData(
  data: unknown,
  _ctx: MigrationContext,
): unknown {
  // Currently no migrations needed - data is forward compatible
  // Future: transform old field names, structure changes, etc.
  return data;
}
