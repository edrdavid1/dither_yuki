import { useCallback, useRef, useState } from "react";
import {
  getFilteredFrameBinaryV2,
  type VideoFrameRequestV1,
} from "@/lib/tauriBridge";
import { createHash } from "@/lib/videoRuntime/hash";

interface UseGhostFrameArgs {
  enabled: boolean;
  videoId: string | null;
  inputPath: string | null;
  fps: number;
  width: number;
  height: number;
  layerPayload: unknown[];
  layerTracks: unknown[];
}

interface UseGhostFrameResult {
  ghostFrameUrl: string | null;
  requestGhostFrame: (frameIndex: number) => void;
  clearGhostFrame: () => void;
}

function rgbaToDataUrl(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): string | null {
  try {
    if (typeof OffscreenCanvas === "undefined") {
      return null;
    }
    const expectedLength = width * height * 4;
    if (rgba.length !== expectedLength) {
      console.warn(
        `[useGhostFrame] RGBA buffer length mismatch: expected ${expectedLength}, got ${rgba.length}`,
      );
      return null;
    }
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
    ctx.putImageData(imageData, 0, 0);

    const regularCanvas = document.createElement("canvas");
    regularCanvas.width = width;
    regularCanvas.height = height;
    const regularCtx = regularCanvas.getContext("2d");
    if (!regularCtx) return null;
    regularCtx.putImageData(imageData, 0, 0);
    return regularCanvas.toDataURL("image/png");
  } catch (err) {
    console.warn("[useGhostFrame] Failed to convert RGBA to data URL", err);
    return null;
  }
}

export function useGhostFrame({
  enabled,
  videoId,
  inputPath,
  fps,
  width,
  height,
  layerPayload,
  layerTracks,
}: UseGhostFrameArgs): UseGhostFrameResult {
  const [ghostFrameUrl, setGhostFrameUrl] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef<number>(0);

  const clearGhostFrame = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (staleTimerRef.current !== null) {
      clearTimeout(staleTimerRef.current);
      staleTimerRef.current = null;
    }
    requestIdRef.current += 1;
    setGhostFrameUrl(null);
  }, []);

  const requestGhostFrame = useCallback(
    (frameIndex: number) => {
      if (!enabled || !videoId) {
        return;
      }

      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      debounceTimerRef.current = setTimeout(async () => {
        debounceTimerRef.current = null;

        const thisRequestId = ++requestIdRef.current;

        if (staleTimerRef.current !== null) {
          clearTimeout(staleTimerRef.current);
          staleTimerRef.current = null;
        }

        const request: VideoFrameRequestV1 = {
          version: 1,
          video_id: videoId,
          frame_index: frameIndex,
          quality_mode: "fast",
          scale: 0.25,
          width,
          height,
          input_path: inputPath ?? undefined,
          fps,
          layer_payload: layerPayload,
          layer_tracks: layerTracks,
          layer_snapshot_hash: createHash(
            JSON.stringify({ p: layerPayload, t: layerTracks }),
          ),
          transport_mode: "scrub",
        };

        staleTimerRef.current = setTimeout(() => {
          staleTimerRef.current = null;
          if (requestIdRef.current === thisRequestId) {
            setGhostFrameUrl(null);
          }
        }, 500);

        try {
          const response = await getFilteredFrameBinaryV2(request);

          if (requestIdRef.current !== thisRequestId) {
            return;
          }

          if (staleTimerRef.current !== null) {
            clearTimeout(staleTimerRef.current);
            staleTimerRef.current = null;
          }

          if (!response || !response.rgba) {
            setGhostFrameUrl(null);
            return;
          }

          const dataUrl = rgbaToDataUrl(
            response.rgba,
            response.meta.width,
            response.meta.height,
          );
          setGhostFrameUrl(dataUrl);
        } catch (err) {
          console.warn("[useGhostFrame] Frame request failed", err);

          if (requestIdRef.current === thisRequestId) {
            setGhostFrameUrl(null);
          }
        }
      }, 80);
    },
    [enabled, videoId, inputPath, fps, width, height, layerPayload, layerTracks],
  );

  return { ghostFrameUrl, requestGhostFrame, clearGhostFrame };
}
