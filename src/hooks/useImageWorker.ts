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
 *   const result = await processImage(imageData, layers);
 *
 * @param imageData - source ImageData from a canvas
 * @param layers    - ordered EffectLayer array (built via buildEffectLayerPayloadFromValues)
 */
export function useImageWorker() {
  const isTauriRuntime =
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

  const processImage = useCallback(
    async (
      imageData: ImageData,
      layers: unknown[],
    ): Promise<{ buffer: ArrayBuffer; width: number; height: number }> => {
      const rgbaBytes = new Uint8Array(imageData.data.buffer);
      const result = await getBackendPreview(imageData.width, imageData.height, rgbaBytes, layers);

      if (!result) {
        if (!isTauriRuntime) {
          // Browser localhost/dev fallback: keep UI usable without Tauri backend.
          return {
            buffer: new Uint8Array(imageData.data).buffer,
            width: imageData.width,
            height: imageData.height,
          };
        }

        throw new Error("Backend preview returned null in Tauri runtime");
      }

      const outBuffer = new Uint8Array(result.rgba).buffer;
      return { buffer: outBuffer, width: result.width, height: result.height };
    },
    [isTauriRuntime],
  );

  return { processImage };
}
