import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import { type VideoMetadataLike } from "@/lib/mediaWorkflow";
import { resolveVideoPlaybackFrameCount } from "@/lib/videoRuntime/playback";
import type { LayerTrack } from "@/lib/videoRuntime/layerTracks";
import type { VideoRgbaSurface } from "@/hooks/useVideoMediaSession";

interface UseVideoPlaybackOrchestrationArgs {
  enabled: boolean;
  workspaceMode: string;
  videoSource: File | null;
  videoMetadata: VideoMetadataLike | null;
  videoPreviewFrameCount: number;
  videoPreviewBusy: boolean;
  videoPlaying: boolean;
  setVideoPlaying: Dispatch<SetStateAction<boolean>>;
  videoLoopEnabled: boolean;
  videoInFrame: number | null;
  videoOutFrame: number | null;
  videoPlayheadFrameIndex: number;
  setVideoPlayheadFrameIndex: Dispatch<SetStateAction<number>>;
  videoLayerTracks?: LayerTrack[];
  captureColorPipelineSnapshot?: () => unknown;
  setVideoProcessedRgba?: Dispatch<SetStateAction<VideoRgbaSurface | null>>;
  setVideoProcessingMs?: Dispatch<SetStateAction<number | null>>;
  setPreviewQuality?: Dispatch<SetStateAction<"fast" | "accurate">>;
  setShowOriginal: Dispatch<SetStateAction<boolean>>;
  masterClockEnabled?: boolean;
  masterClockAwaitingFirstTick?: boolean;
}

interface UseVideoPlaybackOrchestrationResult {
  estimatedVideoFps: number;
  estimatedVideoTotalFrames: number;
  effectiveVideoInFrame: number;
  effectiveVideoOutFrame: number;
  handleToggleVideoPlayback: () => void;
}

export function useVideoPlaybackOrchestration({
  videoMetadata,
  videoPreviewFrameCount,
  setVideoPlaying,
  videoInFrame,
  videoOutFrame,
  setShowOriginal,
}: UseVideoPlaybackOrchestrationArgs): UseVideoPlaybackOrchestrationResult {
  const estimatedVideoFps = useMemo(
    () => (videoMetadata?.fps && videoMetadata.fps > 0 ? videoMetadata.fps : 30),
    [videoMetadata],
  );

  const estimatedVideoTotalFrames = useMemo(
    () => resolveVideoPlaybackFrameCount(videoMetadata, videoPreviewFrameCount, estimatedVideoFps),
    [estimatedVideoFps, videoMetadata, videoPreviewFrameCount],
  );

  const effectiveVideoInFrame = videoInFrame ?? 0;
  const effectiveVideoOutFrame = videoOutFrame ?? Math.max(0, estimatedVideoTotalFrames - 1);

  const handleToggleVideoPlayback = useCallback(() => {
    setVideoPlaying((prev) => {
      const next = !prev;
      if (next) {
        setShowOriginal(false);
      }
      return next;
    });
  }, [setShowOriginal, setVideoPlaying]);

  // Note: the old JS interval and playback prefetch loops are gone.
  // Live playback is now driven by the Rust master clock plus the
  // binary pull-stream loop in `useVideoCanvas.ts`.

  return useMemo(
    () => ({
      estimatedVideoFps,
      estimatedVideoTotalFrames,
      effectiveVideoInFrame,
      effectiveVideoOutFrame,
      handleToggleVideoPlayback,
    }),
    [
      effectiveVideoInFrame,
      effectiveVideoOutFrame,
      estimatedVideoFps,
      estimatedVideoTotalFrames,
      handleToggleVideoPlayback,
    ],
  );
}
