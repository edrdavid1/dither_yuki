import {
  adjustImage,
  applyBlur,
  applyDithering,
  applyGlitch,
  applyNoise,
  applyPixelScale,
  applySharpness,
  getPaletteColors,
} from "@/utils/dithering";
import type { PipelineEffect } from "./types";

export function runImagePipeline(source: ImageData, effects: PipelineEffect[]): ImageData {
  let current = source;

  for (const effect of effects) {
    if (!effect.enabled) {
      continue;
    }

    switch (effect.type) {
      case "blur":
        current = applyBlur(current, effect.params.radius);
        break;
      case "adjust":
        current = adjustImage(
          current,
          effect.params.contrast,
          effect.params.brightness,
          effect.params.saturation,
        );
        break;
      case "sharpness":
        current = applySharpness(current, effect.params.amount);
        break;
      case "noise":
        current = applyNoise(current, effect.params.amount);
        break;
      case "pixelScale":
        current = applyPixelScale(current, effect.params.scale);
        break;
      case "glitch": {
        current = applyGlitch(current, effect.params, getPaletteColors(effect.params.palette));
        break;
      }
      case "dither":
        current = applyDithering(
          current,
          effect.params.algorithm,
          effect.params.palette,
          effect.params.intensity,
          effect.params.customPalette,
        );
        break;
      default: {
        const exhaustiveCheck: never = effect;
        throw new Error(`Unknown effect type: ${JSON.stringify(exhaustiveCheck)}`);
      }
    }
  }

  return current;
}
