import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { cloneLayers, type Layer } from "@/types/layers";
import type { AnimationFrame } from "@/types/animationFrame";

export interface UseFrameLayerSyncArgs {
  framesRef: MutableRefObject<AnimationFrame[]>;
  layersRef: MutableRefObject<Layer[]>;
  activeLayerIdRef: MutableRefObject<string>;
  selectedFrameIndex: number;
  setFrames: Dispatch<SetStateAction<AnimationFrame[]>>;
  renderFramePreview: (frameId: string, snapshotLayers?: Layer[]) => Promise<string | null>;
  markProjectDirty: () => void;
}

export interface UseFrameLayerSyncResult {
  persistCurrentLayersToFrame: (nextLayers: Layer[], nextActiveLayerId?: string) => void;
  syncLayersFromFrame: (frameIndex: number) => Layer[] | null;
}

export function useFrameLayerSync({
  framesRef,
  layersRef,
  activeLayerIdRef,
  selectedFrameIndex,
  setFrames,
  renderFramePreview,
  markProjectDirty,
}: UseFrameLayerSyncArgs): UseFrameLayerSyncResult {
  /**
   * Persist current layer stack to the active frame.
   * This is the canonical implementation - all layer mutations must flow through here.
   */
  const persistCurrentLayersToFrame = useCallback((nextLayers: Layer[], nextActiveLayerId = activeLayerIdRef.current) => {
    if (framesRef.current.length === 0) return;

    const snapshot = cloneLayers(nextLayers);
    const targetIndex = Math.max(0, Math.min(selectedFrameIndex, framesRef.current.length - 1));
    const targetFrame = framesRef.current[targetIndex];

    // Update refs immediately for synchronous access
    layersRef.current = snapshot;
    activeLayerIdRef.current = nextActiveLayerId;

    // Update frames ref
    framesRef.current = framesRef.current.map((frame, index) => (
      index === targetIndex
        ? {
            ...frame,
            layers: snapshot,
            activeLayerId: nextActiveLayerId,
            isKeyframe: true,
          }
        : frame
    ));

    // Trigger React state update
    setFrames((prev) => prev.map((frame, index) => (
      index === targetIndex
        ? {
            ...frame,
            layers: snapshot,
            activeLayerId: nextActiveLayerId,
            isKeyframe: true,
          }
        : frame
    )));

    // Trigger preview render and mark dirty
    if (targetFrame) {
      void renderFramePreview(targetFrame.id, snapshot);
      markProjectDirty();
    }
  }, [activeLayerIdRef, framesRef, layersRef, markProjectDirty, renderFramePreview, selectedFrameIndex, setFrames]);

  /**
   * Load layers from a specific frame into the active editor state.
   * Returns the loaded layers or null if frame not found.
   */
  const syncLayersFromFrame = useCallback((frameIndex: number): Layer[] | null => {
    const frame = framesRef.current[frameIndex];
    if (!frame) return null;

    const syncedLayers = cloneLayers(frame.layers);
    layersRef.current = syncedLayers;
    activeLayerIdRef.current = frame.activeLayerId || frame.layers[0]?.id || "";

    return syncedLayers;
  }, [activeLayerIdRef, framesRef, layersRef]);

  return {
    persistCurrentLayersToFrame,
    syncLayersFromFrame,
  };
}
