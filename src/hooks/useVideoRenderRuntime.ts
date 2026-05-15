import { useCallback, useMemo } from "react";
import { cancelVideoJobV2, renderVideoJobV2 } from "@/lib/tauriBridge";

interface UseVideoRenderRuntimeArgs {
  enabled: boolean;
}

export function useVideoRenderRuntime({ enabled }: UseVideoRenderRuntimeArgs) {
  const startRenderJob = useCallback(async (args: {
    videoId: string;
    startFrame: number;
    endFrame: number;
    fps: number;
    outputFormat: "gif" | "dykframes" | "mp4";
    inputPath?: string;
    outputPath?: string;
    layers?: unknown[];
    tracks?: unknown[];
    keepAudio?: boolean;
  }) => {
    if (!enabled) return null;
    return renderVideoJobV2({
      version: 1,
      video_id: args.videoId,
      start_frame: args.startFrame,
      end_frame: args.endFrame,
      fps: args.fps,
      output_format: args.outputFormat,
      input_path: args.inputPath,
      output_path: args.outputPath,
      layers: args.layers,
      tracks: args.tracks,
      keep_audio: args.keepAudio,
    });
  }, [enabled]);

  const cancelRenderJob = useCallback(async (jobId: string) => {
    if (!enabled) return null;
    return cancelVideoJobV2(jobId);
  }, [enabled]);

  return useMemo(
    () => ({
      enabled,
      startRenderJob,
      cancelRenderJob,
    }),
    [enabled, startRenderJob, cancelRenderJob],
  );
}

