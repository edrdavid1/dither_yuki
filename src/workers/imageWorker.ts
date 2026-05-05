/**
 * Image processing Web Worker.
 *
 * Runs runImagePipeline + the pixel-scale upscale entirely off the main thread.
 * Data is transferred via Transferable Objects (ArrayBuffer) so no memory is copied.
 *
 * Message protocol
 * ────────────────
 * Main → Worker  { id, buffer, width, height, settings, pixelSize }
 *   buffer      : ArrayBuffer  (transferred – zero-copy)
 *   width/height: number       source dimensions
 *   settings    : ImagePipelineSettings
 *   pixelSize   : number       (needed for the upscale step)
 *   id          : number       request correlation id
 *
 * Worker → Main  { id, buffer, width, height }  on success
 *               { id, error: string }            on failure
 *   buffer      : ArrayBuffer  (transferred back – zero-copy)
 *   width/height: number       final output dimensions (may differ from source when pixelSize > 1)
 */

import { createDefaultPipeline, runImagePipeline } from "@/core/pipeline";
import type { ImagePipelineSettings } from "@/core/pipeline";

export interface WorkerRequest {
  id: number;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  settings: ImagePipelineSettings;
  pixelSize: number;
}

export interface WorkerResponse {
  id: number;
  buffer: ArrayBuffer;
  width: number;
  height: number;
}

export interface WorkerErrorResponse {
  id: number;
  error: string;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, buffer, width, height, settings, pixelSize } = event.data;

  try {
    // Wrap the transferred buffer in a typed array and ImageData — no copy
    const clamped = new Uint8ClampedArray(buffer);
    let imageData = new ImageData(clamped, width, height);

    const pipeline = createDefaultPipeline(settings);
    imageData = runImagePipeline(imageData, pipeline);

    let outBuffer: ArrayBuffer;
    let outWidth = imageData.width;
    let outHeight = imageData.height;

    if (pixelSize > 1) {
      // Upscale back to original source dimensions using nearest-neighbour
      // (no smoothing) so exported pixels are sharp blocks.
      const upscaled = new Uint8ClampedArray(width * height * 4);
      const scaleX = width / imageData.width;
      const scaleY = height / imageData.height;
      const srcData = imageData.data;
      const srcW = imageData.width;

      for (let y = 0; y < height; y++) {
        const srcY = Math.min(Math.floor(y / scaleY), imageData.height - 1);
        for (let x = 0; x < width; x++) {
          const srcX = Math.min(Math.floor(x / scaleX), imageData.width - 1);
          const src = (srcY * srcW + srcX) * 4;
          const dst = (y * width + x) * 4;
          upscaled[dst]     = srcData[src]!;
          upscaled[dst + 1] = srcData[src + 1]!;
          upscaled[dst + 2] = srcData[src + 2]!;
          upscaled[dst + 3] = srcData[src + 3]!;
        }
      }

      outBuffer = upscaled.buffer;
      outWidth = width;
      outHeight = height;
    } else {
      // Transfer the processed buffer directly — buffer is now detached in this
      // scope after postMessage, so no lingering reference.
      outBuffer = imageData.data.buffer.slice(0); // slice needed because ImageData.data.buffer may be shared
    }

    const response: WorkerResponse = { id, buffer: outBuffer, width: outWidth, height: outHeight };
    (self as unknown as Worker).postMessage(response, [outBuffer]);
  } catch (err) {
    const response: WorkerErrorResponse = {
      id,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(response);
  }
};
