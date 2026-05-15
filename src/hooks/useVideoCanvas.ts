import { useCallback, useEffect, useRef } from "react";
import { getNativeFilePath, extractSingleVideoFrame } from "@/lib/mediaWorkflow";
import { createHash } from "@/lib/videoRuntime/hash";
import {
  ensureVideoInputPath,
  getFilteredFrameBinaryV2,
  updatePlaybackEffectParams,
  closePlaybackStream,
  safeTauriInvoke,
  type VideoFrameRequestV1,
} from "@/lib/tauriBridge";
import type { LayerTrack } from "@/lib/videoRuntime/layerTracks";
import { useVideoPlaybackStore } from "@/store/videoPlaybackStore";
import type { WorkerMessage, FrameInfoMessage } from "@/workers/frameWorker";
import { useEffectParamSync } from "./useEffectParamSync";

export interface VideoCanvasFrameInfo {
  frameIndex: number;
  width: number;
  height: number;
  processingMs: number;
  cacheHit: boolean;
  quality: "fast" | "accurate";
  requestedIndex?: number;
  producedIndex?: number;
  ffmpegErrors?: boolean;
}

export interface UseVideoCanvasArgs {
  enabled: boolean;
  videoSource: File | null;
  videoId: string | null;
  videoMetadata: { width?: number; height?: number; fps?: number } | null;
  videoPlayheadFrameIndex: number;
  videoPlaying: boolean;
  videoFps: number;
  layerPayload: unknown[];
  layerTracks: LayerTrack[];
  processingBackend: "cpu" | "gpu";
  onFrameDrawn?: (info: VideoCanvasFrameInfo) => void;
}

export interface UseVideoCanvasResult {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  drawFrame: (frameIndex: number) => void;
}

interface PreparedFrameRequest {
  request: VideoFrameRequestV1;
  displayWidth: number;
  displayHeight: number;
}

// Only reject frames where ALL sampled bytes are zero AND alpha is also zero.
// This avoids dropping legitimate black frames (which have alpha=255).
function isDefinitelyEmptyFrame(rgba: Uint8ClampedArray): boolean {
  if (rgba.length < 4) return true;
  // Check alpha channel bytes (every 4th byte starting at index 3).
  // A real frame always has at least some non-zero alpha.
  const step = Math.max(4, Math.floor(rgba.length / 64) * 4);
  for (let i = 3; i < rgba.length; i += step) {
    if (rgba[i] !== 0) return false;
  }
  return true;
}

export function useVideoCanvas({
  enabled,
  videoSource,
  videoId,
  videoMetadata,
  videoPlayheadFrameIndex,
  videoPlaying,
  videoFps,
  layerPayload,
  layerTracks,
  processingBackend,
  onFrameDrawn,
}: UseVideoCanvasArgs): UseVideoCanvasResult {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const playbackRafRef = useRef<number | null>(null);
  const isFetchingPlaybackRef = useRef(false);
  const lastWorkerReadyRef = useRef<boolean | null>(null);
  const lastWorkerRunRef = useRef<boolean | null>(null);
  const sessionIdRef = useRef(1);
  const playbackStreamReady = useVideoPlaybackStore((state) => state.playbackStreamReady);

  const requestIdRef = useRef(0);
  const accurateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const pendingFrameRef = useRef<number | null>(null);

  // Refs that always hold the latest prop values — safe to read inside callbacks.
  const videoSourceRef = useRef(videoSource);
  videoSourceRef.current = videoSource;
  const videoPlayingRef = useRef(videoPlaying);
  videoPlayingRef.current = videoPlaying;
  const videoMetadataRef = useRef(videoMetadata);
  videoMetadataRef.current = videoMetadata;
  const videoFpsRef = useRef(videoFps);
  videoFpsRef.current = videoFps;
  const videoIdRef = useRef(videoId);
  videoIdRef.current = videoId;
  const processingBackendRef = useRef(processingBackend);
  processingBackendRef.current = processingBackend;
  const layerPayloadRef = useRef(layerPayload);
  layerPayloadRef.current = layerPayload;
  const layerTracksRef = useRef(layerTracks);
  layerTracksRef.current = layerTracks;
  const onFrameDrawnRef = useRef(onFrameDrawn);
  onFrameDrawnRef.current = onFrameDrawn;

  // ── Worker lifecycle sync ──────────────────────────────────────────────────

  const syncWorkerLifecycle = useCallback((reason: string) => {
    const worker = workerRef.current;
    if (!worker) return;

    const readyNow = useVideoPlaybackStore.getState().playbackStreamReady;
    const shouldRun = readyNow && videoPlayingRef.current;
    const sessionId = sessionIdRef.current;

    if (lastWorkerReadyRef.current !== readyNow) {
      worker.postMessage({
        type: "SET_STREAM_READY",
        ready: readyNow,
        videoId: videoIdRef.current ?? undefined,
        sessionId,
      } satisfies WorkerMessage);
      lastWorkerReadyRef.current = readyNow;
    }

    if (lastWorkerRunRef.current !== shouldRun) {
      worker.postMessage(
        shouldRun
          ? ({ type: "START", sessionId } satisfies WorkerMessage)
          : ({ type: "STOP", sessionId } satisfies WorkerMessage),
      );
      lastWorkerRunRef.current = shouldRun;
    }

    void reason; // suppress unused-variable lint
  }, []);

  // ── Worker init (once on mount) ────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const offscreen = canvas.transferControlToOffscreen();
      const worker = new Worker(new URL("@/workers/frameWorker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;

      worker.onmessage = (e: MessageEvent<FrameInfoMessage>) => {
        if (e.data.type === "FRAME_DRAWN") {
          onFrameDrawnRef.current?.({
            frameIndex: e.data.frameIndex,
            width: e.data.width,
            height: e.data.height,
            processingMs: e.data.processingMs,
            cacheHit: e.data.cacheHit,
            quality: e.data.quality,
            requestedIndex: e.data.requestedIndex,
            producedIndex: e.data.producedIndex,
            ffmpegErrors: e.data.ffmpegErrors,
          });
        }
      };

      const initialReady = useVideoPlaybackStore.getState().playbackStreamReady;
      worker.postMessage(
        { type: "INIT", canvas: offscreen, videoId: videoIdRef.current ?? "", sessionId: sessionIdRef.current } satisfies WorkerMessage,
        [offscreen],
      );
      worker.postMessage({ type: "SET_STREAM_READY", ready: initialReady, sessionId: sessionIdRef.current } satisfies WorkerMessage);
      lastWorkerReadyRef.current = initialReady;
      lastWorkerRunRef.current = null;
    } catch (e) {
      console.warn("[useVideoCanvas] Failed to initialize offscreen canvas worker", e);
    }

    return () => {
      if (playbackRafRef.current !== null) {
        cancelAnimationFrame(playbackRafRef.current);
        playbackRafRef.current = null;
        isFetchingPlaybackRef.current = false;
      }
      const activeVideoId = videoIdRef.current;
      if (activeVideoId) {
        void closePlaybackStream(activeVideoId).catch(() => {});
      }
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Video ID change → bump session ────────────────────────────────────────

  useEffect(() => {
    if (!workerRef.current) return;
    sessionIdRef.current += 1;
    lastWorkerReadyRef.current = null;
    lastWorkerRunRef.current = null;
    if (videoId) {
      workerRef.current.postMessage({
        type: "UPDATE_VIDEO_ID",
        videoId,
        sessionId: sessionIdRef.current,
      } satisfies WorkerMessage);
    }
    syncWorkerLifecycle("video-id-changed");
  }, [videoId, syncWorkerLifecycle]);

  // ── Stream ready / playing state → sync worker ────────────────────────────

  useEffect(() => {
    if (!workerRef.current) return;
    syncWorkerLifecycle("playback-or-ready-changed");
  }, [playbackStreamReady, videoPlaying, syncWorkerLifecycle]);

  // ── Listen for playback-stream-opened custom event ────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStreamOpened = (event: Event) => {
      const detail = (event as CustomEvent<{ videoId?: string }>).detail;
      const openedId = detail?.videoId;
      if (openedId && videoIdRef.current && openedId !== videoIdRef.current) return;

      useVideoPlaybackStore.getState().setPlaybackStreamReady(true);

      workerRef.current?.postMessage({
        type: "SET_STREAM_READY",
        ready: true,
        videoId: openedId ?? videoIdRef.current ?? undefined,
        sessionId: sessionIdRef.current,
      } satisfies WorkerMessage);

      if (videoPlayingRef.current) {
        workerRef.current?.postMessage({ type: "START", sessionId: sessionIdRef.current } satisfies WorkerMessage);
        lastWorkerRunRef.current = true;
      }
      lastWorkerReadyRef.current = true;
    };

    window.addEventListener("playback-stream-opened", handleStreamOpened as EventListener);
    return () => window.removeEventListener("playback-stream-opened", handleStreamOpened as EventListener);
  }, []);

  // ── Playback RAF pull loop ─────────────────────────────────────────────────
  // Runs on the main thread because Tauri IPC (invoke) is not available in workers.
  // On each animation frame: pull the next decoded frame from the Rust ring buffer,
  // parse the binary response, and post DRAW_RAW to the worker.
  // The Rust backend drives the clock — each successful pull updates clock.frame.

  useEffect(() => {
    if (videoPlaying && playbackStreamReady) {
      if (playbackRafRef.current !== null) return; // already running

      const loop = async () => {
        // Stop condition checked at the top of every iteration.
        if (!videoPlayingRef.current || !useVideoPlaybackStore.getState().playbackStreamReady) {
          playbackRafRef.current = null;
          isFetchingPlaybackRef.current = false;
          return;
        }

        if (!isFetchingPlaybackRef.current && videoIdRef.current) {
          isFetchingPlaybackRef.current = true;
          const requestSessionId = sessionIdRef.current;

          try {
            const raw = await safeTauriInvoke<ArrayBuffer | Uint8Array | number[]>(
              "pull_next_playback_frame_binary",
              { videoId: videoIdRef.current },
            );

            // Session or playing state changed while we were waiting — discard.
            if (
              requestSessionId !== sessionIdRef.current ||
              !videoPlayingRef.current ||
              !useVideoPlaybackStore.getState().playbackStreamReady
            ) {
              return;
            }

            if (raw) {
              let bytes: Uint8Array;
              if (raw instanceof ArrayBuffer) {
                bytes = new Uint8Array(raw);
              } else if (raw instanceof Uint8Array) {
                bytes = raw;
              } else {
                bytes = new Uint8Array(raw as number[]);
              }

              if (bytes.length >= 4) {
                const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
                const metaLen = view.getUint32(0, true);

                if (bytes.length >= 4 + metaLen) {
                  const metaStr = new TextDecoder().decode(
                    new Uint8Array(bytes.buffer, bytes.byteOffset + 4, metaLen),
                  );
                  const meta = JSON.parse(metaStr) as {
                    video_id?: string;
                    width: number;
                    height: number;
                    frame_index: number;
                    requested_index: number;
                    produced_index: number;
                    ffmpeg_errors: boolean;
                    processing_ms: number;
                    cache_hit: boolean;
                    stream_status?: "ready" | "waiting";
                  };

                  const {
                    video_id, width, height, frame_index,
                    requested_index, produced_index,
                    ffmpeg_errors, processing_ms, cache_hit, stream_status,
                  } = meta;

                  // "waiting" means the stream buffer is empty — skip this tick.
                  if (stream_status === "waiting" || !width || !height) {
                    // nothing to draw this tick
                  } else {
                    const rgbaOffset = bytes.byteOffset + 4 + metaLen;
                    const rgbaLength = bytes.byteLength - 4 - metaLen;

                    if (rgbaLength > 0) {
                      const rgba = new Uint8ClampedArray(
                        bytes.buffer.slice(rgbaOffset, rgbaOffset + rgbaLength),
                      );
                      const expectedLen = width * height * 4;

                      if (rgba.length === expectedLen && !isDefinitelyEmptyFrame(rgba)) {
                        const canonicalIndex = Number.isFinite(produced_index) ? produced_index : frame_index;
                        const ffmpegErrors = Boolean(ffmpeg_errors);

                        // Guard: session still valid before posting to worker.
                        if (
                          requestSessionId === sessionIdRef.current &&
                          videoPlayingRef.current &&
                          useVideoPlaybackStore.getState().playbackStreamReady
                        ) {
                          workerRef.current?.postMessage(
                            {
                              type: "DRAW_RAW",
                              width,
                              height,
                              rgba,
                              sessionId: requestSessionId,
                              videoId: video_id ?? videoIdRef.current ?? undefined,
                              frameIndex: canonicalIndex,
                              requestedIndex: requested_index,
                              producedIndex: canonicalIndex,
                              ffmpegErrors,
                            } satisfies WorkerMessage,
                          );

                          onFrameDrawnRef.current?.({
                            frameIndex: canonicalIndex,
                            width,
                            height,
                            processingMs: processing_ms,
                            cacheHit: cache_hit,
                            quality: "fast",
                            requestedIndex: requested_index,
                            producedIndex: canonicalIndex,
                            ffmpegErrors,
                          });
                        }
                      }
                    }
                  }
                }
              }
            }
          } finally {
            isFetchingPlaybackRef.current = false;
          }
        }

        // Schedule next tick.
        playbackRafRef.current = requestAnimationFrame(() => { void loop(); });
      };

      playbackRafRef.current = requestAnimationFrame(() => { void loop(); });
    } else {
      // Stop the loop.
      if (playbackRafRef.current !== null) {
        cancelAnimationFrame(playbackRafRef.current);
        playbackRafRef.current = null;
        isFetchingPlaybackRef.current = false;
      }
    }
  }, [videoPlaying, playbackStreamReady]);

  // ── Update effect params when layer config changes during playback ─────────

  useEffect(() => {
    if (!videoId || !videoPlaying) return;
    const hash = createHash(JSON.stringify({ p: layerPayload, t: layerTracks }));
    updatePlaybackEffectParams(videoId, layerPayload, layerTracks, hash, "fast", 0.25).catch((err) => {
      console.warn("[useVideoCanvas] Failed to update playback effect params", err);
    });
  }, [videoId, videoPlaying, layerPayload, layerTracks]);

  // ── Redraw current frame when effect params change during pause ────────────
  // This allows the user to see the result of slider adjustments immediately
  // without having to press Play.

  const handleEffectParamsChanged = useCallback(() => {
    // Only redraw if video is paused and we have a valid playhead position
    if (videoPlayingRef.current) return;
    if (!videoSourceRef.current || !videoIdRef.current) return;

    const width = videoMetadataRef.current?.width ?? 0;
    const height = videoMetadataRef.current?.height ?? 0;
    if (!width || !height) return;

    // Redraw the current frame with the new effect parameters
    // Note: drawFrame is defined later in this hook, so we'll call useEffectParamSync after it's defined
    // For now, we just define the callback
  }, [videoPlayheadFrameIndex]);

  // ── Scrub frame request ────────────────────────────────────────────────────

  const prepareFrameRequest = useCallback(
    async (
      frameIndex: number,
      qualityMode: "fast" | "accurate",
      scale: number,
      transportRequestId?: string,
    ): Promise<PreparedFrameRequest | null> => {
      const source = videoSourceRef.current;
      if (!source || !enabled) return null;

      const nativePath = getNativeFilePath(source);
      const inputPath = nativePath ?? await ensureVideoInputPath(source);
      const meta = videoMetadataRef.current;
      const fps = videoFpsRef.current;
      const vid = videoIdRef.current;
      const backend = processingBackendRef.current;
      const width = meta?.width ?? 0;
      const height = meta?.height ?? 0;
      if (!width || !height) return null;

      const payload = layerPayloadRef.current;
      const tracks = layerTracksRef.current;
      const hash = createHash(JSON.stringify({ p: payload, t: tracks }));

      let frameRgba: number[] | undefined;
      let frameWidth = width;
      let frameHeight = height;

      // Only extract from browser if there is no native input path.
      if (!inputPath) {
        try {
          const targetTs = fps > 0 ? frameIndex / fps : 0;
          let decoded = await extractSingleVideoFrame(source, targetTs);

          if (isDefinitelyEmptyFrame(decoded.rgba)) {
            const nudge = fps > 0 ? 1 / fps : 1 / 30;
            const retried = await extractSingleVideoFrame(source, Math.max(0, targetTs + nudge));
            if (!isDefinitelyEmptyFrame(retried.rgba)) {
              decoded = retried;
            } else {
              return null;
            }
          }

          frameRgba = Array.from(decoded.rgba);
          frameWidth = decoded.width;
          frameHeight = decoded.height;
        } catch {
          return null;
        }
      }

      const request: VideoFrameRequestV1 = {
        version: 1,
        video_id: vid ?? nativePath ?? source.name,
        frame_index: frameIndex,
        width: frameWidth,
        height: frameHeight,
        frame_rgba: frameRgba,
        input_path: inputPath ?? undefined,
        fps,
        layer_payload: payload,
        layer_tracks: tracks,
        quality_mode: qualityMode,
        scale,
        layer_snapshot_hash: hash,
        processing_backend: backend,
        transport_request_id: transportRequestId,
        transport_mode: "scrub",
      };

      return { request, displayWidth: width, displayHeight: height };
    },
    [enabled],
  );

  const runFrameRequest = useCallback(
    (frameIndex: number, qualityMode: "fast" | "accurate", scale: number) => {
      if (videoPlayingRef.current) return; // playback loop handles this

      const requestId = ++requestIdRef.current;
      const requestSessionId = sessionIdRef.current;
      inFlightRef.current = true;

      void (async () => {
        const prepared = await prepareFrameRequest(frameIndex, qualityMode, scale);
        if (!prepared) {
          if (requestId === requestIdRef.current) inFlightRef.current = false;
          return;
        }

        try {
          const response = await getFilteredFrameBinaryV2(prepared.request);
          if (requestSessionId !== sessionIdRef.current) return;

          if (requestId === requestIdRef.current && response?.rgba?.length) {
            const buffer = response.rgba instanceof Uint8ClampedArray
              ? response.rgba
              : new Uint8ClampedArray(response.rgba);
            const expectedLen = response.meta.width * response.meta.height * 4;

            if (buffer.length !== expectedLen || isDefinitelyEmptyFrame(buffer)) return;

            const canonicalIndex = Number.isFinite(response.meta.producedIndex)
              ? response.meta.producedIndex
              : response.meta.frameIndex;
            const ffmpegErrors = Boolean(response.meta.ffmpegErrors);

            workerRef.current?.postMessage({
              type: "DRAW_RAW",
              width: response.meta.width,
              height: response.meta.height,
              rgba: buffer,
              sessionId: requestSessionId,
              videoId: response.meta.videoId,
              frameIndex: canonicalIndex,
              requestedIndex: response.meta.requestedIndex,
              producedIndex: canonicalIndex,
              ffmpegErrors,
            } satisfies WorkerMessage);

            onFrameDrawnRef.current?.({
              frameIndex: canonicalIndex,
              width: response.meta.width,
              height: response.meta.height,
              processingMs: response.meta.processingMs ?? 0,
              cacheHit: response.meta.cacheHit ?? false,
              quality: qualityMode,
              requestedIndex: response.meta.requestedIndex,
              producedIndex: canonicalIndex,
              ffmpegErrors,
            });
          }
        } catch (error) {
          console.warn("[useVideoCanvas] Scrub frame request failed", error);
        } finally {
          if (requestId === requestIdRef.current) {
            inFlightRef.current = false;

            const pending = pendingFrameRef.current;
            if (pending !== null && pending !== frameIndex) {
              pendingFrameRef.current = null;
              runFrameRequest(pending, "fast", 0.25);
            } else if (qualityMode === "fast" && !videoPlayingRef.current) {
              // Upgrade to accurate quality after a short delay.
              accurateTimerRef.current = setTimeout(() => {
                accurateTimerRef.current = null;
                void runFrameRequest(frameIndex, "accurate", 1.0);
              }, 200);
            }
          }
        }
      })().catch(() => {
        if (requestId === requestIdRef.current) inFlightRef.current = false;
      });
    },
    [prepareFrameRequest],
  );

  const drawFrame = useCallback(
    (frameIndex: number) => {
      if (videoPlayingRef.current) return;

      if (accurateTimerRef.current !== null) {
        clearTimeout(accurateTimerRef.current);
        accurateTimerRef.current = null;
      }

      if (inFlightRef.current) {
        pendingFrameRef.current = frameIndex;
        return;
      }

      pendingFrameRef.current = null;
      runFrameRequest(frameIndex, "fast", 0.25);
    },
    [runFrameRequest],
  );

  // Now that drawFrame is defined, we can use it in handleEffectParamsChanged
  const handleEffectParamsChangedWithDrawFrame = useCallback(() => {
    // Only redraw if video is paused and we have a valid playhead position
    if (videoPlayingRef.current) return;
    if (!videoSourceRef.current || !videoIdRef.current) return;

    const width = videoMetadataRef.current?.width ?? 0;
    const height = videoMetadataRef.current?.height ?? 0;
    if (!width || !height) return;

    // Redraw the current frame with the new effect parameters
    drawFrame(videoPlayheadFrameIndex);
  }, [videoPlayheadFrameIndex, drawFrame]);

  useEffectParamSync(layerTracks, layerPayload, handleEffectParamsChangedWithDrawFrame);

  // Trigger scrub draw when playhead changes (not during playback).
  useEffect(() => {
    if (!enabled || !videoSource || videoPlaying) return;
    const width = videoMetadata?.width ?? 0;
    const height = videoMetadata?.height ?? 0;
    if (!width || !height) return;
    drawFrame(videoPlayheadFrameIndex);
  }, [videoPlayheadFrameIndex, enabled, videoSource, videoMetadata, videoPlaying, drawFrame]);

  useEffect(() => {
    return () => {
      if (accurateTimerRef.current !== null) {
        clearTimeout(accurateTimerRef.current);
      }
    };
  }, []);

  return { canvasRef, drawFrame };
}
