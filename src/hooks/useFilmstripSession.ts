import { useCallback } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { toast } from "sonner";
import { cloneLayers, type Layer } from "@/types/layers";
import { makeAnimationFrame, type AnimationFrame } from "@/types/animationFrame";
import { interpolateFrameRangeByKeyframes } from "@/lib/animation/interpolation";
import { extractSingleVideoFrame, rgbaToImage } from "@/lib/mediaWorkflow";

const makeFrameId = () => `frame-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

const blobToDataUrl = async (blob: Blob): Promise<string> =>
  await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to encode blob as data URL"));
    reader.readAsDataURL(blob);
  });

const loadImageFromSrc = async (src: string): Promise<HTMLImageElement> => {
  const image = new Image();
  const resolvedSrc = !src
    ? ""
    : src.startsWith("data:")
      ? src
      : await fetch(src)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Failed to fetch image source: ${response.status} ${response.statusText}`);
          }
          return blobToDataUrl(await response.blob());
        })
        .catch((error) => {
          console.warn("[filmstrip-image-load] source conversion failed, using direct src", error);
          return src;
        });

  return new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image frame"));
    image.src = resolvedSrc;
  });
};

export interface UseFilmstripSessionArgs {
  workspaceMode: string;
  framesRef: RefObject<AnimationFrame[]>;
  layersRef: RefObject<Layer[]>;
  activeLayerIdRef: RefObject<string>;
  selectedFrameIndex: number;
  selectedFrameIds: Set<string>;
  frames: AnimationFrame[];
  setFrames: Dispatch<SetStateAction<AnimationFrame[]>>;
  setSelectedFrameIndex: Dispatch<SetStateAction<number>>;
  setSelectedFrameIds: Dispatch<SetStateAction<Set<string>>>;
  setLayers: Dispatch<SetStateAction<Layer[]>>;
  setActiveLayerId: Dispatch<SetStateAction<string>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setShowOriginal: Dispatch<SetStateAction<boolean>>;
  setStatus: (status: string) => void;
  commitControlsToActiveEffect: () => Layer[] | null;
  applyLayerSnapshotToControls: (layerSnapshot: Layer | null) => void;
  renderFramePreview: (
    frameId: string,
    snapshotLayers?: Layer[],
    sourceImage?: HTMLImageElement | null,
    forceProcessedImage?: boolean,
  ) => Promise<string | null>;
  videoSource: File | null;
}

export function useFilmstripSession({
  workspaceMode,
  framesRef,
  layersRef,
  activeLayerIdRef,
  selectedFrameIndex,
  selectedFrameIds,
  frames,
  setFrames,
  setSelectedFrameIndex,
  setSelectedFrameIds,
  setLayers,
  setActiveLayerId,
  setIsPlaying,
  setShowOriginal,
  setStatus,
  commitControlsToActiveEffect,
  applyLayerSnapshotToControls,
  renderFramePreview,
  videoSource,
}: UseFilmstripSessionArgs) {
  const handleAddFrameClone = useCallback(async () => {
    if (!frames.length) {
      toast.error("Load an image first");
      return;
    }

    const current = frames[selectedFrameIndex] ?? frames[0];
    if (!current) return;

    const committedLayers = commitControlsToActiveEffect() ?? cloneLayers(layersRef.current);
    const clone = makeAnimationFrame({
      id: makeFrameId(),
      src: current.src,
      width: current.width,
      height: current.height,
      layers: cloneLayers(committedLayers),
      activeLayerId: activeLayerIdRef.current,
      isKeyframe: true,
      sourceTimestamp: current.sourceTimestamp,
    });

    setFrames((prev) => {
      const next = [...prev];
      const insertAt = Math.min(selectedFrameIndex + 1, prev.length);
      next.splice(insertAt, 0, clone);
      return next;
    });
    setSelectedFrameIndex((prev) => Math.min(prev + 1, frames.length));
    setSelectedFrameIds(new Set([clone.id]));
    setStatus("Frame duplicated");
    toast.success("Frame duplicated");
  }, [activeLayerIdRef, commitControlsToActiveEffect, frames, framesRef, layersRef, selectedFrameIndex, setFrames, setSelectedFrameIds, setSelectedFrameIndex, setStatus]);

  const handleImportAnimationFrame = useCallback(() => {
    if (workspaceMode !== "animation") return;

    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/*,video/*";
    picker.onchange = () => {
      const file = picker.files?.[0];
      if (!file) return;

      const isVideoFile =
        file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|ogv|avi|mkv)$/i.test(file.name);

      const insertImportedFrame = (src: string, width: number, height: number, sourceTimestamp?: number) => {
        const committedLayers = commitControlsToActiveEffect() ?? cloneLayers(layersRef.current);
        const imported = makeAnimationFrame({
          id: makeFrameId(),
          src,
          width,
          height,
          layers: cloneLayers(committedLayers),
          activeLayerId: activeLayerIdRef.current,
          isKeyframe: true,
          sourceTimestamp,
        });

        setFrames((prev) => {
          const next = [...prev];
          const insertAt = Math.min(selectedFrameIndex + 1, prev.length);
          next.splice(insertAt, 0, imported);
          return next;
        });
        setSelectedFrameIndex((prev) => Math.min(prev + 1, frames.length));
        setSelectedFrameIds(new Set([imported.id]));
        setStatus("Frame imported");
        toast.success(`Imported: ${file.name}`);
      };

      if (isVideoFile) {
        void (async () => {
          try {
            const extracted = await extractSingleVideoFrame(file, 0);
            const image = await rgbaToImage(extracted.rgba, extracted.width, extracted.height);
            insertImportedFrame(image.src, extracted.width, extracted.height, 0);
          } catch (error) {
            console.error("Failed to import video frame", error);
            toast.error("Failed to import video frame");
          }
        })();
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        const src = String(event.target?.result ?? "");
        if (!src) return;

        try {
          const image = await loadImageFromSrc(src);
          insertImportedFrame(src, image.width, image.height);
        } catch (error) {
          console.error("Failed to import animation frame", error);
          toast.error("Failed to import frame");
        }
      };
      reader.readAsDataURL(file);
    };
    picker.click();
  }, [activeLayerIdRef, commitControlsToActiveEffect, frames.length, layersRef, selectedFrameIndex, setFrames, setSelectedFrameIds, setSelectedFrameIndex, setStatus, workspaceMode]);

  const handleDeleteSelectedFrame = useCallback(() => {
    if (frames.length <= 1) {
      toast.error("Cannot delete the last frame");
      return;
    }

    const removeIndex = selectedFrameIndex;
    const removedFrameId = framesRef.current[removeIndex]?.id ?? null;
    setFrames((prev) => prev.filter((_, i) => i !== removeIndex));
    setSelectedFrameIndex((current) =>
      current > removeIndex ? current - 1 : Math.min(current, frames.length - 2),
    );
    setSelectedFrameIds((prev) => {
      const next = new Set<string>();
      for (const frameId of prev) {
        if (frameId !== removedFrameId) next.add(frameId);
      }
      const fallbackId = framesRef.current[removeIndex + 1]?.id ?? framesRef.current[removeIndex - 1]?.id;
      if (next.size === 0 && fallbackId) next.add(fallbackId);
      return next;
    });
    setIsPlaying(false);
    setStatus("Frame deleted");
    toast.success("Frame removed");
  }, [frames.length, framesRef, selectedFrameIndex, setFrames, setIsPlaying, setSelectedFrameIds, setSelectedFrameIndex, setStatus]);

  const handleSelectFrame = useCallback((index: number) => {
    const currentLayers = commitControlsToActiveEffect() ?? cloneLayers(layersRef.current);
    setFrames((prev) =>
      prev.map((f, i) =>
        i === selectedFrameIndex
          ? {
              ...f,
              layers: currentLayers,
              activeLayerId: activeLayerIdRef.current,
              isKeyframe: true,
            }
          : f,
      ),
    );

    const enteringFrame = framesRef.current[index];
    if (enteringFrame) {
      setLayers(cloneLayers(enteringFrame.layers));
      setActiveLayerId(enteringFrame.activeLayerId ?? enteringFrame.layers[0]?.id ?? "");
      const targetLayer = enteringFrame.layers.find((layer) => layer.id === (enteringFrame.activeLayerId ?? enteringFrame.layers[0]?.id)) ?? enteringFrame.layers[0] ?? null;
      applyLayerSnapshotToControls(targetLayer);
    }

    setSelectedFrameIndex(index);
    const nextSelected = framesRef.current[index];
    setSelectedFrameIds(new Set(nextSelected ? [nextSelected.id] : []));
    setIsPlaying(false);
  }, [activeLayerIdRef, applyLayerSnapshotToControls, commitControlsToActiveEffect, framesRef, layersRef, selectedFrameIndex, setActiveLayerId, setFrames, setIsPlaying, setLayers, setSelectedFrameIds, setSelectedFrameIndex]);

  const handleMultiSelectFrame = useCallback((frameId: string, addToSelection: boolean) => {
    if (addToSelection) {
      setSelectedFrameIds((prev) => {
        const next = new Set(prev);
        if (next.has(frameId)) next.delete(frameId);
        else next.add(frameId);
        return next;
      });
    } else {
      setSelectedFrameIds(new Set([frameId]));
      const index = framesRef.current.findIndex((frame) => frame.id === frameId);
      if (index >= 0) handleSelectFrame(index);
    }
  }, [framesRef, handleSelectFrame, setSelectedFrameIds]);

  const handleApplyToSelected = useCallback(() => {
    const committedLayers = commitControlsToActiveEffect() ?? cloneLayers(layersRef.current);
    const currentFrameId = framesRef.current[selectedFrameIndex]?.id;
    const targets = selectedFrameIds.size > 0 ? selectedFrameIds : new Set(currentFrameId ? [currentFrameId] : []);
    setFrames((prev) =>
      prev.map((f) =>
        targets.has(f.id)
          ? {
              ...f,
              layers: cloneLayers(committedLayers),
              activeLayerId: activeLayerIdRef.current,
              isKeyframe: true,
            }
          : f,
      ),
    );
    const count = targets.size;
    if (currentFrameId) {
      void renderFramePreview(currentFrameId, cloneLayers(committedLayers), null, true);
    }
    setStatus(`Layer snapshot saved to ${count} frame(s) as keyframes`);
    toast.success(`Applied to ${count} frame(s) — marked as keyframes`);
  }, [activeLayerIdRef, commitControlsToActiveEffect, framesRef, layersRef, renderFramePreview, selectedFrameIds, selectedFrameIndex, setFrames, setStatus]);

  const handleInterpolateSelected = useCallback(async () => {
    const sorted = Array.from(selectedFrameIds)
      .map((frameId) => framesRef.current.findIndex((frame) => frame.id === frameId))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b);
    if (sorted.length < 2) {
      toast.error("Select at least 2 frames to interpolate");
      return;
    }
    const fromIdx = sorted[0]!;
    const toIdx = sorted[sorted.length - 1]!;

    const currentLayersSnapshot = commitControlsToActiveEffect() ?? cloneLayers(layersRef.current);
    setFrames((prev) => {
      const withSavedCurrent = prev.map((frame, index) => (
        index === selectedFrameIndex
            ? {
              ...frame,
              layers: currentLayersSnapshot,
              activeLayerId: activeLayerIdRef.current,
              isKeyframe: true,
              previewDataUrl: frame.previewDataUrl,
            }
          : frame
      ));
      return interpolateFrameRangeByKeyframes(withSavedCurrent, sorted, "linear");
    });

    const count = toIdx - fromIdx + 1;
    setStatus(`Interpolated ${count} frames`);
    toast.success(`Interpolated ${count} frames`);

    const latestFrames = interpolateFrameRangeByKeyframes(
      framesRef.current.map((frame, index) => (
        index === selectedFrameIndex
          ? {
              ...frame,
              layers: currentLayersSnapshot,
              activeLayerId: activeLayerIdRef.current,
              isKeyframe: true,
            }
          : frame
      )),
      sorted,
      "linear",
    );

    for (let i = fromIdx; i <= toIdx; i += 1) {
      const frame = latestFrames[i];
      if (!frame) continue;
      void renderFramePreview(frame.id, frame.layers);
    }
  }, [commitControlsToActiveEffect, framesRef, layersRef, renderFramePreview, selectedFrameIds, selectedFrameIndex, setFrames, setStatus]);

  const handleToggleKeyframe = useCallback((index: number) => {
    setFrames((prev) =>
      prev.map((f, i) =>
        i === index ? { ...f, isKeyframe: !f.isKeyframe } : f,
      ),
    );
  }, [setFrames]);

  return {
    handleAddFrameClone,
    handleImportAnimationFrame,
    handleDeleteSelectedFrame,
    handleSelectFrame,
    handleMultiSelectFrame,
    handleApplyToSelected,
    handleInterpolateSelected,
    handleToggleKeyframe,
  };
}
