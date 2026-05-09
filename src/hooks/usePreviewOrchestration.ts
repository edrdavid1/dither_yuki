import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";

export interface UsePreviewOrchestrationArgs {
  originalImage: HTMLImageElement | null;
  workspaceMode: string;
  isPlaying: boolean;
  videoPreviewBusy: boolean;
  activeLayersPayload: unknown[];
  processImage: (imageData: ImageData, layers: unknown[]) => Promise<{ buffer: ArrayBuffer; width: number; height: number }>;
  renderInspectorPreview: (
    sourceImage: HTMLImageElement,
    preferBackend: boolean,
    quality?: "fast" | "accurate",
  ) => Promise<void>;
  setProcessedImage: Dispatch<SetStateAction<HTMLImageElement | null>>;
  setShowOriginal: Dispatch<SetStateAction<boolean>>;
  setStatus: (status: string) => void;
  setPreviewProcessing: Dispatch<SetStateAction<boolean>>;
  maxPreviewPx: number;
  accuratePreviewMaxPixels?: number;
  onPreviewQualityChange?: (quality: "fast" | "accurate") => void;
  onPreviewLatencyMeasured?: (latencyMs: number, quality: "fast" | "accurate") => void;
}

export function usePreviewOrchestration({
  originalImage,
  workspaceMode,
  isPlaying,
  videoPreviewBusy,
  activeLayersPayload,
  processImage,
  renderInspectorPreview,
  setProcessedImage,
  setShowOriginal,
  setStatus,
  setPreviewProcessing,
  maxPreviewPx,
  accuratePreviewMaxPixels = 3_000_000,
  onPreviewQualityChange,
  onPreviewLatencyMeasured,
}: UsePreviewOrchestrationArgs) {
  const previewDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accuratePreviewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightPreviewRef = useRef(false);
  const queuedPreviewRef = useRef<{
    mode: "image" | "video" | "animation";
    image: HTMLImageElement;
    quality: "fast" | "accurate";
  } | null>(null);

  const handleApplyFilter = useCallback(async (
    sourceImage: HTMLImageElement,
    quality: "fast" | "accurate" = "fast",
  ) => {
    const startedAt = performance.now();
    if (!sourceImage) {
      toast.error("Please load an image first!");
      return;
    }

    setPreviewProcessing(true);

    try {
      const canvas = document.createElement("canvas");
      const maxDimension = quality === "fast" ? maxPreviewPx : Math.max(sourceImage.width, sourceImage.height);
      const previewScale = Math.min(1, maxDimension / Math.max(sourceImage.width, sourceImage.height));
      canvas.width = Math.round(sourceImage.width * previewScale);
      canvas.height = Math.round(sourceImage.height * previewScale);
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        toast.error("Failed to create canvas context");
        return;
      }

      ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const { buffer, width, height } = await processImage(imageData, activeLayersPayload);

      const resultData = new ImageData(new Uint8ClampedArray(buffer), width, height);
      canvas.width = width;
      canvas.height = height;
      ctx.putImageData(resultData, 0, 0);

      const processedImg = new Image();
      processedImg.onload = () => {
        setProcessedImage(processedImg);
        setShowOriginal(false);
        onPreviewQualityChange?.(quality);
        onPreviewLatencyMeasured?.(Math.round(performance.now() - startedAt), quality);
      };
      processedImg.src = canvas.toDataURL();
    } catch (error) {
      console.error("Error applying filter:", error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to apply filter${message ? `: ${message}` : ""}`);
    } finally {
      setPreviewProcessing(false);
    }
  }, [activeLayersPayload, maxPreviewPx, onPreviewLatencyMeasured, onPreviewQualityChange, processImage, setPreviewProcessing, setProcessedImage, setShowOriginal]);

  const runPreviewQueue = useCallback(async () => {
    if (inFlightPreviewRef.current) return;
    const next = queuedPreviewRef.current;
    if (!next) return;

    queuedPreviewRef.current = null;
    inFlightPreviewRef.current = true;

    try {
      if (next.mode === "image") {
        await handleApplyFilter(next.image, next.quality);
      } else {
        await renderInspectorPreview(next.image, true, next.quality);
      }
    } finally {
      inFlightPreviewRef.current = false;
      if (queuedPreviewRef.current) {
        void runPreviewQueue();
      }
    }
  }, [handleApplyFilter, renderInspectorPreview]);

  const schedulePreview = useCallback((
    mode: "image" | "video" | "animation",
    image: HTMLImageElement,
    quality: "fast" | "accurate" = "fast",
  ) => {
    queuedPreviewRef.current = { mode, image, quality };
    if (previewDebounceTimerRef.current) clearTimeout(previewDebounceTimerRef.current);
    previewDebounceTimerRef.current = setTimeout(() => {
      void runPreviewQueue();
    }, 180);
  }, [runPreviewQueue]);

  const scheduleAccuratePreview = useCallback((
    mode: "image" | "video" | "animation",
    image: HTMLImageElement,
  ) => {
    const totalPixels = Math.max(1, image.width) * Math.max(1, image.height);
    if (totalPixels > accuratePreviewMaxPixels) {
      return;
    }
    if (accuratePreviewDebounceRef.current) clearTimeout(accuratePreviewDebounceRef.current);
    accuratePreviewDebounceRef.current = setTimeout(() => {
      schedulePreview(mode, image, "accurate");
    }, 700);
  }, [accuratePreviewMaxPixels, schedulePreview]);

  useEffect(() => {
    if (!originalImage || workspaceMode !== "image") return;
    schedulePreview("image", originalImage, "fast");
    scheduleAccuratePreview("image", originalImage);
    return () => {
      if (previewDebounceTimerRef.current) clearTimeout(previewDebounceTimerRef.current);
      if (accuratePreviewDebounceRef.current) clearTimeout(accuratePreviewDebounceRef.current);
    };
  }, [originalImage, scheduleAccuratePreview, schedulePreview, workspaceMode]);

  useEffect(() => {
    if (!originalImage || workspaceMode !== "video" || videoPreviewBusy) {
      return;
    }
    schedulePreview("video", originalImage, "fast");
    scheduleAccuratePreview("video", originalImage);
    return () => {
      if (previewDebounceTimerRef.current) clearTimeout(previewDebounceTimerRef.current);
      if (accuratePreviewDebounceRef.current) clearTimeout(accuratePreviewDebounceRef.current);
    };
  }, [activeLayersPayload, originalImage, scheduleAccuratePreview, schedulePreview, videoPreviewBusy, workspaceMode]);

  useEffect(() => {
    if (!originalImage || workspaceMode !== "animation" || isPlaying) {
      return;
    }
    schedulePreview("animation", originalImage, "fast");
    scheduleAccuratePreview("animation", originalImage);
    return () => {
      if (previewDebounceTimerRef.current) clearTimeout(previewDebounceTimerRef.current);
      if (accuratePreviewDebounceRef.current) clearTimeout(accuratePreviewDebounceRef.current);
    };
  }, [activeLayersPayload, isPlaying, originalImage, scheduleAccuratePreview, schedulePreview, workspaceMode]);

  useEffect(() => () => {
    if (previewDebounceTimerRef.current) {
      clearTimeout(previewDebounceTimerRef.current);
      previewDebounceTimerRef.current = null;
    }
    if (accuratePreviewDebounceRef.current) {
      clearTimeout(accuratePreviewDebounceRef.current);
      accuratePreviewDebounceRef.current = null;
    }
  }, []);

  return { handleApplyFilter };
}
