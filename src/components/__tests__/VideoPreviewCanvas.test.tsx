import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { VideoPreviewCanvas } from "@/components/VideoPreviewCanvas";

const tauriBridgeMock = vi.hoisted(() => ({
  getFilteredFrameBinaryV2: vi.fn(),
}));

const mediaWorkflowMock = vi.hoisted(() => ({
  getNativeFilePath: vi.fn(() => "/tmp/video.mp4"),
  extractSingleVideoFrame: vi.fn(),
}));

vi.mock("@/lib/tauriBridge", () => ({
  getFilteredFrameBinaryV2: tauriBridgeMock.getFilteredFrameBinaryV2,
}));

vi.mock("@/lib/mediaWorkflow", () => ({
  getNativeFilePath: mediaWorkflowMock.getNativeFilePath,
  extractSingleVideoFrame: mediaWorkflowMock.extractSingleVideoFrame,
}));

vi.mock("@/lib/videoRuntime/hash", () => ({
  createHash: vi.fn(() => "hash"),
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!("ResizeObserver" in globalThis)) {
  (globalThis as { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
}

const canvasContext = {
  putImageData: vi.fn(),
};

beforeEach(() => {
  canvasContext.putImageData.mockClear();

  tauriBridgeMock.getFilteredFrameBinaryV2.mockResolvedValue({
    meta: {
      videoId: "sample-video",
      frameIndex: 12,
      width: 2,
      height: 4,
      cacheHit: false,
      processingMs: 8,
      backendUsed: "cpu",
      fallbackUsed: false,
      qualityMode: "fast",
      scale: 0.25,
      transportRequestId: null,
    },
    rgba: new Uint8ClampedArray(2 * 4 * 4).fill(255),
  });

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext as never);

  if (typeof globalThis.ImageData === "undefined") {
    class ImageDataMock {
      data: Uint8ClampedArray;
      width: number;
      height: number;

      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    }

    (globalThis as { ImageData?: typeof ImageDataMock }).ImageData = ImageDataMock;
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VideoPreviewCanvas", () => {
  it("upscales processed frames to the display size and hides the raw layer after the first processed draw", async () => {
    const videoSource = new File(["video"], "sample.mp4", { type: "video/mp4" });
    const originalRgba = {
      width: 8,
      height: 16,
      rgba: new Uint8ClampedArray(8 * 16 * 4).fill(128),
    };

    const { container } = render(
      <VideoPreviewCanvas
        enabled={true}
        videoSource={videoSource}
        videoId="sample-video"
        videoMetadata={{ width: 8, height: 16, fps: 30 }}
        videoPlayheadFrameIndex={12}
        videoPlaying={true}
        videoFps={30}
        layerPayload={[]}
        layerTracks={[]}
        processingBackend="cpu"
        showOriginal={false}
        originalRgba={originalRgba}
      />,
    );

    const canvases = container.querySelectorAll("canvas");
    expect(canvases).toHaveLength(2);

    const originalCanvas = canvases[0] as HTMLCanvasElement;
    const processedCanvas = canvases[1] as HTMLCanvasElement;

    await waitFor(() => {
      expect(processedCanvas.style.width).toBe("8px");
      expect(processedCanvas.style.height).toBe("16px");
      expect(processedCanvas.width).toBe(2);
      expect(processedCanvas.height).toBe(4);
      expect(originalCanvas.style.opacity).toBe("0");
      expect(processedCanvas.style.opacity).toBe("1");
    });
  });

  it("keeps the previous processed frame visible instead of drawing a raw fallback frame", async () => {
    tauriBridgeMock.getFilteredFrameBinaryV2.mockResolvedValueOnce(null);
    mediaWorkflowMock.getNativeFilePath.mockReturnValueOnce(null);
    mediaWorkflowMock.extractSingleVideoFrame.mockResolvedValueOnce({
      width: 2,
      height: 4,
      rgba: new Uint8ClampedArray(2 * 4 * 4).fill(64),
    });

    const videoSource = new File(["video"], "sample.mp4", { type: "video/mp4" });
    const originalRgba = {
      width: 8,
      height: 16,
      rgba: new Uint8ClampedArray(8 * 16 * 4).fill(128),
    };

    const { container } = render(
      <VideoPreviewCanvas
        enabled={true}
        videoSource={videoSource}
        videoId="sample-video"
        videoMetadata={{ width: 8, height: 16, fps: 30 }}
        videoPlayheadFrameIndex={12}
        videoPlaying={true}
        videoFps={30}
        layerPayload={[]}
        layerTracks={[]}
        processingBackend="cpu"
        showOriginal={false}
        originalRgba={originalRgba}
      />,
    );

    const canvases = container.querySelectorAll("canvas");
    expect(canvases).toHaveLength(2);

    const originalCanvas = canvases[0] as HTMLCanvasElement;
    const processedCanvas = canvases[1] as HTMLCanvasElement;

    await waitFor(() => {
      expect(originalCanvas.style.opacity).toBe("1");
      expect(processedCanvas.style.opacity).toBe("0");
      expect(canvasContext.putImageData).toHaveBeenCalledTimes(1);
    });
  });
});
