export const VIDEO_CONTRACT_VERSION = 1 as const;

export type VideoProcessingBackend = "cpu" | "gpu";
export type VideoQualityMode = "fast" | "accurate";
export type VideoTransportMode = "playback" | "scrub";

export interface VideoFrameRequestV1 {
  version: 1;
  videoId: string;
  frameIndex: number;
  qualityMode?: VideoQualityMode;
  scale?: number;
  width: number;
  height: number;
  frameRgba: number[];
  layerSnapshotHash?: string;
  layerPayload: unknown[];
  processingBackend?: VideoProcessingBackend;
  transportRequestId?: string;
  transportMode?: VideoTransportMode;
}

export interface VideoFrameResponseV1 {
  version: 1;
  videoId: string;
  frameIndex: number;
  width: number;
  height: number;
  rgba: number[];
  cacheHit: boolean;
  processingMs: number;
  backendUsed: VideoProcessingBackend;
  fallbackUsed: boolean;
}

export interface VideoJobRequestV1 {
  videoId: string;
  startFrame: number;
  endFrame: number;
  fps: number;
  outputFormat: "gif" | "dykframes" | "mp4";
}

export interface VideoJobProgressV1 {
  jobId: string;
  status: "queued" | "running" | "completed" | "cancelled" | "failed";
  currentFrame: number;
  totalFrames: number;
  outputPath?: string | null;
}

export interface VideoJobContractV1 {
  version: 1;
  request: VideoJobRequestV1;
  progress: VideoJobProgressV1;
}

