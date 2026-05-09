import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { Layer } from "@/types/layers";

interface UseLayerReadOnlyGuardsArgs {
  activeLayerIdRef: MutableRefObject<string>;
  layersRef: MutableRefObject<Layer[]>;
  markProjectDirty: () => void;
}

export function useLayerReadOnlyGuards({
  activeLayerIdRef,
  layersRef,
  markProjectDirty,
}: UseLayerReadOnlyGuardsArgs) {
  const isActiveLayerLocked = useCallback(() => {
    const currentLayerId = activeLayerIdRef.current;
    if (!currentLayerId) return false;
    return layersRef.current.some((layer) => layer.id === currentLayerId && layer.locked);
  }, [activeLayerIdRef, layersRef]);

  const updateActiveLayerControl = useCallback((apply: () => void) => {
    if (isActiveLayerLocked()) {
      return false;
    }
    apply();
    markProjectDirty();
    return true;
  }, [isActiveLayerLocked, markProjectDirty]);

  return {
    isActiveLayerLocked,
    updateActiveLayerControl,
  };
}

