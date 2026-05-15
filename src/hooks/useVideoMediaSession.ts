import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import type { WorkspaceMode } from "@/components/WorkspaceModeSwitcher";
import {
  extractVideoFrames,
  extractSingleVideoFrame,
  getNativeFilePath,
  probeVideoFileMetadataLocal,
  rgbaToImage,
  type VideoMetadataLike,
} from "@/lib/mediaWorkflow";
import {
  ensureVideoInputPath,
  generateVideoThumbnails,
  openPlaybackStream,
  closePlaybackStream,
  safeTauriInvoke,
} from "@/lib/tauriBridge";
import { useVideoPlaybackStore } from "@/store/videoPlaybackStore";
import type { LayerTrack } from "@/lib/videoRuntime/layerTracks";

export interface VideoPreviewFrame {
  id: string;
  src: string;
  width: number;
  height: number;
  label: string;
}

export interface VideoRgbaSurface {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

interface UseVideoMediaSessionArgs {
  setOriginalImage: Dispatch<SetStateAction<HTMLImageElement | null>>;
  setProcessedImage: Dispatch<SetStateAction<HTMLImageElement | null>>;
  setImageProcessedRgba: Dispatch<SetStateAction<{ width: number; height: number; rgba: Uint8ClampedArray } | null>>;
  setShowOriginal: Dispatch<SetStateAction<boolean>>;
  setImageSize: Dispatch<SetStateAction<string | undefined>>;
  setStatus: (status: string) => void;
  setWorkflowStatus: (status: string) => void;
  setWorkspaceMode: Dispatch<SetStateAction<WorkspaceMode>>;
  setSourceImageFile?: Dispatch<SetStateAction<File | null>>;
  commitVideoLayerTracks: (nextTracks: LayerTrack[]) => void;
}

export interface UseVideoMediaSessionResult {
  videoSource: File | null;
  setVideoSource: Dispatch<SetStateAction<File | null>>;
  videoMetadata: VideoMetadataLike | null;
  setVideoMetadata: Dispatch<SetStateAction<VideoMetadataLike | null>>;
  videoPreviewFrames: VideoPreviewFrame[];
  setVideoPreviewFrames: Dispatch<SetStateAction<VideoPreviewFrame[]>>;
  selectedVideoPreviewFrame: number;
  setSelectedVideoPreviewFrame: Dispatch<SetStateAction<number>>;
  videoPreviewBusy: boolean;
  setVideoPreviewBusy: Dispatch<SetStateAction<boolean>>;
  videoOriginalRgba: VideoRgbaSurface | null;
  videoProcessedRgba: VideoRgbaSurface | null;
  setVideoOriginalRgba: Dispatch<SetStateAction<VideoRgbaSurface | null>>;
  setVideoProcessedRgba: Dispatch<SetStateAction<VideoRgbaSurface | null>>;
  videoProcessingMs: number | null;
  setVideoProcessingMs: Dispatch<SetStateAction<number | null>>;
  loadVideoFile: (file: File) => Promise<void>;
  clearVideoMediaState: (resetTransport?: boolean) => void;
}

export function useVideoMediaSession({
  setOriginalImage,
  setProcessedImage,
  setImageProcessedRgba,
  setShowOriginal,
  setImageSize,
  setStatus,
  setWorkflowStatus,
  setWorkspaceMode,
  setSourceImageFile,
  commitVideoLayerTracks,
}: UseVideoMediaSessionArgs): UseVideoMediaSessionResult {
  const [videoSource, setVideoSource] = useState<File | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadataLike | null>(null);
  const [videoPreviewFrames, setVideoPreviewFrames] = useState<VideoPreviewFrame[]>([]);
  const [selectedVideoPreviewFrame, setSelectedVideoPreviewFrame] = useState(0);
  const [videoPreviewBusy, setVideoPreviewBusy] = useState(false);
  const [videoOriginalRgba, setVideoOriginalRgba] = useState<VideoRgbaSurface | null>(null);
  const [videoProcessedRgba, setVideoProcessedRgba] = useState<VideoRgbaSurface | null>(null);
  const [videoProcessingMs, setVideoProcessingMs] = useState<number | null>(null);
  const loadRequestIdRef = useRef(0);
  const activeVideoIdRef = useRef<string | null>(null);
  const openingVideoIdRef = useRef<string | null>(null);
  const setPlaybackStreamReady = useVideoPlaybackStore((state) => state.setPlaybackStreamReady);

  const resetPlaybackTransport = useCallback(async () => {
    await safeTauriInvoke("transport_pause");
    await safeTauriInvoke("transport_seek", { frame: 0 });
  }, []);

  const reportPlaybackStreamFailure = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[useVideoMediaSession] playback stream startup failed", message);

    if (/decoding|preflight|ffmpeg|corrupt|nal|eof/i.test(message)) {
      toast.error("Видео повреждено, попробуйте перекодировать");
      setStatus("Видео повреждено, попробуйте перекодировать");
    }
  }, [setStatus]);

  const notifyPlaybackStreamReady = useCallback((videoId: string) => {
    setPlaybackStreamReady(true);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("playback-stream-opened", { detail: { videoId } }));
    }
  }, [setPlaybackStreamReady]);

  const clearVideoMediaState = useCallback(async (resetTransport = true) => {
    loadRequestIdRef.current += 1;
    const previousVideoId = activeVideoIdRef.current;
    activeVideoIdRef.current = null;
    openingVideoIdRef.current = null;
    if (resetTransport) {
      void resetPlaybackTransport();
    }
    setPlaybackStreamReady(false);
    if (previousVideoId) {
      await closePlaybackStream(previousVideoId).catch((error) => {
        console.warn("[useVideoMediaSession] Failed to close playback stream:", error);
      });
    }
    setVideoSource(null);
    setVideoMetadata(null);
    setVideoPreviewFrames([]);
    setSelectedVideoPreviewFrame(0);
    setVideoPreviewBusy(false);
    setVideoProcessingMs(null);
    setVideoOriginalRgba(null);
    setVideoProcessedRgba(null);
    setOriginalImage(null);
    setProcessedImage(null);
    setImageProcessedRgba(null);
    setShowOriginal(true);
    setImageSize(undefined);
    setSourceImageFile?.(null);
    useVideoPlaybackStore.getState().resetPlaybackState();
    commitVideoLayerTracks([]);
  }, [
    commitVideoLayerTracks,
    setImageProcessedRgba,
    setImageSize,
    setOriginalImage,
    setProcessedImage,
    setVideoMetadata,
    setVideoOriginalRgba,
    setVideoPreviewBusy,
    setVideoPreviewFrames,
    setVideoProcessedRgba,
    setVideoProcessingMs,
    setVideoSource,
    setSelectedVideoPreviewFrame,
    setShowOriginal,
    setSourceImageFile,
    setPlaybackStreamReady,
    resetPlaybackTransport,
  ]);

  const loadVideoFile = useCallback(async (file: File) => {
    await resetPlaybackTransport();
    await clearVideoMediaState(false);
    const requestId = ++loadRequestIdRef.current;
    setPlaybackStreamReady(false);

    setVideoSource(file);
    setWorkspaceMode("video");
    setWorkflowStatus(`Video selected: ${file.name}`);
    setStatus(`Video loading preview…`);

    const nativePath = getNativeFilePath(file);
    const backendInputPath = nativePath ?? await ensureVideoInputPath(file);
    let probedMetadata: VideoMetadataLike | null = null;
    const probe = async (): Promise<VideoMetadataLike | null> => {
      if (requestId !== loadRequestIdRef.current) {
        return null;
      }

      if (backendInputPath) {
        const backendMetadata = await safeTauriInvoke<VideoMetadataLike>("probe_video_file_metadata", {
          inputPath: backendInputPath,
        });
        if (requestId !== loadRequestIdRef.current) {
          return null;
        }
        if (backendMetadata) {
          probedMetadata = backendMetadata;
          setVideoMetadata(backendMetadata);
          const videoId = nativePath ?? file.name;
          if (openingVideoIdRef.current === videoId || activeVideoIdRef.current === videoId) {
            console.log("[useVideoMediaSession] open_playback_stream skipped (already active/opening)", {
              videoId,
              openingVideoId: openingVideoIdRef.current,
              activeVideoId: activeVideoIdRef.current,
            });
            if (requestId === loadRequestIdRef.current) {
              notifyPlaybackStreamReady(videoId);
            }
            return backendMetadata;
          }
          try {
            openingVideoIdRef.current = videoId;
            console.log("[useVideoMediaSession] open_playback_stream -> start", {
              videoId,
              inputPath: backendInputPath,
              fps: backendMetadata.fps,
              width: backendMetadata.width,
              height: backendMetadata.height,
            });
            const stream = await openPlaybackStream(
              videoId,
              backendInputPath,
              backendMetadata.fps,
              backendMetadata.width,
              backendMetadata.height,
              [],
              [],
              "",
              "fast",
              0.25,
            );
            console.log("[useVideoMediaSession] open_playback_stream -> result", {
              videoId,
              ok: Boolean(stream),
              stream,
            });
            if (requestId === loadRequestIdRef.current && stream) {
              notifyPlaybackStreamReady(videoId);
              activeVideoIdRef.current = videoId;
            }
          } catch (error) {
            console.warn("[useVideoMediaSession] Failed to open playback stream:", error);
            reportPlaybackStreamFailure(error);
            setPlaybackStreamReady(false);
          } finally {
            if (openingVideoIdRef.current === videoId) {
              openingVideoIdRef.current = null;
            }
          }

          void safeTauriInvoke("load_audio_for_video", { videoId, inputPath: backendInputPath }).catch(
            (err) => console.warn("[useVideoMediaSession] Audio load failed (video-only mode):", err),
          );

          return backendMetadata;
        }
      }

      const fallbackMetadata = await probeVideoFileMetadataLocal(file);
      if (requestId !== loadRequestIdRef.current) {
        return null;
      }
      probedMetadata = fallbackMetadata;
      setVideoMetadata(fallbackMetadata);
      if (backendInputPath) {
        const videoId = nativePath ?? file.name;
        if (openingVideoIdRef.current === videoId || activeVideoIdRef.current === videoId) {
          console.log("[useVideoMediaSession] open_playback_stream fallback skipped (already active/opening)", {
            videoId,
            openingVideoId: openingVideoIdRef.current,
            activeVideoId: activeVideoIdRef.current,
          });
          if (requestId === loadRequestIdRef.current) {
            notifyPlaybackStreamReady(videoId);
          }
          return fallbackMetadata;
        }
        try {
          openingVideoIdRef.current = videoId;
          console.log("[useVideoMediaSession] open_playback_stream (fallback) -> start", {
            videoId,
            inputPath: backendInputPath,
            fps: fallbackMetadata.fps,
            width: fallbackMetadata.width,
            height: fallbackMetadata.height,
          });
          const stream = await openPlaybackStream(
            videoId,
            backendInputPath,
            fallbackMetadata.fps,
            fallbackMetadata.width,
            fallbackMetadata.height,
            [],
            [],
            "",
            "fast",
            0.25,
          );
          console.log("[useVideoMediaSession] open_playback_stream (fallback) -> result", {
            videoId,
            ok: Boolean(stream),
            stream,
          });
          if (requestId === loadRequestIdRef.current && stream) {
            notifyPlaybackStreamReady(videoId);
            activeVideoIdRef.current = videoId;
          }
        } catch (error) {
          console.warn("[useVideoMediaSession] Failed to open fallback playback stream:", error);
          reportPlaybackStreamFailure(error);
          setPlaybackStreamReady(false);
        } finally {
          if (openingVideoIdRef.current === videoId) {
            openingVideoIdRef.current = null;
          }
        }
      }
      return fallbackMetadata;
    };
    const metadataPromise = probe().catch((error) => {
      if (requestId !== loadRequestIdRef.current) {
        return null;
      }
      console.error("Failed to probe video metadata", error);
      setVideoMetadata(null);
      return null;
    });

    const buildPreview = async () => {
      setVideoPreviewBusy(true);
      try {
        const totalPreviewFrames = 12;
        const thumbWidth = 120;
        const thumbHeight = 90;

        let thumbRgbaList: Uint8ClampedArray[] = [];
        let duration = 0;
        let width = 0;
        let height = 0;

        if (backendInputPath) {
          const thumbs = await generateVideoThumbnails(backendInputPath, totalPreviewFrames, thumbWidth, thumbHeight);
          if (requestId !== loadRequestIdRef.current) {
            return;
          }
          if (thumbs.length > 0) {
            thumbRgbaList = thumbs.map((t) => new Uint8ClampedArray(t));
            const resolvedMetadata = probedMetadata ?? await metadataPromise;
            if (requestId !== loadRequestIdRef.current) {
              return;
            }
            duration = resolvedMetadata?.duration_seconds ?? 0;
            width = thumbWidth;
            height = thumbHeight;
          }
        }

        if (thumbRgbaList.length === 0) {
          const extracted = await extractVideoFrames(file, {
            maxFrames: totalPreviewFrames,
            maxDimension: 1200,
          });
          if (requestId !== loadRequestIdRef.current) {
            return;
          }
          thumbRgbaList = extracted.frames;
          duration = extracted.durationSeconds;
          width = extracted.width;
          height = extracted.height;
        }

        const converted = await Promise.all(
          thumbRgbaList.map(async (rgba, index) => {
            const image = await rgbaToImage(rgba, width, height);
            const seconds =
              thumbRgbaList.length <= 1
                ? 0
                : (index / Math.max(thumbRgbaList.length - 1, 1)) * duration;
            return {
              id: `video-preview-${index}`,
              src: image.src,
              width,
              height,
              label: `${seconds.toFixed(1)}s`,
            } satisfies VideoPreviewFrame;
          }),
        );

        if (requestId !== loadRequestIdRef.current) {
          return;
        }

        setVideoPreviewFrames(converted);
        setSelectedVideoPreviewFrame(0);

        const firstThumb = thumbRgbaList[0];
        if (firstThumb) {
          setVideoOriginalRgba({
            width,
            height,
            rgba: firstThumb,
          });
          setVideoProcessedRgba({
            width,
            height,
            rgba: firstThumb,
          });
          const thumbImage = await rgbaToImage(firstThumb, width, height);
          if (requestId !== loadRequestIdRef.current) {
            return;
          }
          setOriginalImage(thumbImage);
          setImageSize(`${thumbImage.width}×${thumbImage.height}`);
        }

        setProcessedImage(null);
        setShowOriginal(true);
        setStatus(`Video ready — ${converted.length} preview frames`);

        if (!backendInputPath) {
          void (async () => {
            try {
              const extracted = await extractSingleVideoFrame(file, 0);
              if (requestId !== loadRequestIdRef.current) {
                return;
              }
              const firstImage = await rgbaToImage(extracted.rgba, extracted.width, extracted.height);
              if (requestId !== loadRequestIdRef.current) {
                return;
              }
              setVideoOriginalRgba({
                width: extracted.width,
                height: extracted.height,
                rgba: extracted.rgba,
              });
              setVideoProcessedRgba({
                width: extracted.width,
                height: extracted.height,
                rgba: extracted.rgba,
              });
              setOriginalImage(firstImage);
              setImageSize(`${firstImage.width}×${firstImage.height}`);
            } catch (error) {
              console.warn("Full-res video frame extraction failed; using thumbnail preview", error);
            }
          })();
        }
      } catch (error) {
        if (requestId !== loadRequestIdRef.current) {
          return;
        }
        console.error("Failed to extract video preview frames", error);
        toast.error("Failed to generate video preview timeline");
        setStatus("Video preview unavailable");
      } finally {
        if (requestId === loadRequestIdRef.current) {
          setVideoPreviewBusy(false);
        }
      }
    };

    void buildPreview();
  }, [
    clearVideoMediaState,
    notifyPlaybackStreamReady,
    setImageSize,
    setOriginalImage,
    setProcessedImage,
    setShowOriginal,
    setStatus,
    setVideoSource,
    setVideoPreviewBusy,
    setVideoPreviewFrames,
    setSelectedVideoPreviewFrame,
    setVideoMetadata,
    setWorkflowStatus,
    setWorkspaceMode,
    setPlaybackStreamReady,
  ]);

  return {
    videoSource,
    setVideoSource,
    videoMetadata,
    setVideoMetadata,
    videoPreviewFrames,
    setVideoPreviewFrames,
    selectedVideoPreviewFrame,
    setSelectedVideoPreviewFrame,
    videoPreviewBusy,
    setVideoPreviewBusy,
    videoOriginalRgba,
    videoProcessedRgba,
    setVideoOriginalRgba,
    setVideoProcessedRgba,
    videoProcessingMs,
    setVideoProcessingMs,
    loadVideoFile,
    clearVideoMediaState,
  };
}
