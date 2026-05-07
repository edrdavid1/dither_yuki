import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Layer } from "@/types/layers";
import { cloneLayer, cloneLayers, createDefaultLayer } from "@/types/layers";

export interface UseLayerSessionArgs {
  layersRef: React.RefObject<Layer[]>;
  activeLayerIdRef: React.RefObject<string>;
  setLayers: Dispatch<SetStateAction<Layer[]>>;
  setActiveLayerId: Dispatch<SetStateAction<string>>;
  commitControlsToActiveEffect: () => Layer[] | null;
  applyLayerSnapshotToControls: (layerSnapshot: Layer | null) => void;
  persistCurrentLayersToFrame: (nextLayers: Layer[], nextActiveLayerId?: string) => void;
}

export function useLayerSession({
  layersRef,
  activeLayerIdRef,
  setLayers,
  setActiveLayerId,
  commitControlsToActiveEffect,
  applyLayerSnapshotToControls,
  persistCurrentLayersToFrame,
}: UseLayerSessionArgs) {
  const handleSelectLayer = useCallback((layerId: string) => {
    const savedLayers = commitControlsToActiveEffect();
    const nextLayer = layersRef.current.find((layer) => layer.id === layerId) ?? null;
    if (!nextLayer) return;
    if (savedLayers) {
      setLayers(savedLayers);
    }
    applyLayerSnapshotToControls(nextLayer);
  }, [applyLayerSnapshotToControls, commitControlsToActiveEffect, layersRef, setLayers]);

  const handleToggleLayerVisibility = useCallback((layerId: string) => {
    setLayers((prev) => {
      const next = prev.map((layer) => (layer.id === layerId ? { ...cloneLayer(layer), visible: !layer.visible } : cloneLayer(layer)));
      persistCurrentLayersToFrame(next);
      return next;
    });
  }, [persistCurrentLayersToFrame, setLayers]);

  const handleToggleLayerLock = useCallback((layerId: string) => {
    setLayers((prev) => {
      const next = prev.map((layer) => (layer.id === layerId ? { ...cloneLayer(layer), locked: !layer.locked } : cloneLayer(layer)));
      persistCurrentLayersToFrame(next);
      return next;
    });
  }, [persistCurrentLayersToFrame, setLayers]);

  const handleAddLayer = useCallback(() => {
    const committed = commitControlsToActiveEffect();
    const newLayer = createDefaultLayer(`Layer ${layersRef.current.length + 1}`);
    const insertAt = Math.min(layersRef.current.findIndex((layer) => layer.id === activeLayerIdRef.current) + 1, layersRef.current.length);
    const next = cloneLayers(committed ?? layersRef.current);
    next.splice(insertAt < 0 ? next.length : insertAt, 0, newLayer);
    setLayers(next);
    setActiveLayerId(newLayer.id);
    applyLayerSnapshotToControls(newLayer);
    persistCurrentLayersToFrame(next, newLayer.id);
  }, [activeLayerIdRef, applyLayerSnapshotToControls, commitControlsToActiveEffect, layersRef, persistCurrentLayersToFrame, setActiveLayerId, setLayers]);

  const handleDuplicateLayer = useCallback((layerId: string) => {
    const committed = commitControlsToActiveEffect();
    const source = layersRef.current.find((layer) => layer.id === layerId);
    if (!source) return;
    const duplicate = cloneLayer(source);
    duplicate.id = `layer-${Date.now()}`;
    duplicate.name = `${source.name} copy`;
    const next = cloneLayers(committed ?? layersRef.current);
    const index = next.findIndex((layer) => layer.id === layerId);
    next.splice(index < 0 ? next.length : index + 1, 0, duplicate);
    setLayers(next);
    setActiveLayerId(duplicate.id);
    applyLayerSnapshotToControls(duplicate);
    persistCurrentLayersToFrame(next, duplicate.id);
  }, [applyLayerSnapshotToControls, commitControlsToActiveEffect, layersRef, persistCurrentLayersToFrame, setActiveLayerId, setLayers]);

  const handleRemoveLayer = useCallback((layerId: string) => {
    if (layersRef.current.length <= 1) return;
    const committed = commitControlsToActiveEffect();
    const next = (committed ?? layersRef.current).filter((layer) => layer.id !== layerId).map((layer) => cloneLayer(layer));
    const fallback = next[0] ?? null;
    setLayers(next);
    if (fallback) {
      setActiveLayerId(fallback.id);
      applyLayerSnapshotToControls(fallback);
    }
    persistCurrentLayersToFrame(next, fallback?.id);
  }, [applyLayerSnapshotToControls, commitControlsToActiveEffect, layersRef, persistCurrentLayersToFrame, setActiveLayerId, setLayers]);

  const handleMoveLayer = useCallback((layerId: string, direction: -1 | 1) => {
    const current = cloneLayers(layersRef.current);
    const fromIndex = current.findIndex((layer) => layer.id === layerId);
    const toIndex = fromIndex + direction;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= current.length) return;
    const [moved] = current.splice(fromIndex, 1);
    if (!moved) return;
    current.splice(toIndex, 0, moved);
    setLayers(current);
    persistCurrentLayersToFrame(current);
  }, [layersRef, persistCurrentLayersToFrame, setLayers]);

  return {
    handleSelectLayer,
    handleToggleLayerVisibility,
    handleToggleLayerLock,
    handleAddLayer,
    handleDuplicateLayer,
    handleRemoveLayer,
    handleMoveLayer,
  };
}
