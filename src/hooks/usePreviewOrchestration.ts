import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";

export interface UsePreviewOrchestrationArgs {
  originalImage: HTMLImageElement | null;
  workspaceMode: string;
  isPlaying: boolean;
  videoPreviewBusy: boolean;
  activeLayersPayload: unknown[];
  processImage: (imageData: ImageData, layers: unknown[]) => Promise<{ buffer: ArrayBuffer; width: number; height: number }>;
  renderInspectorPreview: (sourceImage: HTMLImageElement, preferBackend: boolean) => Promise<void>;
  setProcessedImage: Dispatch<SetStateAction<HTMLImageElement | null>>;
  setShowOriginal: Dispatch<SetStateAction<boolean>>;
  setStatus: (status: string) => void;
  setPreviewProcessing: Dispatch<SetStateAction<boolean>>;
  maxPreviewPx: number;
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
}: UsePreviewOrchestrationArgs) {
  const previewDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleApplyFilter = async () => {
    if (!originalImage) {
      toast.error("Please load an image first!");
      return;
    }

    setPreviewProcessing(true);

    try {
      const canvas = document.createElement("canvas");
      const previewScale = Math.min(1, maxPreviewPx / Math.max(originalImage.width, originalImage.height));
      canvas.width = Math.round(originalImage.width * previewScale);
      canvas.height = Math.round(originalImage.height * previewScale);
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        toast.error("Failed to create canvas context");
        return;
      }

      ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
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
      };
      processedImg.src = canvas.toDataURL();
    } catch (error) {
      console.error("Error applying filter:", error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to apply filter${message ? `: ${message}` : ""}`);
    } finally {
      setPreviewProcessing(false);
    }
  };

  useEffect(() => {
    if (!originalImage || workspaceMode !== "image") return;
    if (previewDebounceTimerRef.current) clearTimeout(previewDebounceTimerRef.current);
    previewDebounceTimerRef.current = setTimeout(() => { void handleApplyFilter(); }, 180);
    return () => {
      if (previewDebounceTimerRef.current) clearTimeout(previewDebounceTimerRef.current);
    };
  }, [handleApplyFilter, originalImage, workspaceMode]);

  useEffect(() => {
    if (!originalImage || workspaceMode !== "video" || videoPreviewBusy) {
      return;
    }
    if (previewDebounceTimerRef.current) clearTimeout(previewDebounceTimerRef.current);
    previewDebounceTimerRef.current = setTimeout(() => {
      void renderInspectorPreview(originalImage, true);
    }, 180);
    return () => {
      if (previewDebounceTimerRef.current) clearTimeout(previewDebounceTimerRef.current);
    };
  }, [activeLayersPayload, originalImage, renderInspectorPreview, videoPreviewBusy, workspaceMode]);

  useEffect(() => {
    if (!originalImage || workspaceMode !== "animation" || isPlaying) {
      return;
    }
    if (previewDebounceTimerRef.current) clearTimeout(previewDebounceTimerRef.current);
    previewDebounceTimerRef.current = setTimeout(() => {
      void renderInspectorPreview(originalImage, true);
    }, 180);
    return () => {
      if (previewDebounceTimerRef.current) clearTimeout(previewDebounceTimerRef.current);
    };
  }, [activeLayersPayload, isPlaying, originalImage, renderInspectorPreview, workspaceMode]);

  useEffect(() => () => {
    if (previewDebounceTimerRef.current) {
      clearTimeout(previewDebounceTimerRef.current);
      previewDebounceTimerRef.current = null;
    }
  }, []);

  return { handleApplyFilter };
}
