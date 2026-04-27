import type { ColorPalette, DitheringAlgorithm } from "@/utils/dithering";

export type PipelineEffectType =
  | "blur"
  | "adjust"
  | "sharpness"
  | "noise"
  | "pixelScale"
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

export type DitherEffect = PipelineEffectBase<
  "dither",
  {
    algorithm: DitheringAlgorithm;
    palette: ColorPalette;
    intensity: number;
  }
>;

export type PipelineEffect =
  | BlurEffect
  | AdjustEffect
  | SharpnessEffect
  | NoiseEffect
  | PixelScaleEffect
  | DitherEffect;

export interface ImagePipelineSettings {
  algorithm: DitheringAlgorithm;
  palette: ColorPalette;
  intensity: number;
  contrast: number;
  brightness: number;
  saturation: number;
  pixelSize: number;
  blur: number;
  sharpness: number;
  noise: number;
}
