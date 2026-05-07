interface ExtractVideoFramesOptions {
  maxFrames?: number;
  maxDimension?: number;
}

export interface VideoMetadataLike {
  width: number;
  height: number;
  fps: number;
  duration_seconds: number;
  estimated_frame_count: number;
  has_audio: boolean;
}

export interface ExtractVideoFramesResult {
  width: number;
  height: number;
  /** Each frame is a Uint8ClampedArray of RGBA bytes (width × height × 4). */
  frames: Uint8ClampedArray[];
  durationSeconds: number;
  sampledFrames: number;
}

type FileWithPath = File & { path?: string };

function waitForEvent(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve) => {
    const listener = () => {
      target.removeEventListener(event, listener as EventListener);
      resolve();
    };
    target.addEventListener(event, listener as EventListener, { once: true });
  });
}

function computeScaledSize(width: number, height: number, maxDimension: number) {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) {
    return { width, height };
  }

  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

export function getNativeFilePath(file: File | null | undefined): string | null {
  if (!file) {
    return null;
  }

  const nativePath = (file as FileWithPath).path;
  return typeof nativePath === "string" && nativePath.length > 0 ? nativePath : null;
}

export function buildSiblingOutputPath(inputPath: string, suffix: string, extension: string) {
  const normalized = inputPath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  const dir = lastSlash >= 0 ? normalized.slice(0, lastSlash) : ".";
  const fileName = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const stem = fileName.replace(/\.[^.]+$/, "");
  return `${dir}/${stem}-${suffix}.${extension}`;
}

export async function probeVideoFileMetadataLocal(file: File): Promise<VideoMetadataLike> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.preload = "metadata";

  try {
    await waitForEvent(video, "loadedmetadata");

    const width = Math.max(1, Math.floor(video.videoWidth || 1));
    const height = Math.max(1, Math.floor(video.videoHeight || 1));
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const estimatedFps = duration > 0 ? 30 : 0;

    return {
      width,
      height,
      fps: estimatedFps,
      duration_seconds: duration,
      estimated_frame_count: Math.max(0, Math.round(duration * estimatedFps)),
      has_audio: false,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBytes(bytes: number[] | Uint8Array, fileName: string, mimeType = "application/octet-stream") {
  const blob = new Blob([bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function imageToRgbaFrame(image: HTMLImageElement, maxDimension?: number): Promise<{ width: number; height: number; rgba: Uint8ClampedArray }> {
  const naturalW = image.naturalWidth || image.width;
  const naturalH = image.naturalHeight || image.height;
  const scale = maxDimension ? Math.min(1, maxDimension / Math.max(naturalW, naturalH)) : 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(naturalW * scale);
  canvas.height = Math.round(naturalH * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create canvas context");
  }

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  return {
    width: canvas.width,
    height: canvas.height,
    // .slice() copies typed array — no element-wise boxing to number[]
    rgba: imageData.data.slice(),
  };
}

export async function extractVideoFrames(
  file: File,
  options: ExtractVideoFramesOptions = {},
): Promise<ExtractVideoFramesResult> {
  const maxFrames = options.maxFrames ?? 8;
  const maxDimension = options.maxDimension ?? 480;

  // One shared object URL and one decode pipeline for predictable frame grabs.
  // This is slower than fully parallel extraction, but much more reliable
  // across browser/video codec combinations (prevents occasional black frames).
  const url = URL.createObjectURL(file);

  // First, probe duration and dimensions with a single element
  const probe = document.createElement("video");
  probe.src = url;
  probe.preload = "metadata";
  probe.muted = true;
  probe.playsInline = true;

  try {
    await waitForEvent(probe, "loadedmetadata");

    const sourceWidth = Math.max(1, Math.floor(probe.videoWidth));
    const sourceHeight = Math.max(1, Math.floor(probe.videoHeight));
    const duration = Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 1;

    const { width, height } = computeScaledSize(sourceWidth, sourceHeight, maxDimension);
    const sampleCount = Math.max(1, maxFrames);

    // Build seek timestamps
    const timestamps = Array.from({ length: sampleCount }, (_, i) =>
      sampleCount === 1 ? 0 : (i / (sampleCount - 1)) * Math.max(duration - 0.001, 0),
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Failed to create canvas context");
    }

    const seekTo = (time: number) =>
      new Promise<void>((resolve, reject) => {
        const onSeeked = () => {
          probe.removeEventListener("seeked", onSeeked);
          probe.removeEventListener("error", onError);
          resolve();
        };
        const onError = (e: Event) => {
          probe.removeEventListener("seeked", onSeeked);
          probe.removeEventListener("error", onError);
          reject(new Error(`Video seek error at t=${time}: ${(e as ErrorEvent).message ?? "unknown"}`));
        };

        probe.addEventListener("seeked", onSeeked, { once: true });
        probe.addEventListener("error", onError, { once: true });
        probe.currentTime = Math.max(0, Math.min(time, Math.max(duration - 0.001, 0)));
      });

    const frames: Uint8ClampedArray[] = [];
    for (const timestamp of timestamps) {
      await seekTo(timestamp);
      // Ensure the browser flushes decoded pixels before drawing.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      ctx.drawImage(probe, 0, 0, width, height);
      frames.push(ctx.getImageData(0, 0, width, height).data.slice());
    }

    return {
      width,
      height,
      frames,
      durationSeconds: duration,
      sampledFrames: frames.length,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Extract a single video frame at the specified timestamp in FULL resolution.
 * Use this for rendering — unlike extractVideoFrames (which caps at 480px),
 * this returns the native video dimensions so WYSIWYG is preserved.
 */
export async function extractSingleVideoFrame(
  file: File,
  timestampSecs: number,
): Promise<{ width: number; height: number; rgba: Uint8ClampedArray }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;

  try {
    await waitForEvent(video, "loadedmetadata");

    const width = Math.max(1, Math.floor(video.videoWidth));
    const height = Math.max(1, Math.floor(video.videoHeight));
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
        resolve();
      };
      const onError = (e: Event) => {
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
        reject(new Error(`Seek error: ${(e as ErrorEvent).message ?? "unknown"}`));
      };
      video.addEventListener("seeked", onSeeked, { once: true });
      video.addEventListener("error", onError, { once: true });
      video.currentTime = Math.max(0, Math.min(timestampSecs, Math.max(duration - 0.001, 0)));
    });

    // Let the browser flush decoded pixels
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Failed to create canvas context");

    ctx.drawImage(video, 0, 0, width, height);
    return { width, height, rgba: ctx.getImageData(0, 0, width, height).data.slice() };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function rgbaToImage(rgba: Uint8ClampedArray | number[], width: number, height: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Failed to create canvas context"));
      return;
    }

    // Avoid re-wrapping if already Uint8ClampedArray (zero extra allocation)
    const clamped = rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba);
    const imageData = new ImageData(clamped, width, height);
    ctx.putImageData(imageData, 0, 0);

    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to convert RGBA frame to image"));
    // JPEG encode is ~4× faster than PNG for preview frames; quality 0.85 is visually lossless at preview sizes
    img.src = canvas.toDataURL("image/jpeg", 0.85);
  });
}
