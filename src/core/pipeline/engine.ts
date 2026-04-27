import {
  adjustImage,
  applyBlur,
  applyDithering,
  applyNoise,
  applyPixelScale,
  applySharpness,
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
      case "dither":
        current = applyDithering(
          current,
          effect.params.algorithm,
          effect.params.palette,
          effect.params.intensity,
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
