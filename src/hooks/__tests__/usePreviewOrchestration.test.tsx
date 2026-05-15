import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePreviewOrchestration } from "@/hooks/usePreviewOrchestration";

class MockCanvasContext2D {
  drawImage = vi.fn();
  getImageData = vi.fn(() => ({ data: new Uint8ClampedArray(16) }));
  putImageData = vi.fn();
}

class MockImageElement {
  width = 4;
  height = 4;
  currentSrc = "data:image/png;base64,source";
  onload: (() => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;

  set src(value: string) {
    this.currentSrc = value;
    queueMicrotask(() => this.onload?.());
  }

  get src() {
    return this.currentSrc;
  }
}

describe("usePreviewOrchestration", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const originalImage = globalThis.Image;
  const originalImageData = globalThis.ImageData;

  beforeEach(() => {
    vi.useFakeTimers();

    HTMLCanvasElement.prototype.getContext = vi.fn(() => new MockCanvasContext2D() as unknown as CanvasRenderingContext2D);
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,processed");
    globalThis.Image = MockImageElement as unknown as typeof Image;

    if (!globalThis.ImageData) {
      globalThis.ImageData = class {
        data: Uint8ClampedArray;
        width: number;
        height: number;

        constructor(data: Uint8ClampedArray, width: number, height: number) {
          this.data = data;
          this.width = width;
          this.height = height;
        }
      } as unknown as typeof ImageData;
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    globalThis.Image = originalImage;
    globalThis.ImageData = originalImageData;
  });

  it("re-runs image preview when layer payload changes and catches up with an accurate pass", async () => {
    const processImage = vi.fn(async () => ({
      buffer: new Uint8Array([255, 0, 0, 255]).buffer,
      width: 1,
      height: 1,
    }));
    const setProcessedImage = vi.fn();
    const setProcessedRgba = vi.fn();
    const setShowOriginal = vi.fn();
    const setStatus = vi.fn();
    const setPreviewProcessing = vi.fn();
    const renderInspectorPreview = vi.fn().mockResolvedValue(undefined);

    const sourceImage = new MockImageElement() as unknown as HTMLImageElement;

    const { rerender } = renderHook(
      (props: { activeLayersPayload: unknown[] }) => usePreviewOrchestration({
        originalImage: sourceImage,
        workspaceMode: "image",
        isPlaying: false,
        videoPreviewBusy: false,
        activeLayersPayload: props.activeLayersPayload,
        processImage,
        setProcessedRgba,
        renderInspectorPreview,
        setProcessedImage,
        setShowOriginal,
        setStatus,
        setPreviewProcessing,
        maxPreviewPx: 512,
      }),
      { initialProps: { activeLayersPayload: [{ id: "layer-1", intensity: 50 }] } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      await Promise.resolve();
    });

    expect(processImage).toHaveBeenCalledTimes(1);

    rerender({ activeLayersPayload: [{ id: "layer-1", intensity: 80 }] });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      await Promise.resolve();
    });

    expect(processImage).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
      await Promise.resolve();
    });

    expect(processImage).toHaveBeenCalledTimes(3);
    expect(renderInspectorPreview).not.toHaveBeenCalled();
    expect(setProcessedRgba).toHaveBeenCalledTimes(3);
    expect(setProcessedImage).not.toHaveBeenCalled();
    expect(setShowOriginal).toHaveBeenCalledWith(false);
    expect(setPreviewProcessing).toHaveBeenCalledWith(true);
    expect(setPreviewProcessing).toHaveBeenCalledWith(false);
  });

  it("skips the delayed accurate catch-up for oversized image previews", async () => {
    const processImage = vi.fn(async () => ({
      buffer: new Uint8Array([0, 255, 0, 255]).buffer,
      width: 1,
      height: 1,
    }));
    const setProcessedImage = vi.fn();
    const setProcessedRgba = vi.fn();
    const setShowOriginal = vi.fn();
    const setStatus = vi.fn();
    const setPreviewProcessing = vi.fn();
    const renderInspectorPreview = vi.fn().mockResolvedValue(undefined);

    const sourceImage = new MockImageElement() as unknown as HTMLImageElement;
    sourceImage.width = 2200;
    sourceImage.height = 1600;

    renderHook(() => usePreviewOrchestration({
      originalImage: sourceImage,
      workspaceMode: "image",
      isPlaying: false,
      videoPreviewBusy: false,
      activeLayersPayload: [{ id: "layer-1", intensity: 50 }],
      processImage,
      setProcessedRgba,
      renderInspectorPreview,
      setProcessedImage,
      setShowOriginal,
      setStatus,
      setPreviewProcessing,
      maxPreviewPx: 512,
    }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      await Promise.resolve();
    });

    expect(processImage).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    expect(processImage).toHaveBeenCalledTimes(1);
    expect(setProcessedRgba).toHaveBeenCalledTimes(1);
    expect(setProcessedImage).not.toHaveBeenCalled();
    expect(renderInspectorPreview).not.toHaveBeenCalled();
  });
});