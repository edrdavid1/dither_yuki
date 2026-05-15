export async function safeTauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(command, args);
  } catch (error) {
    console.warn(`[tauriBridge] invoke failed: ${command}`, error);
    return null;
  }
}

export interface ProcessImageResult {
  width: number;
  height: number;
  /** Processed RGBA pixel data as a flat number array (width × height × 4). */
  rgba: number[];
}

export interface ExportSvgRequest {
  name?: string;
  width: number;
  height: number;
  frame: number[];
  pixel_size?: number;
  shape?: "square" | "circle";
  include_transparent?: boolean;
}

export interface ExportSvgResponse {
  file_name: string;
  file_extension: string;
  bytes: number[];
}

export interface GifFrameData {
  width: number;
  height: number;
  delay_ms: number;
  is_keyframe: boolean;
  data_url: string;
}

export interface ImportGifResult {
  width: number;
  height: number;
  loop_count: number;
  frames: GifFrameData[];
}

/**
 * Import a GIF file and decode all frames.
 * @param gifBytes - Raw GIF file bytes
 * @returns Decoded GIF frames with metadata
 */
export async function importGif(gifBytes: Uint8Array): Promise<ImportGifResult | null> {
  return safeTauriInvoke<ImportGifResult>("import_gif", {
    request: {
      gif_bytes: Array.from(gifBytes),
    },
  });
}

/**
 * Send raw RGBA pixels through the Rust image pipeline and return processed RGBA.
 *
 * @param width  - source image width in pixels
 * @param height - source image height in pixels
 * @param rgbaBytes - raw RGBA data (width × height × 4 bytes)
 * @param layers - ordered EffectLayer array (same shape as the video pipeline)
 */
export async function getBackendPreview(
  width: number,
  height: number,
  rgbaBytes: Uint8Array,
  layers: unknown[],
): Promise<ProcessImageResult | null> {
  return safeTauriInvoke<ProcessImageResult>("process_image", {
    request: {
      width,
      height,
      image_bytes: Array.from(rgbaBytes),
      layers,
    },
  });
}

const stagedVideoInputPathCache = new Map<string, string>();

function buildVideoFileCacheKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}::${file.type}`;
}

export async function ensureVideoInputPath(file: File): Promise<string | null> {
  const nativePath = (file as File & { path?: string }).path;
  if (typeof nativePath === "string" && nativePath.length > 0) {
    console.log("[tauriBridge] ensureVideoInputPath: using native path", { nativePath, fileName: file.name });
    return nativePath;
  }

  const cacheKey = buildVideoFileCacheKey(file);
  const cachedPath = stagedVideoInputPathCache.get(cacheKey);
  if (cachedPath) {
    console.log("[tauriBridge] ensureVideoInputPath: cache hit", { cachedPath, fileName: file.name });
    return cachedPath;
  }

  console.log("[tauriBridge] ensureVideoInputPath: staging new file", { fileName: file.name, size: file.size });

  const ext = file.name.includes(".") ? file.name.split(".").pop() ?? "mp4" : "mp4";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const hasExtSuffix = safeName.toLowerCase().endsWith(`.${ext.toLowerCase()}`);
  const fileName = `dither-yuki-input-${Date.now()}-${safeName || "video"}${hasExtSuffix ? "" : `.${ext}`}`;

  const tempPath = await safeTauriInvoke<string>("get_temp_output_path", { fileName });
  if (!tempPath) {
    console.warn("[tauriBridge] failed to allocate temp input path for video staging", {
      fileName: file.name,
      size: file.size,
    });
    return null;
  }

  console.log("[tauriBridge] ensureVideoInputPath: allocated temp path", { tempPath });

  const bytes = new Uint8Array(await file.arrayBuffer());
  console.log("[tauriBridge] ensureVideoInputPath: file buffer read, size =", bytes.length);

  const savedPath = await safeTauriInvoke<string>("save_bytes_to_path", {
    filePath: tempPath,
    bytes: Array.from(bytes),
  });

  if (!savedPath) {
    console.warn("[tauriBridge] failed to stage video bytes to temp path", {
      tempPath,
      fileName: file.name,
      size: file.size,
    });
    return null;
  }

  console.log("[tauriBridge] ensureVideoInputPath: staging complete", { savedPath });
  stagedVideoInputPathCache.set(cacheKey, savedPath);
  return savedPath;
}

export async function readBytesFromPath(filePath: string): Promise<Uint8Array | null> {
  const bytes = await safeTauriInvoke<number[]>("read_bytes_from_path", { filePath });
  return bytes ? new Uint8Array(bytes) : null;
}

export async function generateVideoThumbnails(
  path: string,
  count: number,
  width: number,
  height: number,
): Promise<number[][]> {
  const result = await safeTauriInvoke<number[][]>("generate_video_thumbnails", {
    path,
    count,
    width,
    height,
  });
  return result ?? [];
}

export interface VideoFrameRequestV1 {
  version: 1;
  video_id: string;
  frame_index: number;
  quality_mode?: "fast" | "accurate";
  scale?: number;
  width: number;
  height: number;
  frame_rgba?: number[];
  input_path?: string;
  fps?: number;
  layer_snapshot_hash?: string;
  layer_payload: unknown[];
  layer_tracks?: unknown[];
  processing_backend?: "cpu" | "gpu";
  transport_request_id?: string;
  transport_mode?: "playback" | "scrub";
}

export interface VideoFrameResponseV1 {
  version: 1;
  video_id: string;
  frame_index: number;
  width: number;
  height: number;
  rgba: number[];
  cache_hit: boolean;
  processing_ms: number;
  backend_used: "cpu" | "gpu";
  fallback_used: boolean;
  requested_index: number;
  produced_index: number;
  ffmpeg_errors: boolean;
  stream_status?: "ready" | "waiting";
}

export interface VideoFrameStreamAckV1 {
  version: 1;
  video_id: string;
  frame_index: number;
  width: number;
  height: number;
  cache_hit: boolean;
  processing_ms: number;
  backend_used: "cpu" | "gpu";
  fallback_used: boolean;
  transport_request_id?: string | null;
}

export interface VideoFrameResponseMetaV1 {
  version: 1;
  video_id: string;
  frame_index: number;
  width: number;
  height: number;
  cache_hit: boolean;
  processing_ms: number;
  backend_used: "cpu" | "gpu";
  fallback_used: boolean;
  requested_index: number;
  produced_index: number;
  ffmpeg_errors: boolean;
  stream_status?: "ready" | "waiting";
  transport_request_id?: string;
}

export interface VideoPreviewSessionRequestV1 {
  version: 1;
  video_id: string;
  input_path: string;
  fps: number;
  width: number;
  height: number;
}

export interface VideoPreviewSessionResponseV1 {
  version: 1;
  video_id: string;
  input_path: string;
  active_path: string;
  preview_path?: string | null;
  preview_width: number;
  preview_height: number;
  proxy_mode: boolean;
}

export interface VideoRenderJobRequestV1 {
  version: 1;
  video_id: string;
  start_frame: number;
  end_frame: number;
  fps: number;
  output_format: "gif" | "dykframes" | "mp4";
  input_path?: string;
  output_path?: string;
  layers?: unknown[];
  tracks?: unknown[];
  keep_audio?: boolean;
}

export interface VideoRenderJobResponseV1 {
  version: 1;
  job_id: string;
  status: "queued" | "running" | "completed" | "cancelled" | "failed";
  current_frame: number;
  total_frames: number;
  output_path?: string | null;
}

export async function getFilteredFrameV2(request: VideoFrameRequestV1): Promise<VideoFrameResponseV1 | null> {
  return safeTauriInvoke<VideoFrameResponseV1>("get_filtered_frame_v2", { request });
}



export async function getFilteredFrameBinaryV2(
  request: VideoFrameRequestV1,
): Promise<{ meta: FrameMeta; rgba: Uint8ClampedArray } | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const rawBuffer = await invoke<ArrayBuffer | Uint8Array | number[]>("get_filtered_frame_binary_v2", { request });
    
    let buffer: Uint8Array;
    if (rawBuffer instanceof ArrayBuffer) {
      buffer = new Uint8Array(rawBuffer);
    } else if (rawBuffer instanceof Uint8Array) {
      buffer = rawBuffer;
    } else if (Array.isArray(rawBuffer)) {
      buffer = new Uint8Array(rawBuffer);
    } else {
      console.warn("[tauriBridge] Received invalid buffer type:", typeof rawBuffer);
      return null;
    }

    if (buffer.length < 4) return null;

    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const metaLen = view.getUint32(0, true);

    if (buffer.length < 4 + metaLen) return null;

    const metaBytes = new Uint8Array(buffer.buffer, buffer.byteOffset + 4, metaLen);
    const metaStr = new TextDecoder().decode(metaBytes);
    const metaAck: VideoFrameResponseMetaV1 = JSON.parse(metaStr);

    const rgba = new Uint8ClampedArray(buffer.buffer, buffer.byteOffset + 4 + metaLen, buffer.byteLength - 4 - metaLen);

    return {
      meta: {
        videoId: metaAck.video_id,
        frameIndex: metaAck.frame_index,
        width: metaAck.width,
        height: metaAck.height,
        cacheHit: metaAck.cache_hit,
        processingMs: metaAck.processing_ms,
        backendUsed: metaAck.backend_used,
        fallbackUsed: metaAck.fallback_used,
        streamStatus: metaAck.stream_status,
        qualityMode: request.quality_mode ?? "fast",
        scale: request.scale ?? 1.0,
        requestedIndex: metaAck.requested_index,
        producedIndex: metaAck.produced_index,
        transportRequestId: request.transport_request_id ?? null,
      },
      rgba,
    };
  } catch (err) {
    console.error("[tauriBridge] getFilteredFrameBinaryV2 failed", err);
    return null;
  }
}

export async function prepareVideoPreviewSession(
  request: VideoPreviewSessionRequestV1,
): Promise<VideoPreviewSessionResponseV1 | null> {
  return safeTauriInvoke<VideoPreviewSessionResponseV1>("prepare_video_preview_session", { request });
}

export async function releaseVideoPreviewSession(videoId: string): Promise<boolean> {
  const result = await safeTauriInvoke<null>("release_video_preview_session", { videoId });
  return result !== null;
}

export async function openPlaybackStream(
  videoId: string,
  inputPath: string,
  fps: number,
  width: number,
  height: number,
  layerPayload: unknown[],
  layerTracks: unknown[],
  layerSnapshotHash: string,
  qualityMode?: "fast" | "accurate",
  scale?: number,
): Promise<VideoPreviewSessionResponseV1 | null> {
  return safeTauriInvoke<VideoPreviewSessionResponseV1>("open_playback_stream", {
    videoId,
    inputPath,
    fps,
    width,
    height,
    layerPayload,
    layerTracks,
    layerSnapshotHash,
    qualityMode,
    scale,
  });
}

export async function closePlaybackStream(videoId: string): Promise<boolean> {
  const result = await safeTauriInvoke<null>("close_playback_stream", { videoId });
  return result !== null;
}

export async function updatePlaybackEffectParams(
  videoId: string,
  layerPayload: unknown[],
  layerTracks: unknown[],
  layerSnapshotHash: string,
  qualityMode?: "fast" | "accurate",
  scale?: number,
): Promise<boolean> {
  const result = await safeTauriInvoke<null>("update_playback_effect_params", {
    videoId,
    layerPayload,
    layerTracks,
    layerSnapshotHash,
    qualityMode,
    scale,
  });
  return result !== null;
}

export async function renderVideoJobV2(request: VideoRenderJobRequestV1): Promise<VideoRenderJobResponseV1 | null> {
  return safeTauriInvoke<VideoRenderJobResponseV1>("render_video_job_v2", { request });
}

export async function cancelVideoJobV2(jobId: string): Promise<VideoRenderJobResponseV1 | null> {
  return safeTauriInvoke<VideoRenderJobResponseV1>("cancel_video_job_v2", { jobId });
}

export async function getVideoJobProgressV2(jobId: string): Promise<VideoRenderJobResponseV1 | null> {
  return safeTauriInvoke<VideoRenderJobResponseV1>("get_video_job_progress_v2", { jobId });
}

export async function listVideoJobsV2(): Promise<VideoRenderJobResponseV1[]> {
  const result = await safeTauriInvoke<VideoRenderJobResponseV1[]>("list_video_jobs_v2");
  return result ?? [];
}

export async function updateFilterParamsV2(): Promise<boolean> {
  const result = await safeTauriInvoke<null>("update_filter_params_v2");
  return result !== null;
}

export async function exportSvgFrame(request: ExportSvgRequest): Promise<ExportSvgResponse | null> {
  return safeTauriInvoke<ExportSvgResponse>("export_svg", { request });
}

export async function saveSvgWithDialog(fileName: string, bytes: number[]): Promise<string | null> {
  const selectedPath = await safeTauriInvoke<string | null>("plugin:dialog|save", {
    options: {
      title: "Save SVG",
      defaultPath: fileName,
      filters: [{ name: "SVG", extensions: ["svg"] }],
    },
  });

  if (!selectedPath) {
    return null;
  }

  return safeTauriInvoke<string>("save_bytes_to_path", {
    filePath: selectedPath,
    bytes,
  });
}

/**
 * Show a native "Save" dialog scoped to .dyproj files and return the chosen path,
 * or null if the user cancelled.
 */
export async function pickSaveProjectPath(defaultName?: string): Promise<string | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("plugin:dialog|save", {
    options: {
      title: "Save Project",
      defaultPath: defaultName ?? "project.dyproj",
      filters: [{ name: "Dither Yuki Project", extensions: ["dyproj"] }],
    },
  });
}

/**
 * Show a native "Open" dialog scoped to .dyproj files and return the chosen path,
 * or null if the user cancelled.
 */
export async function pickOpenProjectPath(): Promise<string | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("plugin:dialog|open", {
    options: {
      title: "Open Project",
      multiple: false,
      filters: [{ name: "Dither Yuki Project", extensions: ["dyproj"] }],
    },
  });
}

/**
 * Show a native "Open" dialog scoped to .dyuki files and return the chosen path,
 * or null if the user cancelled or backend dialog is unavailable.
 */
export async function pickOpenPatternPresetPath(): Promise<string | null> {
  return safeTauriInvoke<string | null>("plugin:dialog|open", {
    options: {
      title: "Import Pattern Preset",
      multiple: false,
      filters: [{ name: "Dither Yuki Pattern Preset", extensions: ["dyuki"] }],
    },
  });
}

export async function pickOpenPalettePath(): Promise<string | null> {
  return safeTauriInvoke<string | null>("plugin:dialog|open", {
    options: {
      title: "Import Palette",
      multiple: false,
      filters: [{ name: "Palettes", extensions: ["ase", "gpl", "hex", "txt", "pal", "json"] }],
    },
  });
}

export async function pickSavePalettePath(defaultName = "palette.gpl"): Promise<string | null> {
  return safeTauriInvoke<string | null>("plugin:dialog|save", {
    options: {
      title: "Export Palette",
      defaultPath: defaultName,
      filters: [{ name: "Palettes", extensions: ["ase", "gpl", "hex", "txt", "json"] }],
    },
  });
}

// ---------------------------------------------------------------------------
// Binary Frame Transport (Requirement 3.4, 3.5)
// ---------------------------------------------------------------------------

/**
 * Metadata fields carried alongside the binary RGBA payload in a `frame_ready`
 * Tauri event. Mirrors the Rust `BinaryFrameEvent` struct in
 * `src-tauri/src/video_runtime/frame_transport.rs`.
 *
 * Tauri 2.x serialises `Vec<u8>` as a base64 string in the JSON event payload,
 * so `rgba` arrives as a base64-encoded string rather than a number array.
 */
export interface BinaryFrameEvent {
  videoId: string;
  frameIndex: number;
  width: number;
  height: number;
  cacheHit: boolean;
  processingMs: number;
  backendUsed: "cpu" | "gpu";
  fallbackUsed: boolean;
  qualityMode: "fast" | "accurate";
  scale: number;
  requestedIndex: number;
  producedIndex: number;
  ffmpegErrors?: boolean;
  transportRequestId?: string | null;
  /** Raw RGBA bytes (width × height × 4). Depending on the serializer, this may arrive as a byte array or a base64 string. */
  rgba: string | number[];
}

/**
 * The metadata portion of a decoded binary frame event — everything except the
 * raw pixel buffer.
 */
export interface FrameMeta {
  videoId: string;
  frameIndex: number;
  width: number;
  height: number;
  cacheHit: boolean;
  processingMs: number;
  backendUsed: "cpu" | "gpu";
  fallbackUsed: boolean;
  streamStatus?: "ready" | "waiting";
  qualityMode: "fast" | "accurate";
  scale: number;
  requestedIndex: number;
  producedIndex: number;
  ffmpegErrors?: boolean;
  transportRequestId?: string | null;
}

/**
 * Subscribe to `frame_ready` Tauri events emitted by the Rust binary frame
 * transport.
 *
 * @param callback - Called with each incoming `BinaryFrameEvent`.
 * @returns A promise that resolves to an `UnlistenFn`; call it to unsubscribe.
 *
 * Requirements: 3.4
 */
export async function listenFrameReady(
  callback: (event: BinaryFrameEvent) => void,
): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<BinaryFrameEvent>("frame_ready", (tauriEvent) => {
    callback(tauriEvent.payload);
  });

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    try {
      unlisten();
    } catch (err) {
      console.warn("[tauriBridge] frame_ready unlisten failed", err);
    }
  };
}

/**
 * Decode the base64 RGBA payload from a `BinaryFrameEvent` and validate its
 * length.
 *
 * Returns `{ meta, rgba }` on success, or `null` when the decoded buffer length
 * does not equal `width × height × 4` (Requirement 3.5).
 *
 * @param event - A raw `BinaryFrameEvent` received from the `frame_ready` listener.
 * @returns The decoded frame data, or `null` if the buffer is malformed.
 *
 * Requirements: 3.4, 3.5
 */
export function decodeFramePayload(
  event: BinaryFrameEvent,
): { meta: FrameMeta; rgba: Uint8Array } | null {
  const expectedLength = event.width * event.height * 4;

  let rgba: Uint8Array;
  if (typeof event.rgba === "string") {
    try {
      const binaryString = atob(event.rgba);
      rgba = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        rgba[i] = binaryString.charCodeAt(i);
      }
    } catch (err) {
      console.error(
        `[tauriBridge] decodeFramePayload: base64 decode failed for frame ${event.frameIndex}`,
        err,
      );
      return null;
    }
  } else if (Array.isArray(event.rgba)) {
    rgba = new Uint8Array(event.rgba.length);
    for (let i = 0; i < event.rgba.length; i++) {
      const value = event.rgba[i] ?? 0;
      rgba[i] = Math.max(0, Math.min(255, Math.round(value)));
    }
  } else {
    console.error(
      `[tauriBridge] decodeFramePayload: unsupported RGBA payload type for frame ${event.frameIndex}`,
      typeof event.rgba,
    );
    return null;
  }

  if (rgba.length !== expectedLength) {
    console.error(
      `[tauriBridge] decodeFramePayload: buffer length mismatch for frame ${event.frameIndex}. ` +
        `Expected ${expectedLength} bytes (${event.width}×${event.height}×4), got ${rgba.length}.`,
    );
    return null;
  }

  const meta: FrameMeta = {
    videoId: event.videoId,
    frameIndex: event.frameIndex,
    width: event.width,
    height: event.height,
    cacheHit: event.cacheHit,
    processingMs: event.processingMs,
    backendUsed: event.backendUsed,
    fallbackUsed: event.fallbackUsed,
    streamStatus: undefined,
    qualityMode: event.qualityMode,
    scale: event.scale,
    requestedIndex: event.requestedIndex,
    producedIndex: event.producedIndex,
    ffmpegErrors: event.ffmpegErrors,
    transportRequestId: event.transportRequestId ?? null,
  };

  return { meta, rgba };
}
