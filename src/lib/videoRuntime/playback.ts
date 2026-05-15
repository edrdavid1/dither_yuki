import type { VideoMetadataLike } from "@/lib/mediaWorkflow";

export const MIN_VIDEO_PLAYBACK_FRAME_COUNT = 2;

export function resolveVideoPlaybackFrameCount(
  videoMetadata: VideoMetadataLike | null | undefined,
  previewFrameCount: number,
  estimatedVideoFps: number,
): number {
  const fallbackPreviewFrameCount = Math.max(MIN_VIDEO_PLAYBACK_FRAME_COUNT, Math.floor(previewFrameCount));
  const normalizedFps = Math.max(1, Math.round(estimatedVideoFps) || 1);

  const metadataFrameCount = videoMetadata?.estimated_frame_count && videoMetadata.estimated_frame_count > 0
    ? videoMetadata.estimated_frame_count
    : videoMetadata?.duration_seconds && videoMetadata.duration_seconds > 0
      ? Math.max(1, Math.round(videoMetadata.duration_seconds * normalizedFps))
      : 0;

  return Math.max(fallbackPreviewFrameCount, metadataFrameCount);
}