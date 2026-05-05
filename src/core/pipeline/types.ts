import type { ColorPalette, DitheringAlgorithm } from "@/utils/dithering";

export type GlitchType = "None" | "Pixel Sort" | "Block Noise" | "RGB Shift" | "Slice" | "Analog";
export type PixelSortMetric = "luma" | "saturation" | "hue" | "rgb-sum";
export type PixelSortMask = "all" | "dark" | "light";

export type PipelineEffectType =
  | "blur"
  | "adjust"
  | "sharpness"
  | "noise"
  | "pixelScale"
  | "glitch"
  | "dither";

export interface PipelineEffectBase<T extends PipelineEffectType, P> {
  id: string;
  type: T;
  enabled: boolean;
  params: P;
}

export type BlurEffect = PipelineEffectBase<"blur", { radius: number }>;

export type AdjustEffect = PipelineEffectBase<
  "adjust",
  {
    contrast: number;
    brightness: number;
    saturation: number;
  }
>;

export type SharpnessEffect = PipelineEffectBase<"sharpness", { amount: number }>;

export type NoiseEffect = PipelineEffectBase<"noise", { amount: number }>;

export type PixelScaleEffect = PipelineEffectBase<"pixelScale", { scale: number }>;

export type GlitchEffect = PipelineEffectBase<
  "glitch",
  {
    palette: ColorPalette;
    glitchType: GlitchType;
    pixelSortMetric: PixelSortMetric;
    pixelSortMask: PixelSortMask;
    thresholdMin: number;
    thresholdMax: number;
    angle: number;
    sortLength: number;
    blockSize: number;
    chaos: number;
    quantization: number;
    redShiftX: number;
    redShiftY: number;
    greenShiftX: number;
    greenShiftY: number;
    blueShiftX: number;
    blueShiftY: number;
    globalRgbShiftIntensity: number;
    sliceCount: number;
    maxOffset: number;
    randomness: number;
    scanlineThickness: number;
    scanlineGap: number;
    flicker: number;
    curvature: number;
    snapGlitchToPalette: boolean;
    paletteMix: number;
    globalSeed: number;
  }
>;

export type DitherEffect = PipelineEffectBase<
  "dither",
  {
    algorithm: DitheringAlgorithm;
    palette: ColorPalette;
    customPalette?: [number, number, number][];
    intensity: number;
  }
>;

export type PipelineEffect =
  | BlurEffect
  | AdjustEffect
  | SharpnessEffect
  | NoiseEffect
  | PixelScaleEffect
  | GlitchEffect
  | DitherEffect;

export interface ImagePipelineSettings {
  algorithm: DitheringAlgorithm;
  palette: ColorPalette;
  customPalette?: [number, number, number][];
  intensity: number;
  contrast: number;
  brightness: number;
  saturation: number;
  pixelSize: number;
  blur: number;
  sharpness: number;
  noise: number;
  glitchType: GlitchType;
  pixelSortMetric: PixelSortMetric;
  pixelSortMask: PixelSortMask;
  thresholdMin: number;
  thresholdMax: number;
  angle: number;
  sortLength: number;
  blockSize: number;
  chaos: number;
  quantization: number;
  redShiftX: number;
  redShiftY: number;
  greenShiftX: number;
  greenShiftY: number;
  blueShiftX: number;
  blueShiftY: number;
  globalRgbShiftIntensity: number;
  sliceCount: number;
  maxOffset: number;
  randomness: number;
  scanlineThickness: number;
  scanlineGap: number;
  flicker: number;
  curvature: number;
  snapGlitchToPalette: boolean;
  paletteMix: number;
  globalSeed: number;
}
