import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useVideoPlaybackOrchestration } from "@/hooks/useVideoPlaybackOrchestration";
import type { VideoMetadataLike } from "@/lib/mediaWorkflow";

const videoMetadata: VideoMetadataLike = {
  width: 1920,
  height: 1080,
  fps: 30,
  duration_seconds: 10,
  estimated_frame_count: 300,
  has_audio: false,
};

describe("useVideoPlaybackOrchestration", () => {
  it("computes effective playback bounds from metadata", () => {
    const setVideoPlaying = vi.fn();
    const setVideoPlayheadFrameIndex = vi.fn();
    const setShowOriginal = vi.fn();

    const { result } = renderHook(() =>
      useVideoPlaybackOrchestration({
        enabled: true,
        workspaceMode: "video",
        videoSource: null,
        videoMetadata,
        videoPreviewFrameCount: 12,
        videoPreviewBusy: false,
        videoPlaying: false,
        setVideoPlaying,
        videoLoopEnabled: false,
        videoInFrame: null,
        videoOutFrame: null,
        videoPlayheadFrameIndex: 0,
        setVideoPlayheadFrameIndex,
        videoLayerTracks: [],
        setShowOriginal,
        masterClockEnabled: false,
      }),
    );

    expect(result.current.estimatedVideoFps).toBe(30);
    expect(result.current.estimatedVideoTotalFrames).toBe(300);
    expect(result.current.effectiveVideoInFrame).toBe(0);
    expect(result.current.effectiveVideoOutFrame).toBe(299);
  });

  it("toggles playback and hides the original frame when starting playback", () => {
    const setVideoPlaying = vi.fn();
    const setVideoPlayheadFrameIndex = vi.fn();
    const setShowOriginal = vi.fn();

    const { result } = renderHook(() =>
      useVideoPlaybackOrchestration({
        enabled: true,
        workspaceMode: "video",
        videoSource: null,
        videoMetadata,
        videoPreviewFrameCount: 12,
        videoPreviewBusy: false,
        videoPlaying: false,
        setVideoPlaying,
        videoLoopEnabled: false,
        videoInFrame: null,
        videoOutFrame: null,
        videoPlayheadFrameIndex: 0,
        setVideoPlayheadFrameIndex,
        videoLayerTracks: [],
        setShowOriginal,
        masterClockEnabled: false,
      }),
    );

    act(() => {
      result.current.handleToggleVideoPlayback();
    });

    expect(setVideoPlaying).toHaveBeenCalledTimes(1);

    const updater = setVideoPlaying.mock.calls[0]?.[0] as ((prev: boolean) => boolean) | undefined;
    expect(updater).toBeTypeOf("function");
    expect(updater?.(false)).toBe(true);
    expect(updater?.(true)).toBe(false);
    expect(setShowOriginal).toHaveBeenCalledWith(false);
  });
});
