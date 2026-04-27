import type { ImagePipelineSettings, PipelineEffect } from "./types";

export function createDefaultPipeline(settings: ImagePipelineSettings): PipelineEffect[] {
  return [
    {
      id: "blur",
      type: "blur",
      enabled: settings.blur > 0,
      params: { radius: settings.blur },
    },
    {
      id: "adjust",
      type: "adjust",
      enabled: true,
      params: {
        contrast: settings.contrast,
        brightness: settings.brightness,
        saturation: settings.saturation,
      },
    },
    {
      id: "sharpness",
      type: "sharpness",
      enabled: settings.sharpness > 0,
      params: { amount: settings.sharpness },
    },
    {
      id: "noise",
      type: "noise",
      enabled: settings.noise > 0,
      params: { amount: settings.noise },
    },
    {
      id: "pixelScale",
      type: "pixelScale",
      enabled: settings.pixelSize > 1,
      params: { scale: settings.pixelSize },
    },
    {
      id: "dither",
      type: "dither",
      enabled: true,
      params: {
        algorithm: settings.algorithm,
        palette: settings.palette,
        intensity: settings.intensity,
      },
    },
  ];
}
