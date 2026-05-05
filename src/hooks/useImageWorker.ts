import { useCallback } from "react";
import { getBackendPreview } from "@/lib/tauriBridge";

/**
 * Hook that processes an image through the Rust backend pipeline.
 *
 * Replaces the previous Web Worker (JS-side) implementation so that preview
 * and final render always use the same Rust engine — eliminating the
 * "double preview" mismatch.
 *
 * Usage:
 *   const { processImage } = useImageWorker();
 *   const result = await processImage(imageData, layers, pixelSize);
 *
 * @param imageData - source ImageData from a canvas
 * @param layers    - ordered EffectLayer array (built via buildEffectLayerPayloadFromValues)
 * @param _pixelSize - kept for API compatibility; pixel_size is already in the layer payload
 */
export function useImageWorker() {
  const processImage = useCallback(
    async (
      imageData: ImageData,
      layers: unknown[],
      _pixelSize: number,
    ): Promise<{ buffer: ArrayBuffer; width: number; height: number }> => {
      const rgbaBytes = new Uint8Array(imageData.data.buffer);
      const result = await getBackendPreview(imageData.width, imageData.height, rgbaBytes, layers);

      if (!result) {
        throw new Error("Backend preview returned null — check that the Tauri backend is running");
      }

      const outBuffer = new Uint8Array(result.rgba).buffer;
      return { buffer: outBuffer, width: result.width, height: result.height };
    },
    [],
  );

  return { processImage };
}
