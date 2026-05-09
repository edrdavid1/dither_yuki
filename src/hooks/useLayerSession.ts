import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Layer } from "@/types/layers";
import { cloneLayer, cloneLayers, createDefaultLayer, makeLayerId } from "@/types/layers";

export interface UseLayerSessionArgs {
  layersRef: React.RefObject<Layer[]>;
  activeLayerIdRef: React.RefObject<string>;
  setLayers: Dispatch<SetStateAction<Layer[]>>;
  setActiveLayerId: Dispatch<SetStateAction<string>>;
  commitControlsToActiveEffect: () => Layer[] | null;
  applyLayerSnapshotToControls: (layerSnapshot: Layer | null) => void;
  persistCurrentLayersToFrame: (nextLayers: Layer[], nextActiveLayerId?: string) => void;
}

type LayerCommand =
  | { type: "select"; layerId: string }
  | { type: "toggleVisibility"; layerId: string }
  | { type: "toggleLock"; layerId: string }
  | { type: "add" }
  | { type: "duplicate"; layerId: string }
  | { type: "remove"; layerId: string }
  | { type: "move"; layerId: string; direction: -1 | 1 };

export function useLayerSession({
  layersRef,
  activeLayerIdRef,
  setLayers,
  setActiveLayerId,
  commitControlsToActiveEffect,
  applyLayerSnapshotToControls,
  persistCurrentLayersToFrame,
}: UseLayerSessionArgs) {
  const dispatchLayerCommand = useCallback((command: LayerCommand) => {
    const committed = commitControlsToActiveEffect();
    const baseLayers = cloneLayers(committed ?? layersRef.current);
    const getLayerById = (layerId: string) => baseLayers.find((layer) => layer.id === layerId) ?? null;

    if (command.type === "select") {
      const nextLayer = baseLayers.find((layer) => layer.id === command.layerId) ?? null;
      if (!nextLayer) return;
      if (committed) {
        setLayers(baseLayers);
      }
      applyLayerSnapshotToControls(nextLayer);
      return;
    }

    if (command.type === "toggleVisibility") {
      const targetLayer = getLayerById(command.layerId);
      if (!targetLayer || targetLayer.locked) return;
      const next = baseLayers.map((layer) => (
        layer.id === command.layerId ? { ...cloneLayer(layer), visible: !layer.visible } : cloneLayer(layer)
      ));
      setLayers(next);
      persistCurrentLayersToFrame(next);
      return;
    }

    if (command.type === "toggleLock") {
      const next = baseLayers.map((layer) => (
        layer.id === command.layerId ? { ...cloneLayer(layer), locked: !layer.locked } : cloneLayer(layer)
      ));
      setLayers(next);
      persistCurrentLayersToFrame(next);
      return;
    }

    if (command.type === "add") {
      const maxNum = baseLayers.reduce((max, layer) => {
        const num = parseInt(layer.name, 10);
        return !isNaN(num) && num > max ? num : max;
      }, 0);
      const newLayer = createDefaultLayer(`${maxNum + 1}`);
      const activeIndex = baseLayers.findIndex((layer) => layer.id === activeLayerIdRef.current);
      const insertAt = Math.min(activeIndex + 1, baseLayers.length);
      const next = cloneLayers(baseLayers);
      next.splice(insertAt < 0 ? next.length : insertAt, 0, newLayer);
      setLayers(next);
      setActiveLayerId(newLayer.id);
      applyLayerSnapshotToControls(newLayer);
      persistCurrentLayersToFrame(next, newLayer.id);
      return;
    }

    if (command.type === "duplicate") {
      const source = baseLayers.find((layer) => layer.id === command.layerId);
      if (!source || source.locked) return;
      const duplicate = cloneLayer(source);
      duplicate.id = makeLayerId();
      duplicate.name = `${source.name} copy`;
      const next = cloneLayers(baseLayers);
      const index = next.findIndex((layer) => layer.id === command.layerId);
      next.splice(index < 0 ? next.length : index + 1, 0, duplicate);
      setLayers(next);
      setActiveLayerId(duplicate.id);
      applyLayerSnapshotToControls(duplicate);
      persistCurrentLayersToFrame(next, duplicate.id);
      return;
    }

    if (command.type === "remove") {
      if (baseLayers.length <= 1) return;
      const targetLayer = getLayerById(command.layerId);
      if (!targetLayer || targetLayer.locked) return;
      const next = baseLayers.filter((layer) => layer.id !== command.layerId).map((layer) => cloneLayer(layer));
      const fallback = next[0] ?? null;
      setLayers(next);
      if (fallback) {
        setActiveLayerId(fallback.id);
        applyLayerSnapshotToControls(fallback);
      }
      persistCurrentLayersToFrame(next, fallback?.id);
      return;
    }

    const current = cloneLayers(baseLayers);
    const fromIndex = current.findIndex((layer) => layer.id === command.layerId);
    const toIndex = fromIndex + command.direction;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= current.length) return;
    if (current[fromIndex]?.locked) return;
    const [moved] = current.splice(fromIndex, 1);
    if (!moved) return;
    current.splice(toIndex, 0, moved);
    setLayers(current);
    persistCurrentLayersToFrame(current);
  }, [
    activeLayerIdRef,
    applyLayerSnapshotToControls,
    commitControlsToActiveEffect,
    layersRef,
    persistCurrentLayersToFrame,
    setActiveLayerId,
    setLayers,
  ]);

  const handleSelectLayer = useCallback((layerId: string) => {
    dispatchLayerCommand({ type: "select", layerId });
  }, [dispatchLayerCommand]);

  const handleToggleLayerVisibility = useCallback((layerId: string) => {
    dispatchLayerCommand({ type: "toggleVisibility", layerId });
  }, [dispatchLayerCommand]);

  const handleToggleLayerLock = useCallback((layerId: string) => {
    dispatchLayerCommand({ type: "toggleLock", layerId });
  }, [dispatchLayerCommand]);

  const handleAddLayer = useCallback(() => {
    dispatchLayerCommand({ type: "add" });
  }, [dispatchLayerCommand]);

  const handleDuplicateLayer = useCallback((layerId: string) => {
    dispatchLayerCommand({ type: "duplicate", layerId });
  }, [dispatchLayerCommand]);

  const handleRemoveLayer = useCallback((layerId: string) => {
    dispatchLayerCommand({ type: "remove", layerId });
  }, [dispatchLayerCommand]);

  const handleMoveLayer = useCallback((layerId: string, direction: -1 | 1) => {
    dispatchLayerCommand({ type: "move", layerId, direction });
  }, [dispatchLayerCommand]);

  return {
    handleSelectLayer,
    handleToggleLayerVisibility,
    handleToggleLayerLock,
    handleAddLayer,
    handleDuplicateLayer,
    handleRemoveLayer,
    handleMoveLayer,
    dispatchLayerCommand,
  };
}
