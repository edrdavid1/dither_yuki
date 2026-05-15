import { useEffect, useRef } from "react";
import { createHash } from "@/lib/videoRuntime/hash";
import type { LayerTrack } from "@/lib/videoRuntime/layerTracks";

/**
 * Detects changes to effect parameters (opacity, intensity, enabled) in layer tracks
 * and triggers a callback when they change.
 *
 * This hook is used to trigger a frame redraw when the user adjusts effect sliders
 * while the video is paused, so they can see the result immediately.
 *
 * The callback is debounced by 50ms to avoid excessive redraws during rapid slider changes.
 */
export function useEffectParamSync(
  layerTracks: LayerTrack[],
  layerPayload: unknown[],
  onEffectParamsChanged: () => void,
) {
  const lastHashRef = useRef<string>("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Create a hash of only the effect parameters (not the entire track structure)
    // This includes: opacity01, intensity, enabled for each range
    const effectParams = layerTracks.map((track) => ({
      layerId: track.layerId,
      ranges: track.ranges.map((r) => ({
        startFrame: r.startFrame,
        endFrame: r.endFrame,
        enabled: r.enabled,
        opacity01: r.opacity01,
        intensity: r.intensity,
      })),
    }));

    const currentHash = createHash(JSON.stringify({ effects: effectParams, payload: layerPayload }));

    if (currentHash !== lastHashRef.current) {
      lastHashRef.current = currentHash;

      // Debounce the callback to avoid excessive redraws during rapid slider changes
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        onEffectParamsChanged();
      }, 50);
    }

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [layerTracks, layerPayload, onEffectParamsChanged]);
}
