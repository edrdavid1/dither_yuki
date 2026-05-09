import { z } from "zod";

/**
 * Layer DTO Schemas
 * Runtime validation for layer data contracts
 */

// RGB color triplet schema
export const RgbColorSchema = z.tuple([
  z.number().int().min(0).max(255),
  z.number().int().min(0).max(255),
  z.number().int().min(0).max(255),
]);

// Blend mode schema
export const LayerBlendModeSchema = z.enum([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "add",
]);

// Layer type schema
export const LayerTypeSchema = z.enum(["image", "generator", "adjustment"]);

// Frame settings schema (subset used in layers)
export const LayerSettingsSchema = z.object({
  algorithm: z.string().default("Floyd-Steinberg"),
  palette: z.string().default("Grayscale"),
  customPalette: z.array(RgbColorSchema).optional(),
  intensity: z.number().min(0).max(200).default(100),
  contrast: z.number().min(0).max(200).default(100),
  brightness: z.number().min(0).max(200).default(100),
  saturation: z.number().min(0).max(200).default(100),
  pixelSize: z.number().int().min(1).max(64).default(1),
  blur: z.number().min(0).max(100).default(0),
  sharpness: z.number().min(0).max(100).default(0),
  noise: z.number().min(0).max(100).default(0),
  blendMode: z.string().default("normal"),
  layerOpacity: z.number().min(0).max(100).default(100),
  glitchType: z.string().default("None"),
  pixelSortMetric: z.string().default("luma"),
  pixelSortMask: z.string().default("all"),
  thresholdMin: z.number().min(0).max(100).default(20),
  thresholdMax: z.number().min(0).max(100).default(80),
  angle: z.number().min(-180).max(180).default(0),
  sortLength: z.number().int().min(1).max(512).default(64),
  blockSize: z.number().int().min(1).max(128).default(16),
  chaos: z.number().min(0).max(100).default(40),
  quantization: z.number().min(0).max(100).default(45),
  redShiftX: z.number().int().min(-64).max(64).default(4),
  redShiftY: z.number().int().min(-64).max(64).default(0),
  greenShiftX: z.number().int().min(-64).max(64).default(0),
  greenShiftY: z.number().int().min(-64).max(64).default(0),
  blueShiftX: z.number().int().min(-64).max(64).default(-4),
  blueShiftY: z.number().int().min(-64).max(64).default(0),
  globalRgbShiftIntensity: z.number().min(0).max(100).default(70),
  sliceCount: z.number().int().min(1).max(128).default(14),
  maxOffset: z.number().int().min(0).max(256).default(48),
  randomness: z.number().min(0).max(100).default(50),
  scanlineThickness: z.number().int().min(1).max(16).default(1),
  scanlineGap: z.number().int().min(0).max(32).default(2),
  flicker: z.number().min(0).max(100).default(16),
  curvature: z.number().min(0).max(100).default(12),
  snapGlitchToPalette: z.boolean().default(false),
  globalSeed: z.number().int().default(1337),
  paletteMix: z.number().min(0).max(100).default(100),
  maskTarget: z.string().default("all"),
  maskFeather: z.number().min(0).max(1).default(0.2),
  maskR: z.boolean().default(true),
  maskG: z.boolean().default(true),
  maskB: z.boolean().default(true),
  maskA: z.boolean().default(true),
});

// Domain Layer schema (frontend model)
export const LayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).default("Layer"),
  type: LayerTypeSchema.default("adjustment"),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  blendMode: LayerBlendModeSchema.default("normal"),
  opacity: z.number().min(0).max(100).default(100),
  settings: LayerSettingsSchema,
});

// Backend Effect Layer Payload schema
export const BackendEffectLayerPayloadSchema = z.object({
  id: z.string(),
  algorithm: z.string(),
  enabled: z.boolean(),
  intensity: z.number(),
  blend_mode: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  palette_name: z.string().optional(),
  palette: z.array(RgbColorSchema).optional(),
  contrast: z.number().optional(),
  brightness: z.number().optional(),
  saturation: z.number().optional(),
  pixel_size: z.number().optional(),
  blur: z.number().optional(),
  sharpness: z.number().optional(),
  noise: z.number().optional(),
  glitch_type: z.string().optional(),
  sort_by: z.string().optional(),
  masking: z.string().optional(),
  mask_target: z.string().optional(),
  mask_feather: z.number().optional(),
  threshold_min: z.number().optional(),
  threshold_max: z.number().optional(),
  direction_angle: z.number().optional(),
  sort_length: z.number().optional(),
  block_size: z.number().optional(),
  chaos: z.number().optional(),
  quantization: z.number().optional(),
  red_shift_x: z.number().optional(),
  red_shift_y: z.number().optional(),
  green_shift_x: z.number().optional(),
  green_shift_y: z.number().optional(),
  blue_shift_x: z.number().optional(),
  blue_shift_y: z.number().optional(),
  global_rgb_shift_intensity: z.number().optional(),
  slice_count: z.number().optional(),
  max_offset: z.number().optional(),
  randomness: z.number().optional(),
  scanline_thickness: z.number().optional(),
  scanline_gap: z.number().optional(),
  flicker: z.number().optional(),
  curvature: z.number().optional(),
  snap_to_palette: z.boolean().optional(),
  palette_mix: z.number().optional(),
  global_seed: z.number().optional(),
  mask_r: z.boolean().optional(),
  mask_g: z.boolean().optional(),
  mask_b: z.boolean().optional(),
  mask_a: z.boolean().optional(),
});

// Export inferred types
export type ValidatedLayer = z.infer<typeof LayerSchema>;
export type ValidatedLayerSettings = z.infer<typeof LayerSettingsSchema>;
export type ValidatedBackendPayload = z.infer<typeof BackendEffectLayerPayloadSchema>;

// Validation helper functions
export function validateLayer(data: unknown): ValidatedLayer | null {
  const result = LayerSchema.safeParse(data);
  return result.success ? result.data : null;
}

export function validateLayerSettings(data: unknown): ValidatedLayerSettings | null {
  const result = LayerSettingsSchema.safeParse(data);
  return result.success ? result.data : null;
}

export function validateBackendPayload(data: unknown): ValidatedBackendPayload | null {
  const result = BackendEffectLayerPayloadSchema.safeParse(data);
  return result.success ? result.data : null;
}
