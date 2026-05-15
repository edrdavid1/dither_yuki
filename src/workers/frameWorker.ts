// NOTE: Do NOT import @tauri-apps/api here — Tauri IPC is only available on
// the main thread, not inside Web Workers. Frame pulling happens in
// useVideoCanvas.ts (main thread) which posts DRAW_RAW messages here.

export type WorkerMessage =
  | { type: "INIT"; canvas: OffscreenCanvas; videoId: string; sessionId?: number }
  | { type: "START"; sessionId?: number }
  | { type: "STOP"; sessionId?: number }
  | { type: "SET_STREAM_READY"; ready: boolean; videoId?: string; sessionId?: number }
  | { type: "UPDATE_VIDEO_ID"; videoId: string; sessionId?: number }
  | { type: "DRAW_FRAME_ONCE" }
  | { type: "DRAW_RAW"; width: number; height: number; rgba: Uint8ClampedArray | Uint8Array | ArrayBuffer | number[]; sessionId?: number; videoId?: string; frameIndex?: number; requestedIndex?: number; producedIndex?: number; ffmpegErrors?: boolean };

export interface FrameInfoMessage {
  type: "FRAME_DRAWN";
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

// ── State ──────────────────────────────────────────────────────────────────

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let videoId: string | null = null;
let currentSessionId = 0;

// pendingFrame holds the last received frame so it can be drawn when START arrives.
let pendingFrame: { width: number; height: number; rgba: Uint8ClampedArray; requestedIndex?: number; producedIndex?: number; ffmpegErrors?: boolean } | null = null;

// ── Helpers ────────────────────────────────────────────────────────────────

const isStaleSession = (sessionId?: number) =>
  typeof sessionId === "number" && sessionId !== currentSessionId;

const drawFrame = (frame: typeof pendingFrame): boolean => {
  if (!frame || !ctx || !canvas || !frame.width || !frame.height) return false;

  const expectedLen = frame.width * frame.height * 4;
  if (frame.rgba.length !== expectedLen) return false;

  if (canvas.width !== frame.width) canvas.width = frame.width;
  if (canvas.height !== frame.height) canvas.height = frame.height;

  ctx.putImageData(new ImageData(frame.rgba, frame.width, frame.height), 0, 0);

  self.postMessage({
    type: "FRAME_DRAWN",
    frameIndex: frame.producedIndex ?? frame.requestedIndex ?? 0,
    requestedIndex: frame.requestedIndex,
    producedIndex: frame.producedIndex,
    ffmpegErrors: frame.ffmpegErrors,
    width: frame.width,
    height: frame.height,
    processingMs: 0,
    cacheHit: false,
    quality: "fast",
  } satisfies FrameInfoMessage);

  return true;
};

// ── Message handler ────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case "INIT": {
      canvas = msg.canvas;
      ctx = canvas.getContext("2d", { willReadFrequently: false }) as OffscreenCanvasRenderingContext2D;
      videoId = msg.videoId;
      if (typeof msg.sessionId === "number") currentSessionId = msg.sessionId;
      pendingFrame = null;
      break;
    }

    case "START": {
      if (isStaleSession(msg.sessionId)) break;
      // Draw any frame that arrived before START (e.g. first scrub frame).
      if (pendingFrame) {
        if (drawFrame(pendingFrame)) pendingFrame = null;
      }
      break;
    }

    case "STOP": {
      if (isStaleSession(msg.sessionId)) break;
      // Nothing to do — the RAF loop in useVideoCanvas already stopped.
      break;
    }

    case "SET_STREAM_READY": {
      if (isStaleSession(msg.sessionId)) break;
      if (msg.videoId) videoId = msg.videoId;
      if (!msg.ready) pendingFrame = null;
      break;
    }

    case "UPDATE_VIDEO_ID": {
      if (typeof msg.sessionId === "number") currentSessionId = msg.sessionId;
      videoId = msg.videoId;
      pendingFrame = null;
      break;
    }

    case "DRAW_FRAME_ONCE": {
      // No-op — pull loop is on the main thread.
      break;
    }

    case "DRAW_RAW": {
      if (isStaleSession(msg.sessionId)) break;
      if (!ctx || !canvas || !msg.width || !msg.height) break;

      // Reject frames from a different video session.
      if (msg.videoId && videoId && msg.videoId !== videoId) break;

      // Normalise the rgba payload to Uint8ClampedArray.
      let rgba: Uint8ClampedArray;
      const payload = msg.rgba;
      if (payload instanceof Uint8ClampedArray) {
        rgba = payload;
      } else if (payload instanceof Uint8Array) {
        rgba = new Uint8ClampedArray(payload.buffer, payload.byteOffset, payload.byteLength);
      } else if (payload instanceof ArrayBuffer) {
        rgba = new Uint8ClampedArray(payload);
      } else if (Array.isArray(payload)) {
        rgba = new Uint8ClampedArray(payload);
      } else {
        break;
      }

      const expectedLen = msg.width * msg.height * 4;
      if (rgba.length !== expectedLen) break;

      // Reject frames where alpha channel is entirely zero (truly empty buffer).
      // We check alpha (byte index 3) rather than RGB to avoid dropping black frames.
      let hasNonZeroAlpha = false;
      for (let i = 3; i < rgba.length; i += Math.max(4, Math.floor(rgba.length / 64))) {
        if (rgba[i] !== 0) { hasNonZeroAlpha = true; break; }
      }
      if (!hasNonZeroAlpha) break;

      pendingFrame = {
        width: msg.width,
        height: msg.height,
        rgba: new Uint8ClampedArray(rgba),
        requestedIndex: msg.requestedIndex ?? msg.frameIndex,
        producedIndex: msg.producedIndex ?? msg.frameIndex,
        ffmpegErrors: msg.ffmpegErrors,
      };

      // Draw immediately — works for both scrub and playback.
      if (drawFrame(pendingFrame)) pendingFrame = null;
      break;
    }
  }
};
