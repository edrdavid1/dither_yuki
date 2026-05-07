import { useState, useRef, useEffect, useCallback, useDeferredValue, useMemo } from "react";
import { type AnimationFrame, makeAnimationFrame } from "@/types/animationFrame";
import { DEFAULT_FRAME_SETTINGS } from "@/types/frameSettings";
import { MenuBar } from "@/components/MenuBar";
import { Toolbar } from "@/components/Toolbar";
import { ControlPanel } from "@/components/ControlPanel";
import { AppFooterBars } from "@/components/AppFooterBars";
import { AppOverlays } from "@/components/AppOverlays";
import { InspectorWindow } from "@/components/InspectorWindow";
import { LayersWindow } from "@/components/LayersWindow";
import { WorkspaceMain } from "@/components/WorkspaceMain";
import { type WorkspaceMode } from "@/components/WorkspaceModeSwitcher";
import { Dock } from "pixelarticons/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  COLOR_PALETTES,
  DITHERING_ALGORITHMS,
  getPaletteColors,
  normalizeColorPalette,
  normalizeDitheringAlgorithm,
  setCustomPalette,
  type ColorPalette,
  type DitheringAlgorithm,
} from "@/utils/dithering";
import { useImageWorker } from "@/hooks/useImageWorker";
import { useEditorControlSync } from "@/hooks/useEditorControlSync";
import { useLayerSession } from "@/hooks/useLayerSession";
import { useFilmstripSession } from "@/hooks/useFilmstripSession";
import { usePreviewOrchestration } from "@/hooks/usePreviewOrchestration";
import { exportSvgFrame, readBytesFromPath, saveSvgWithDialog, safeTauriInvoke, pickSaveProjectPath, pickOpenProjectPath } from "@/lib/tauriBridge";
import { useProjectStore } from "@/store/projectStore";
import { decodeFilmstripProjectData, encodeFilmstripProjectData } from "@/lib/animation/filmstripPersistence";
import { type FrameSettings } from "@/types/frameSettings";
import {
  buildSiblingOutputPath,
  downloadBytes,
  extractVideoFrames,
  extractSingleVideoFrame,
  getNativeFilePath,
  imageToRgbaFrame,
  probeVideoFileMetadataLocal,
  rgbaToImage,
  type VideoMetadataLike,
} from "@/lib/mediaWorkflow";
import {
  buildBackendLayersPayload,
  cloneLayer,
  cloneLayers,
  createDefaultLayer,
  type Layer,
} from "@/types/layers";
import { toast } from "sonner";

type SupportedAlgorithmName = (typeof DITHERING_ALGORITHMS)[number];
type SupportedPaletteName = (typeof COLOR_PALETTES)[number];

interface PresetSettings {
  algorithm: string;
  palette: string;
  intensity: number;
  contrast: number;
  brightness: number;
  saturation: number;
  pixelSize: number;
  blur: number;
  sharpness: number;
  noise: number;
}

interface PresetPayload {
  settings: PresetSettings;
}

interface PatternPresetPayload {
  name: string;
  algorithm: string;
  intensity: number;
  palette: [number, number, number][];
  params?: Record<string, unknown>;
  tags?: string[];
}

interface PatternPresetFilePayload {
  magic: string;
  version: number;
  preset: PatternPresetPayload;
}

interface ExportPatternPresetResponse {
  file_name: string;
  file_extension: string;
  bytes: number[];
}

interface ProcessVideoFramesResponse {
  width: number;
  height: number;
  frame_count: number;
  processed_frames: number[][];
}

interface ProcessVideoFramesPackedResponse {
  width: number;
  height: number;
  frame_count: number;
  frame_size: number;
  processed_frames_blob: number[];
}

interface RenderStillAnimationResponse {
  width: number;
  height: number;
  frame_count: number;
  processed_frames: number[][];
  rendered_frame_indices: number[];
}

interface ExportVideoFramesResponse {
  file_name: string;
  file_extension: string;
  bytes: number[];
}

interface ExportSvgResponse {
  file_name: string;
  file_extension: string;
  bytes: number[];
}

interface VideoJobProgressResponse {
  job_id: string;
  status: "queued" | "running" | "completed" | "cancelled" | "failed";
  current_frame: number;
  total_frames: number;
  cancellation_requested: boolean;
  output_path?: string | null;
  message?: string | null;
}

interface DependencyStatusResponse {
  ffmpeg_available: boolean;
  ffmpeg_version?: string | null;
  ffmpeg_source?: string | null;
  ffprobe_available: boolean;
  ffprobe_version?: string | null;
  ffprobe_source?: string | null;
}


interface VideoPreviewFrame {
  id: string;
  src: string;
  width: number;
  height: number;
  label: string;
}

const makeFrameId = () => `frame-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

const imageToFrameSrc = (image: HTMLImageElement) => image.currentSrc || image.src || "";

const blobToDataUrl = async (blob: Blob): Promise<string> =>
  await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to encode image blob"));
    reader.readAsDataURL(blob);
  });

const sourceToDataUrl = async (src: string): Promise<string> => {
  if (!src) return "";
  if (src.startsWith("data:")) return src;

  if (src.startsWith("blob:")) {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`Failed to read blob source: ${response.status} ${response.statusText}`);
    }
    return blobToDataUrl(await response.blob());
  }

  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to fetch image source: ${response.status} ${response.statusText}`);
  }
  return blobToDataUrl(await response.blob());
};

const loadImageFromBytes = (bytes: Uint8Array) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(new Blob([bytes as unknown as BlobPart]));
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image frame"));
    };
    image.src = objectUrl;
  });

const loadImageFromPath = async (filePath: string) => {
  const bytes = await readBytesFromPath(filePath);
  if (!bytes?.length) {
    throw new Error(`Failed to read image bytes from ${filePath}`);
  }
  return loadImageFromBytes(bytes);
};

const loadImageFromSrc = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const finalize = (resolvedSrc: string) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to load image frame"));
      image.src = resolvedSrc;
    };

    if (!src || src.startsWith("data:") || src.startsWith("blob:")) {
      finalize(src);
      return;
    }

    void fetch(src)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch image source: ${response.status} ${response.statusText}`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        image.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(image);
        };
        image.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Failed to load image frame"));
        };
        image.src = objectUrl;
      })
      .catch((error) => {
        // Fallback to the original source path if fetch is unavailable in this runtime.
        console.warn("[image-load] blob fetch fallback failed, using direct src", error);
        finalize(src);
      });
  });

// Keep preview close to source fidelity so inspector tuning matches final render.
// 4K is a practical ceiling for interactive UI memory usage.
const VIDEO_PREVIEW_MAX_DIMENSION = 4096;

const hexToRgb = (hexColor: string): [number, number, number] | null => {
  const normalized = hexColor.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
};

const rgbToHex = (rgb: [number, number, number]) => {
  const [r, g, b] = rgb;
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
};

const collectRgbPixels = (rgba: Uint8ClampedArray) => {
  const pixels: [number, number, number][] = [];
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3] ?? 255;
    if (alpha < 8) {
      continue;
    }
    pixels.push([rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0]);
  }
  return pixels;
};

const averageRgb = (pixels: [number, number, number][]) => {
  if (!pixels.length) {
    return [0, 0, 0] as [number, number, number];
  }
  let r = 0;
  let g = 0;
  let b = 0;
  for (const color of pixels) {
    r += color[0];
    g += color[1];
    b += color[2];
  }
  return [Math.round(r / pixels.length), Math.round(g / pixels.length), Math.round(b / pixels.length)] as [number, number, number];
};

const dominantChannel = (pixels: [number, number, number][]) => {
  let best = 0;
  let bestRange = -1;
  for (let channel = 0; channel < 3; channel += 1) {
    let min = 255;
    let max = 0;
    for (const color of pixels) {
      const value = color[channel] ?? 0;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const range = max - min;
    if (range > bestRange) {
      bestRange = range;
      best = channel;
    }
  }
  return best;
};

const medianCutPalette = (pixels: [number, number, number][], colorCount: number) => {
  const boxes: [number, number, number][][] = [pixels.slice()];

  while (boxes.length < colorCount) {
    let splitIndex = -1;
    let splitChannel = 0;
    let bestRange = -1;

    for (let i = 0; i < boxes.length; i += 1) {
      const bucket = boxes[i];
      if (!bucket || bucket.length <= 1) {
        continue;
      }
      const channel = dominantChannel(bucket);
      let min = 255;
      let max = 0;
      for (const color of bucket) {
        const value = color[channel] ?? 0;
        if (value < min) min = value;
        if (value > max) max = value;
      }
      const range = max - min;
      if (range > bestRange) {
        bestRange = range;
        splitIndex = i;
        splitChannel = channel;
      }
    }

    if (splitIndex < 0) {
      break;
    }

    const bucket = boxes[splitIndex];
    if (!bucket) {
      break;
    }
    const sorted = bucket.slice().sort((a, b) => (a[splitChannel] ?? 0) - (b[splitChannel] ?? 0));
    const mid = Math.floor(sorted.length / 2);
    const left = sorted.slice(0, mid);
    const right = sorted.slice(mid);

    boxes.splice(splitIndex, 1);
    if (left.length) boxes.push(left);
    if (right.length) boxes.push(right);
  }

  return boxes.map(averageRgb).slice(0, colorCount);
};

const kmeansPalette = (pixels: [number, number, number][], colorCount: number) => {
  const k = Math.max(1, Math.min(colorCount, pixels.length));
  const centers = Array.from({ length: k }, (_, i) => {
    const pos = Math.floor((i * pixels.length) / k);
    const color = pixels[Math.min(pos, pixels.length - 1)] ?? [0, 0, 0];
    return [color[0], color[1], color[2]] as [number, number, number];
  });

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const sums = Array.from({ length: k }, () => ({ r: 0, g: 0, b: 0, count: 0 }));

    for (const pixel of pixels) {
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < centers.length; i += 1) {
        const center = centers[i] ?? [0, 0, 0];
        const dr = (pixel[0] ?? 0) - (center[0] ?? 0);
        const dg = (pixel[1] ?? 0) - (center[1] ?? 0);
        const db = (pixel[2] ?? 0) - (center[2] ?? 0);
        const distance = dr * dr + dg * dg + db * db;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      }

      const sum = sums[bestIndex];
      if (!sum) {
        continue;
      }
      sum.r += pixel[0] ?? 0;
      sum.g += pixel[1] ?? 0;
      sum.b += pixel[2] ?? 0;
      sum.count += 1;
    }

    for (let i = 0; i < centers.length; i += 1) {
      const sum = sums[i];
      if (!sum || sum.count === 0) {
        continue;
      }
      centers[i] = [
        Math.round(sum.r / sum.count),
        Math.round(sum.g / sum.count),
        Math.round(sum.b / sum.count),
      ];
    }
  }

  return centers.slice(0, colorCount);
};

const octreeLikePalette = (pixels: [number, number, number][], colorCount: number) => {
  const depth = colorCount <= 8 ? 2 : colorCount <= 32 ? 3 : 4;
  const shift = 8 - depth;
  const buckets = new Map<number, { r: number; g: number; b: number; count: number }>();

  for (const pixel of pixels) {
    const r = (pixel[0] ?? 0) >> shift;
    const g = (pixel[1] ?? 0) >> shift;
    const b = (pixel[2] ?? 0) >> shift;
    const key = (r << 16) | (g << 8) | b;
    const existing = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    existing.r += pixel[0] ?? 0;
    existing.g += pixel[1] ?? 0;
    existing.b += pixel[2] ?? 0;
    existing.count += 1;
    buckets.set(key, existing);
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, colorCount)
    .map((bucket) => [
      Math.round(bucket.r / Math.max(bucket.count, 1)),
      Math.round(bucket.g / Math.max(bucket.count, 1)),
      Math.round(bucket.b / Math.max(bucket.count, 1)),
    ] as [number, number, number]);
};

const dedupePalette = (colors: [number, number, number][]) => {
  const unique = new Map<string, [number, number, number]>();
  for (const color of colors) {
    unique.set(`${color[0]}-${color[1]}-${color[2]}`, color);
  }
  return Array.from(unique.values());
};

const extractPaletteLocal = (
  rgba: Uint8ClampedArray,
  colorCount: number,
  method: string,
) => {
  const pixels = collectRgbPixels(rgba);
  if (!pixels.length) {
    return [] as [number, number, number][];
  }

  const target = Math.max(1, Math.min(256, Math.round(colorCount || 8)));

  let raw: [number, number, number][];
  if (method === "kmeans" || method === "k-means") {
    raw = kmeansPalette(pixels, target);
  } else if (method === "octree") {
    raw = octreeLikePalette(pixels, target);
  } else {
    raw = medianCutPalette(pixels, target);
  }

  return dedupePalette(raw).slice(0, target);
};

const saveExportedBytes = async (
  fileName: string,
  bytes: number[],
  mimeType?: string,
): Promise<string | null> => {
  const fileExtension = fileName.split(".").pop()?.toLowerCase();
  const selectedPath = await safeTauriInvoke<string | null>("plugin:dialog|save", {
    options: {
      title: "Save File",
      defaultPath: fileName,
      filters: fileExtension
        ? [{ name: mimeType ?? fileExtension.toUpperCase(), extensions: [fileExtension] }]
        : undefined,
    },
  });

  if (selectedPath) {
    const savedPath = await safeTauriInvoke<string>("save_bytes_to_path", {
      filePath: selectedPath,
      bytes,
    });
    if (savedPath) {
      return savedPath;
    }
  }

  downloadBytes(bytes, fileName, mimeType);
  return null;
};

const deriveVideoOutputExtension = (nameOrPath?: string | null) => {
  if (!nameOrPath) {
    return "mp4";
  }

  const fileName = nameOrPath.split(/[\\/]/).pop() ?? nameOrPath;
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext || ext.length > 5) {
    return "mp4";
  }

  return ext;
};

const Index = () => {
  const [algorithm, setAlgorithm] = useState<DitheringAlgorithm>("Floyd-Steinberg");
  const [palette, setPalette] = useState<ColorPalette>("Grayscale");
  const [intensity, setIntensity] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [brightness, setBrightness] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [pixelSize, setPixelSize] = useState(1);
  const [blur, setBlur] = useState(0);
  const [sharpness, setSharpness] = useState(0);
  const [noise, setNoise] = useState(0);
  const [blendMode, setBlendMode] = useState<string>("normal");
  const [layerOpacity, setLayerOpacity] = useState<number>(100);
  const [quantizationMethod, setQuantizationMethod] = useState<string>("median-cut");
  const [quantizationColorCount, setQuantizationColorCount] = useState<number>(8);
  const [quantizingPalette, setQuantizingPalette] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [imageSize, setImageSize] = useState<string>();
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [processedImage, setProcessedImage] = useState<HTMLImageElement | null>(null);
  const [showOriginal, setShowOriginal] = useState(true);
  const [showColorStudio, setShowColorStudio] = useState(false);
  const [customColors, setCustomColors] = useState<string[]>(["#000000", "#FFFFFF"]);
  const [snapGlitchToPalette, setSnapGlitchToPalette] = useState(false);
  const [paletteMix, setPaletteMix] = useState(100);
  const [globalSeed, setGlobalSeed] = useState(1337);
  const [glitchType, setGlitchType] = useState<"None" | "Pixel Sort" | "Block Noise" | "RGB Shift" | "Slice" | "Analog">("None");
  const [pixelSortMetric, setPixelSortMetric] = useState<"luma" | "saturation" | "hue" | "rgb-sum">("luma");
  const [pixelSortMask, setPixelSortMask] = useState<"all" | "dark" | "light">("all");
  const [thresholdMin, setThresholdMin] = useState(20);
  const [thresholdMax, setThresholdMax] = useState(80);
  const [angle, setAngle] = useState(0);
  const [sortLength, setSortLength] = useState(64);
  const [blockSize, setBlockSize] = useState(16);
  const [chaos, setChaos] = useState(40);
  const [quantization, setQuantization] = useState(45);
  const [redShiftX, setRedShiftX] = useState(4);
  const [redShiftY, setRedShiftY] = useState(0);
  const [greenShiftX, setGreenShiftX] = useState(0);
  const [greenShiftY, setGreenShiftY] = useState(0);
  const [blueShiftX, setBlueShiftX] = useState(-4);
  const [blueShiftY, setBlueShiftY] = useState(0);
  const [globalRgbShiftIntensity, setGlobalRgbShiftIntensity] = useState(70);
  const [sliceCount, setSliceCount] = useState(14);
  const [maxOffset, setMaxOffset] = useState(48);
  const [randomness, setRandomness] = useState(50);
  const [scanlineThickness, setScanlineThickness] = useState(1);
  const [scanlineGap, setScanlineGap] = useState(2);
  const [flicker, setFlicker] = useState(16);
  const [curvature, setCurvature] = useState(12);
  const [maskTarget, setMaskTarget] = useState<"all" | "edges" | "highlights" | "midtones" | "shadows">("all");
  const [maskFeather, setMaskFeather] = useState(0.2);
  const [showAbout, setShowAbout] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("image");
  const [focusMode, setFocusMode] = useState(false);
  const [leftPanelVisible, setLeftPanelVisible] = useState(true);
  const [backendConnected, setBackendConnected] = useState(false);
  const [algorithmOptions, setAlgorithmOptions] = useState<DitheringAlgorithm[]>(DITHERING_ALGORITHMS);
  const [paletteOptions, setPaletteOptions] = useState<ColorPalette[]>(COLOR_PALETTES);
  const [sourceImageFile, setSourceImageFile] = useState<File | null>(null);
  const [videoSource, setVideoSource] = useState<File | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadataLike | null>(null);
  const [videoPreviewFrames, setVideoPreviewFrames] = useState<VideoPreviewFrame[]>([]);
  const [selectedVideoPreviewFrame, setSelectedVideoPreviewFrame] = useState(0);
  const [videoPreviewBusy, setVideoPreviewBusy] = useState(false);
  const [videoDeps, setVideoDeps] = useState<DependencyStatusResponse | null>(null);
  const [shareablePatternAlgorithms, setShareablePatternAlgorithms] = useState<string[]>([]);
  // ── Unified filmstrip state ────────────────────────────────────────────────
  const [frames, setFrames] = useState<AnimationFrame[]>([]);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(0);
  const [playbackFrameIndex, setPlaybackFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationPreviewFps, setAnimationPreviewFps] = useState(12);
  const [animationPreviewSpeed, setAnimationPreviewSpeed] = useState(1);
  const [selectedFrameIds, setSelectedFrameIds] = useState<Set<string>>(new Set());
  const [layers, setLayers] = useState<Layer[]>(() => [createDefaultLayer("Layer 1")]);
  const [activeLayerId, setActiveLayerId] = useState<string>(() => layers[0]?.id ?? "");

  /** Full-resolution source RGBA cache for video-extracted frames. */
  const sourceRgbaMapRef = useRef<Map<string, Uint8ClampedArray>>(new Map());
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobKind, setJobKind] = useState<"video" | "animation" | null>(null);
  const [jobProgress, setJobProgress] = useState<VideoJobProgressResponse | null>(null);
  const [jobOutputPath, setJobOutputPath] = useState<string | null>(null);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowStatus, setWorkflowStatus] = useState<string>();
  const [previewProcessing, setPreviewProcessing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [isSavingExitWarning, setIsSavingExitWarning] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const presetImportInputRef = useRef<HTMLInputElement>(null);
  const jobPollMissesRef = useRef(0);
  const previewRequestIdRef = useRef(0);
  const framesRef = useRef<AnimationFrame[]>(frames);
  framesRef.current = frames;
  const layersRef = useRef<Layer[]>(layers);
  layersRef.current = layers;
  const activeLayerIdRef = useRef(activeLayerId);
  activeLayerIdRef.current = activeLayerId;
  const { processImage } = useImageWorker();
  const markProjectDirty = useCallback(() => {
    setHasUnsavedChanges(true);
  }, []);

  // Maximum dimension (px) used for live preview. High-res images are downscaled
  // to this limit before being sent to the backend, reducing IPC payload by up to
  // 10-20× for large photos while keeping the preview visually accurate.
  const MAX_PREVIEW_PX = 1200;

  // Deferred versions of pipeline params so slider drags don't queue
  // multiple heavy renders — React batches deferred updates and only
  // re-runs the pipeline when the value has "settled".
  const deferredAlgorithm = useDeferredValue(algorithm);
  const deferredPalette = useDeferredValue(palette);
  const deferredIntensity = useDeferredValue(intensity);
  const deferredContrast = useDeferredValue(contrast);
  const deferredBrightness = useDeferredValue(brightness);
  const deferredSaturation = useDeferredValue(saturation);
  const deferredBlur = useDeferredValue(blur);
  const deferredSharpness = useDeferredValue(sharpness);
  const deferredNoise = useDeferredValue(noise);
  const deferredGlitchType = useDeferredValue(glitchType);
  const deferredPixelSortMetric = useDeferredValue(pixelSortMetric);
  const deferredPixelSortMask = useDeferredValue(pixelSortMask);
  const deferredThresholdMin = useDeferredValue(thresholdMin);
  const deferredThresholdMax = useDeferredValue(thresholdMax);
  const deferredAngle = useDeferredValue(angle);
  const deferredSortLength = useDeferredValue(sortLength);
  const deferredBlockSize = useDeferredValue(blockSize);
  const deferredChaos = useDeferredValue(chaos);
  const deferredQuantization = useDeferredValue(quantization);
  const deferredRedShiftX = useDeferredValue(redShiftX);
  const deferredRedShiftY = useDeferredValue(redShiftY);
  const deferredGreenShiftX = useDeferredValue(greenShiftX);
  const deferredGreenShiftY = useDeferredValue(greenShiftY);
  const deferredBlueShiftX = useDeferredValue(blueShiftX);
  const deferredBlueShiftY = useDeferredValue(blueShiftY);
  const deferredGlobalRgbShiftIntensity = useDeferredValue(globalRgbShiftIntensity);
  const deferredSliceCount = useDeferredValue(sliceCount);
  const deferredMaxOffset = useDeferredValue(maxOffset);
  const deferredRandomness = useDeferredValue(randomness);
  const deferredScanlineThickness = useDeferredValue(scanlineThickness);
  const deferredScanlineGap = useDeferredValue(scanlineGap);
  const deferredFlicker = useDeferredValue(flicker);
  const deferredCurvature = useDeferredValue(curvature);
  const deferredSnapGlitchToPalette = useDeferredValue(snapGlitchToPalette);
  const deferredPaletteMix = useDeferredValue(paletteMix);
  const deferredGlobalSeed = useDeferredValue(globalSeed);
  const deferredMaskTarget = useDeferredValue(maskTarget);
  const deferredMaskFeather = useDeferredValue(maskFeather);

  const editorControlValues = useMemo(() => ({
    algorithm,
    palette,
    intensity,
    contrast,
    brightness,
    saturation,
    pixelSize,
    blur,
    sharpness,
    noise,
    blendMode,
    layerOpacity,
    glitchType,
    pixelSortMetric,
    pixelSortMask,
    thresholdMin,
    thresholdMax,
    angle,
    sortLength,
    blockSize,
    chaos,
    quantization,
    redShiftX,
    redShiftY,
    greenShiftX,
    greenShiftY,
    blueShiftX,
    blueShiftY,
    globalRgbShiftIntensity,
    sliceCount,
    maxOffset,
    randomness,
    scanlineThickness,
    scanlineGap,
    flicker,
    curvature,
    snapGlitchToPalette,
    globalSeed,
    paletteMix,
    maskTarget,
    maskFeather,
  }), [
    algorithm,
    palette,
    intensity,
    contrast,
    brightness,
    saturation,
    pixelSize,
    blur,
    sharpness,
    noise,
    blendMode,
    layerOpacity,
    glitchType,
    pixelSortMetric,
    pixelSortMask,
    thresholdMin,
    thresholdMax,
    angle,
    sortLength,
    blockSize,
    chaos,
    quantization,
    redShiftX,
    redShiftY,
    greenShiftX,
    greenShiftY,
    blueShiftX,
    blueShiftY,
    globalRgbShiftIntensity,
    sliceCount,
    maxOffset,
    randomness,
    scanlineThickness,
    scanlineGap,
    flicker,
    curvature,
    snapGlitchToPalette,
    globalSeed,
    paletteMix,
    maskTarget,
    maskFeather,
  ]);

  const activeAdjustments = [
    algorithm !== "None" && intensity !== 100,
    contrast !== 100,
    brightness !== 100,
    saturation !== 100,
    pixelSize !== 1,
    blur !== 0,
    sharpness !== 0,
    noise !== 0,
    glitchType !== "None",
  ].filter(Boolean).length;

  const currentSourceLabel = workspaceMode === "video"
    ? videoSource?.name ?? "No clip selected"
    : sourceImageFile?.name ?? imageSize ?? "No media";

  const paletteSwatches = palette === "Custom"
    ? customColors
    : getPaletteColors(palette)
        .map((color) => rgbToHex([
          color[0] ?? 0,
          color[1] ?? 0,
          color[2] ?? 0,
        ]));

  const customPaletteRgb = useMemo(
    () => customColors
      .map(hexToRgb)
      .filter((color): color is [number, number, number] => color !== null),
    [customColors],
  );

  const jobProgressText = jobProgress
    ? `${jobProgress.status} ${jobProgress.current_frame}/${jobProgress.total_frames}`
    : undefined;
  const jobProgressPercent = jobProgress && jobProgress.total_frames > 0
    ? Math.max(0, Math.min(100, Math.round((jobProgress.current_frame / jobProgress.total_frames) * 100)))
    : 0;

  const playbackIntervalMs = Math.max(16, Math.round(1000 / Math.max(1, animationPreviewFps * animationPreviewSpeed)));
  const canRenderVideo = Boolean(videoDeps?.ffmpeg_available && videoDeps?.ffprobe_available);
  const videoRenderBlockedReason = canRenderVideo
    ? undefined
    : "FFmpeg/FFprobe not found. Video render disabled.";

  const handleOpenFile = useCallback(() => {
    if (workspaceMode === "video") {
      videoInputRef.current?.click();
      return;
    }

    fileInputRef.current?.click();
  }, [workspaceMode]);

  const handleToolbarWorkspaceSelect = useCallback((nextMode: WorkspaceMode) => {
    setWorkspaceMode((currentMode) => {
      if (currentMode === nextMode) {
        setLeftPanelVisible((prev) => !prev);
        return currentMode;
      }

      setLeftPanelVisible(true);
      return nextMode;
    });
  }, []);

  useEffect(() => {
    const isSupportedAlgorithm = (value: string): value is DitheringAlgorithm =>
      DITHERING_ALGORITHMS.includes(value as SupportedAlgorithmName);

    const isSupportedPalette = (value: string): value is ColorPalette =>
      COLOR_PALETTES.includes(value as SupportedPaletteName);

    const loadBackendCatalog = async () => {
      const [backendAlgorithms, backendPalettes, patternAlgorithms, temporalModeList, easingModeList, parameterModeList] = await Promise.all([
        safeTauriInvoke<string[]>("list_algorithms"),
        safeTauriInvoke<string[]>("list_palettes"),
        safeTauriInvoke<string[]>("list_shareable_pattern_algorithms"),
        safeTauriInvoke<string[]>("list_temporal_variation_modes"),
        safeTauriInvoke<string[]>("list_animation_easing_modes"),
        safeTauriInvoke<string[]>("list_animation_parameter_modes"),
      ]);

      if (!backendAlgorithms && !backendPalettes) {
        setBackendConnected(false);
        return;
      }

      if (backendAlgorithms) {
        const supported = backendAlgorithms
          .map(normalizeDitheringAlgorithm)
          .filter(isSupportedAlgorithm);
        if (supported.length > 0) {
          setAlgorithmOptions(supported);
        }
      }

      if (backendPalettes) {
        const supported = backendPalettes
          .map(normalizeColorPalette)
          .filter((value): value is ColorPalette => isSupportedPalette(value));
        const merged = Array.from(new Set<ColorPalette>([...supported, "Custom"]));
        if (merged.length > 0) {
          setPaletteOptions(merged);
        }
      }

      if (patternAlgorithms) {
        setShareablePatternAlgorithms(patternAlgorithms);
      }

      setBackendConnected(true);
    };

    void loadBackendCatalog();
  }, []);

  useEffect(() => {
    const checkDependencies = async () => {
      const deps = await safeTauriInvoke<DependencyStatusResponse>("check_dependencies");
      if (!deps) {
        return;
      }

      setVideoDeps(deps);

      if (!deps.ffmpeg_available || !deps.ffprobe_available) {
        const details = [
          deps.ffmpeg_available ? null : "ffmpeg",
          deps.ffprobe_available ? null : "ffprobe",
        ].filter(Boolean).join(", ");

        toast.error(`Video dependencies not found: ${details}. Render Video is disabled.`);
      }
    };

    void checkDependencies();
  }, []);

  const handleVideoFile = (file: File) => {
    setVideoSource(file);
    setVideoPreviewFrames([]);
    setSelectedVideoPreviewFrame(0);
    setOriginalImage(null);
    setProcessedImage(null);
    setShowOriginal(true);
    setWorkflowStatus(`Video selected: ${file.name}`);
    setStatus(`Video loading preview…`);

    const nativePath = getNativeFilePath(file);
    const probe = async () => {
      if (nativePath) {
        const backendMetadata = await safeTauriInvoke<VideoMetadataLike>("probe_video_file_metadata", {
          inputPath: nativePath,
        });
        if (backendMetadata) {
          setVideoMetadata(backendMetadata);
          return;
        }
      }
      const fallbackMetadata = await probeVideoFileMetadataLocal(file);
      setVideoMetadata(fallbackMetadata);
    };
    void probe().catch((error) => {
      console.error("Failed to probe video metadata", error);
      setVideoMetadata(null);
    });

    const buildPreview = async () => {
      setVideoPreviewBusy(true);
      try {
        // Extract all preview frames in parallel (one <video> per timestamp)
        // Frame 0 at t=0 is nearly instant; the rest are decoded concurrently.
        const totalPreviewFrames = 5;
        const extracted = await extractVideoFrames(file, {
          maxFrames: totalPreviewFrames,
          maxDimension: VIDEO_PREVIEW_MAX_DIMENSION,
        });

        // Show frame 0 immediately while the rest are being converted
        if (extracted.frames[0]) {
          const firstImage = await rgbaToImage(extracted.frames[0], extracted.width, extracted.height);
          setVideoPreviewFrames([{
            id: "video-preview-0",
            src: firstImage.src,
            width: extracted.width,
            height: extracted.height,
            label: "0.0s",
          }]);
          setSelectedVideoPreviewFrame(0);
          setOriginalImage(firstImage);
          setProcessedImage(null);
          setShowOriginal(true);
          setImageSize(`${firstImage.width}×${firstImage.height}`);
          setStatus(`Video preview loading…`);
        }

        // Convert all frames (rgbaToImage is fast since JPEG encode)
        const converted = await Promise.all(
          extracted.frames.map(async (rgba, index) => {
            const image = await rgbaToImage(rgba, extracted.width, extracted.height);
            const seconds =
              extracted.sampledFrames <= 1
                ? 0
                : (index / Math.max(extracted.sampledFrames - 1, 1)) * extracted.durationSeconds;
            return {
              id: `video-preview-${index}`,
              src: image.src,
              width: extracted.width,
              height: extracted.height,
              label: `${seconds.toFixed(1)}s`,
            } satisfies VideoPreviewFrame;
          }),
        );

        setVideoPreviewFrames(converted);
        setSelectedVideoPreviewFrame(0);
        const firstFrame = converted[0];
        if (firstFrame) {
          const image = await loadImageFromSrc(firstFrame.src);
          setOriginalImage(image);
          setImageSize(`${image.width}×${image.height}`);
        }
        setStatus(`Video ready — ${converted.length} preview frames`);
      } catch (error) {
        console.error("Failed to extract video preview frames", error);
        toast.error("Failed to generate video preview timeline");
        setStatus("Video preview unavailable");
      } finally {
        setVideoPreviewBusy(false);
      }
    };
    void buildPreview();
  };

  const handleFile = useCallback((file: File) => {
    if (file.type.startsWith("video/")) {
      setWorkspaceMode("video");
      handleVideoFile(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const frameSrc = event.target?.result as string;
        const quantizeCanvas = document.createElement("canvas");
        quantizeCanvas.width = 128;
        quantizeCanvas.height = 128;
        const quantizeCtx = quantizeCanvas.getContext("2d");
        if (quantizeCtx) {
          quantizeCtx.imageSmoothingEnabled = true;
          quantizeCtx.drawImage(img, 0, 0, 256, 256);
          const sampled = extractPaletteLocal(
            quantizeCtx.getImageData(0, 0, 256, 256).data,
            Math.max(2, quantizationColorCount),
            quantizationMethod,
          );
          if (sampled.length >= 2) {
            const sampledHex = sampled.map(rgbToHex);
            setCustomColors(sampledHex);
            setCustomPalette(sampledHex);
            setPalette("Custom");
          }
        }
        setSourceImageFile(file);
        setOriginalImage(img);
        setProcessedImage(null);
        // Clear frames so the animation auto-populate effect creates a fresh
        // first frame with the CURRENT settings (not DEFAULT_FRAME_SETTINGS).
        setFrames([]);
        setSelectedFrameIndex(0);
        setIsPlaying(false);
        setImageSize(`${img.width}\u00d7${img.height}`);
        setStatus("Image loaded (palette sampled from source)");
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantizationColorCount, quantizationMethod]);

  useEffect(() => {
    const handleWindowDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
    };

    const handleWindowDrop = (event: DragEvent) => {
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      event.preventDefault();
      handleFile(file);
    };

    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("drop", handleWindowDrop);

    return () => {
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, [handleFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFile(file);
  };

  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleVideoFile(file);
  };

  const {
    captureEffectParams,
    applyEffectParams,
    handleUndo,
    handleRedo,
  } = useEditorControlSync({
    values: editorControlValues,
    setters: {
      setAlgorithm,
      setPalette,
      setIntensity,
      setContrast,
      setBrightness,
      setSaturation,
      setPixelSize,
      setBlur,
      setSharpness,
      setNoise,
      setBlendMode,
      setLayerOpacity,
      setGlitchType,
      setPixelSortMetric,
      setPixelSortMask,
      setThresholdMin,
      setThresholdMax,
      setAngle,
      setSortLength,
      setBlockSize,
      setChaos,
      setQuantization,
      setRedShiftX,
      setRedShiftY,
      setGreenShiftX,
      setGreenShiftY,
      setBlueShiftX,
      setBlueShiftY,
      setGlobalRgbShiftIntensity,
      setSliceCount,
      setMaxOffset,
      setRandomness,
      setScanlineThickness,
      setScanlineGap,
      setFlicker,
      setCurvature,
      setSnapGlitchToPalette,
      setGlobalSeed,
      setPaletteMix,
      setMaskTarget,
      setMaskFeather,
    },
  });

  const persistCurrentLayersToFrame = useCallback((nextLayers: Layer[], nextActiveLayerId = activeLayerIdRef.current) => {
    if (framesRef.current.length === 0) return;

    const snapshot = cloneLayers(nextLayers);
    const targetIndex = Math.max(0, Math.min(selectedFrameIndex, framesRef.current.length - 1));
    const targetFrame = framesRef.current[targetIndex];

    layersRef.current = snapshot;
    activeLayerIdRef.current = nextActiveLayerId;
    framesRef.current = framesRef.current.map((frame, index) => (
      index === targetIndex
        ? {
            ...frame,
            layers: snapshot,
            activeLayerId: nextActiveLayerId,
            isKeyframe: true,
          }
        : frame
    ));

    setFrames((prev) => prev.map((frame, index) => (
      index === targetIndex
        ? {
            ...frame,
            layers: snapshot,
            activeLayerId: nextActiveLayerId,
            isKeyframe: true,
          }
        : frame
    )));
    if (targetFrame) {
      void renderFramePreview(targetFrame.id, snapshot);
      markProjectDirty();
    }
  }, [selectedFrameIndex]);

  const activeLayersPayload = useMemo(() => {
    const mergedLayers = layers.map((layer) => (
      layer.id === activeLayerId
        ? {
            ...layer,
            settings: {
              ...layer.settings,
              ...editorControlValues,
            },
          }
        : layer
    ));

    return buildBackendLayersPayload(mergedLayers, customPaletteRgb);
  }, [activeLayerId, customPaletteRgb, editorControlValues, layers]);

  const applyLayerSnapshotToControls = useCallback((layerSnapshot: Layer | null) => {
    if (!layerSnapshot) return;
    setActiveLayerId(layerSnapshot.id);
    applyEffectParams(layerSnapshot.settings ?? DEFAULT_FRAME_SETTINGS);
  }, [applyEffectParams]);

  const commitControlsToActiveEffect = useCallback((): Layer[] | null => {
    const settings = captureEffectParams();
    const currentLayerId = activeLayerIdRef.current;

    const next = layersRef.current.map((layer) => {
      if (layer.id !== currentLayerId) return cloneLayer(layer);
      return {
        ...cloneLayer(layer),
        settings: { ...settings },
      };
    });

    setLayers(next);
    persistCurrentLayersToFrame(next, currentLayerId);
    markProjectDirty();
    return next;
  }, [captureEffectParams, persistCurrentLayersToFrame]);

  const {
    handleSelectLayer,
    handleToggleLayerVisibility,
    handleToggleLayerLock,
    handleAddLayer,
    handleDuplicateLayer,
    handleRemoveLayer,
    handleMoveLayer,
  } = useLayerSession({
    layersRef,
    activeLayerIdRef,
    setLayers: (value) => {
      setLayers(value);
      markProjectDirty();
    },
    setActiveLayerId,
    commitControlsToActiveEffect,
    applyLayerSnapshotToControls,
    persistCurrentLayersToFrame,
  });

  // ──────────────────────────────────────────────────────────────────────────

  const renderFramePreview = useCallback(async (
    frameId: string,
    snapshotLayers?: Layer[],
    sourceImage?: HTMLImageElement | null,
    forceProcessedImage = false,
  ): Promise<string | null> => {
    const frame = framesRef.current.find((item) => item.id === frameId) ?? null;
    if (!frame) return null;

    try {
      const image = sourceImage ?? await loadImageFromSrc(frame.src);
      const rgbaFrame = await imageToRgbaFrame(image, MAX_PREVIEW_PX);
      const payload = buildBackendLayersPayload(snapshotLayers ?? frame.layers, customPaletteRgb);

      const imageData = new ImageData(
        new Uint8ClampedArray(rgbaFrame.rgba),
        rgbaFrame.width,
        rgbaFrame.height,
      );

      const { buffer, width, height } = await processImage(imageData, payload);

      const previewImage = await rgbaToImage(new Uint8ClampedArray(buffer), width, height);
      const previewDataUrl = previewImage.src;

      setFrames((prev) => prev.map((item) => (
        item.id === frameId
          ? { ...item, previewDataUrl }
          : item
      )));

      if (forceProcessedImage || framesRef.current[selectedFrameIndex]?.id === frameId) {
        setProcessedImage(previewImage);
      }

      return previewDataUrl;
    } catch (error) {
      console.error("Failed to render frame preview", error);
      return null;
    }
  }, [customPaletteRgb, processImage, selectedFrameIndex]);

  const {
    handleAddFrameClone,
    handleImportAnimationFrame,
    handleDeleteSelectedFrame,
    handleSelectFrame,
    handleMultiSelectFrame,
    handleApplyToSelected,
    handleInterpolateSelected,
    handleToggleKeyframe,
  } = useFilmstripSession({
    workspaceMode,
    framesRef,
    layersRef,
    activeLayerIdRef,
    selectedFrameIndex,
    selectedFrameIds,
    frames,
    setFrames: (value) => {
      setFrames(value);
      markProjectDirty();
    },
    setSelectedFrameIndex,
    setSelectedFrameIds,
    setLayers: (value) => {
      setLayers(value);
      markProjectDirty();
    },
    setActiveLayerId,
    setIsPlaying,
    setShowOriginal,
    setStatus,
    commitControlsToActiveEffect,
    applyLayerSnapshotToControls,
    renderFramePreview,
    videoSource,
  });

  const renderInspectorPreview = useCallback(async (
    sourceImage: HTMLImageElement,
    _preferBackend: boolean,
  ) => {
    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    setPreviewProcessing(true);

    try {
      let previewImage: HTMLImageElement | null = null;

      const frame = await imageToRgbaFrame(sourceImage, MAX_PREVIEW_PX);
      const frameSize = frame.width * frame.height * 4;
      const packedResult = activeLayersPayload.length > 0
        ? await safeTauriInvoke<ProcessVideoFramesPackedResponse>(
            "process_video_frames_packed",
            {
              request: {
                width: frame.width,
                height: frame.height,
                frame_count: 1,
                frame_size: frameSize,
                frames_blob: new Uint8Array(frame.rgba),
                layers: activeLayersPayload,
                temporal: { enabled: false, mode: "sine", amount: 0, speed: 1, phase: 0 },
              },
            },
          )
        : null;

      if (packedResult?.frame_count) {
        const processedFrame = packedResult.processed_frames_blob.slice(0, packedResult.frame_size);
        previewImage = await rgbaToImage(processedFrame, packedResult.width, packedResult.height);
      }

      if (!previewImage) {
        const canvas = document.createElement("canvas");
        canvas.width = sourceImage.width;
        canvas.height = sourceImage.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Failed to create canvas context for preview");
        ctx.drawImage(sourceImage, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { buffer, width, height } = await processImage(imageData, activeLayersPayload);
        previewImage = await rgbaToImage(new Uint8ClampedArray(buffer), width, height);
      }

      if (requestId !== previewRequestIdRef.current) return;
      setProcessedImage(previewImage);
      setStatus("Ready");
    } catch (error) {
      if (requestId !== previewRequestIdRef.current) return;
      console.error("Failed to render inspector preview", error);
      setStatus("Preview error");
    } finally {
      setPreviewProcessing(false);
    }
  }, [activeLayersPayload, processImage]);

  usePreviewOrchestration({
    originalImage,
    workspaceMode,
    isPlaying,
    videoPreviewBusy,
    activeLayersPayload,
    processImage,
    renderInspectorPreview,
    setProcessedImage,
    setShowOriginal,
    setStatus,
    setPreviewProcessing,
    maxPreviewPx: MAX_PREVIEW_PX,
  });

  const handleToggleAnimationPlayback = useCallback(() => {
    if (workspaceMode !== "animation") return;
    if (frames.length <= 1) {
      toast.error("Add at least 2 frames to preview animation");
      return;
    }
    setIsPlaying((prev) => {
      const next = !prev;
      if (next) {
        setPlaybackFrameIndex(selectedFrameIndex);
        setShowOriginal(false);
      }
      return next;
    });
  }, [frames.length, selectedFrameIndex, workspaceMode]);

  /** Save current settings to this frame and mark it as a keyframe. */
  const handleApplyEffectToSelectedFrame = useCallback(() => {
    const committedLayers = commitControlsToActiveEffect() ?? cloneLayers(layersRef.current);
    setFrames((prev) =>
      prev.map((f, i) =>
        i === selectedFrameIndex
          ? {
              ...f,
              layers: cloneLayers(committedLayers),
              activeLayerId: activeLayerIdRef.current,
              isKeyframe: true,
            }
          : f,
      ),
    );
    setStatus(`Layer snapshot saved to frame ${selectedFrameIndex + 1} (keyframe)`);
    toast.success(`Frame ${selectedFrameIndex + 1} marked as keyframe`);
    markProjectDirty();
  }, [commitControlsToActiveEffect, selectedFrameIndex]);

  /**
   * Export animation: render each frame with its params, then export as GIF.
   */
  const handleExportAnimation = useCallback(async () => {
    if (!frames.length) {
      toast.error("No frames to render");
      return;
    }

    const committedLayers = commitControlsToActiveEffect() ?? cloneLayers(layersRef.current);
    const framesWithCurrentSaved = frames.map((f, i) =>
      i === selectedFrameIndex
        ? {
            ...f,
            layers: cloneLayers(committedLayers),
            activeLayerId: activeLayerIdRef.current,
          }
        : f,
    );

    setWorkflowBusy(true);
    setJobKind("animation");
    setStatus("Rendering frames...");
    const renderedRgbaFrames: Array<{ rgba: Uint8ClampedArray; width: number; height: number }> = [];

    for (let i = 0; i < framesWithCurrentSaved.length; i++) {
      const frame = framesWithCurrentSaved[i]!;
      setWorkflowStatus(`Rendering frame ${i + 1} / ${framesWithCurrentSaved.length}`);

      try {
        let sourceData: { width: number; height: number; rgba: Uint8ClampedArray };

        const cached = sourceRgbaMapRef.current.get(frame.id);
        if (cached) {
          sourceData = { width: frame.width, height: frame.height, rgba: cached };
        } else if (frame.sourceTimestamp !== undefined && videoSource) {
          const extracted = await extractSingleVideoFrame(videoSource, frame.sourceTimestamp);
          sourceRgbaMapRef.current.set(frame.id, extracted.rgba);
          sourceData = extracted;
        } else {
          const img = await loadImageFromSrc(frame.src);
          const rgbaFrame = await imageToRgbaFrame(img);
          sourceData = rgbaFrame;
        }

        const frameLayersPayload = buildBackendLayersPayload(frame.layers, customPaletteRgb);
        const imageData = new ImageData(
          new Uint8ClampedArray(sourceData.rgba),
          sourceData.width,
          sourceData.height,
        );
        const { buffer, width, height } = await processImage(imageData, frameLayersPayload);
        renderedRgbaFrames.push({ rgba: new Uint8ClampedArray(buffer), width, height });
      } catch (err) {
        console.error(`Frame ${i + 1} render failed`, err);
        toast.error(`Frame ${i + 1} failed, using original`);
        const img = await loadImageFromSrc(frame.src);
        const fallback = await imageToRgbaFrame(img);
        renderedRgbaFrames.push(fallback);
      }
    }

    const refFrame = renderedRgbaFrames[0];
    if (!refFrame) { setWorkflowBusy(false); return; }
    const { width, height } = refFrame;

    try {
      const exported = await safeTauriInvoke<ExportVideoFramesResponse>("export_video_frames", {
        request: {
          name: "animation",
          width,
          height,
          frames: renderedRgbaFrames.map((item) => Array.from(item.rgba)),
          format: "gif",
          fps: Math.max(1, animationPreviewFps * animationPreviewSpeed),
        },
      });

      if (!exported) {
        toast.error("Export unavailable in this runtime");
        setStatus("Export unavailable");
        return;
      }

      const savedPath = await saveExportedBytes(exported.file_name, exported.bytes, "image/gif");
      if (savedPath) {
        setJobOutputPath(savedPath);
        setWorkflowStatus(`Animation GIF saved: ${savedPath}`);
      }
      setStatus(`Exported GIF with ${framesWithCurrentSaved.length} frames`);
      toast.success(savedPath ? `Saved ${savedPath}` : `Exported ${exported.file_name}`);
    } catch (error) {
      console.error("Failed to export animation", error);
      setStatus("Export failed");
      toast.error("Failed to export animation");
    } finally {
      setWorkflowBusy(false);
    }
  }, [animationPreviewFps, animationPreviewSpeed, commitControlsToActiveEffect, customPaletteRgb, frames, layersRef, processImage, selectedFrameIndex, videoSource]);

  const handleRunVideoWorkflow = useCallback(async () => {
    if (workspaceMode !== "video") return;
    if (!videoSource) {
      toast.error("Load a video first");
      return;
    }

    setWorkflowBusy(true);
    setJobKind("video");
    setStatus("Submitting video workflow...");

    try {
      const nativePath = getNativeFilePath(videoSource);
      const sourceExtension = videoSource.name.split(".").pop() || "mp4";
      const outputPath = await safeTauriInvoke<string>("get_default_output_path", {
        fileName: `dither-yuki-video-${Date.now()}.${sourceExtension}`,
      });

      const requestBase = {
        layers: activeLayersPayload,
        temporal: { enabled: false, mode: "sine", amount: 0, speed: 1, phase: 0 },
        tracks: [],
        keep_audio: true,
      };

      const queuedJobId = nativePath
        ? await safeTauriInvoke<string>("process_video_file", {
            request: {
              input_path: nativePath,
              output_path: outputPath,
              ...requestBase,
            },
          })
        : await safeTauriInvoke<string>("process_video_file_bytes", {
            request: {
              original_name: videoSource.name,
              file_bytes: new Uint8Array(await videoSource.arrayBuffer()),
              output_path: outputPath,
              ...requestBase,
            },
          });

      if (queuedJobId) {
        setJobId(queuedJobId);
        setJobOutputPath(outputPath ?? null);
        setWorkflowStatus("Video job queued in backend render pipeline");
        return;
      }

      setWorkflowStatus("Video workflow command failed (backend reachable, but job queue command returned no result)");
      setStatus("Video workflow command failed");
      toast.error("Video backend command failed. Check app logs and FFmpeg setup.");
      setWorkflowBusy(false);
    } catch (error) {
      console.error("Video workflow failed", error);
      setWorkflowStatus("Video workflow failed");
      setStatus("Video workflow error");
      setWorkflowBusy(false);
      toast.error("Failed to run video workflow");
    }
  }, [activeLayersPayload, videoSource, workspaceMode]);

  const handleCancelActiveJob = useCallback(async () => {
    if (!jobId) {
      return;
    }

    const cancelled = await safeTauriInvoke<VideoJobProgressResponse>("cancel_video_processing_job", { jobId });
    if (cancelled) {
      setJobProgress(cancelled);
      setWorkflowStatus(cancelled.message ?? "Cancellation requested");
      toast.success("Cancellation requested");
    }
  }, [jobId]);

  useEffect(() => {
    if (workspaceMode === "video" || workspaceMode === "animation") {
      setLeftPanelVisible(true);
    }
  }, [workspaceMode]);

  useEffect(() => {
    if (workspaceMode !== "animation") return;
    commitControlsToActiveEffect();
  }, [commitControlsToActiveEffect, workspaceMode]);

  useEffect(() => {
    if (workspaceMode !== "video") {
      return;
    }

    const frame = videoPreviewFrames[selectedVideoPreviewFrame];
    if (!frame) {
      return;
    }

    void loadImageFromSrc(frame.src)
      .then((image) => {
        setOriginalImage(image);
        setProcessedImage(null);
        setShowOriginal(true);
        setImageSize(`${image.width}×${image.height}`);
      })
      .catch((error) => {
        console.error("Failed to load selected video preview frame", error);
      });
  }, [selectedVideoPreviewFrame, videoPreviewFrames, workspaceMode]);

  useEffect(() => {
    if (!jobId) {
      jobPollMissesRef.current = 0;
      return;
    }

    const poll = async () => {
      const nextProgress = await safeTauriInvoke<VideoJobProgressResponse>("get_video_processing_progress", { jobId });
      if (!nextProgress) {
        jobPollMissesRef.current += 1;
        if (jobPollMissesRef.current >= 10) {
          setWorkflowBusy(false);
          setWorkflowStatus("Lost backend progress channel. Check Tauri process/logs and retry render.");
          setStatus("Backend progress unavailable");
          toast.error("Lost render progress channel (backend unavailable)");
          setJobId(null);
        }
        return;
      }

      jobPollMissesRef.current = 0;

      setJobProgress(nextProgress);
      setWorkflowStatus(nextProgress.message ?? `${nextProgress.status} ${nextProgress.current_frame}/${nextProgress.total_frames}`);

      if (nextProgress.output_path) {
        setJobOutputPath(nextProgress.output_path);
      }

      if (["completed", "failed", "cancelled"].includes(nextProgress.status)) {
        setStatus(
          nextProgress.status === "completed"
            ? `${jobKind === "video" ? "Video" : "Animation"} backend render complete`
            : `${jobKind === "video" ? "Video" : "Animation"} backend render ${nextProgress.status}`,
        );

        if (nextProgress.status === "failed") {
          toast.error(nextProgress.message ?? "Backend render failed");
        }

        setWorkflowBusy(false);
        setJobId(null);
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 1000);

    return () => window.clearInterval(timer);
  }, [jobId, jobKind]);

  // ── Auto-populate filmstrip when image is loaded in animation mode ───────
  useEffect(() => {
    if (workspaceMode !== "animation") return;
    if (!originalImage) return;
    if (frames.length > 0) return; // already has frames

    let cancelled = false;
    void (async () => {
      const src = await sourceToDataUrl(imageToFrameSrc(originalImage));
      if (!src || cancelled) return;
      const snapshotLayers = commitControlsToActiveEffect() ?? cloneLayers(layersRef.current);
      const initialFrame = makeAnimationFrame({
        id: makeFrameId(),
        src,
        width: originalImage.width,
        height: originalImage.height,
        layers: snapshotLayers,
        activeLayerId: activeLayerIdRef.current,
        isKeyframe: true,
      });
      setFrames([initialFrame]);
      setSelectedFrameIndex(0);
      setSelectedFrameIds(new Set([initialFrame.id]));
    })().catch((error) => {
      console.error("Failed to create initial animation frame", error);
    });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitControlsToActiveEffect, workspaceMode, originalImage]);

  // ── Load selected frame + its layer snapshot into the preview ────────────
  useEffect(() => {
    if (workspaceMode !== "animation") return;

    const frameIndex = isPlaying ? playbackFrameIndex : selectedFrameIndex;
    const frame = framesRef.current[frameIndex];
    if (!frame) return;

    void loadImageFromSrc(frame.src)
      .then((image) => {
        setOriginalImage(image);
        setImageSize(`${image.width}×${image.height}`);

        if (isPlaying) {
          if (frame.previewDataUrl) {
            void loadImageFromSrc(frame.previewDataUrl)
              .then((preview) => {
                setProcessedImage(preview);
              })
              .catch((error) => {
                console.error("Failed to load cached frame preview", error);
                void renderFramePreview(frame.id, frame.layers, image, true);
              });
          } else {
            void renderFramePreview(frame.id, frame.layers, image, true);
          }
          return;
        }

        setLayers(cloneLayers(frame.layers));
        setActiveLayerId(frame.activeLayerId ?? frame.layers[0]?.id ?? "");
        const snapshotLayer = frame.layers.find((layer) => layer.id === (frame.activeLayerId ?? frame.layers[0]?.id)) ?? frame.layers[0] ?? null;
        applyLayerSnapshotToControls(snapshotLayer);

        if (frame.previewDataUrl) {
          void loadImageFromSrc(frame.previewDataUrl)
            .then((preview) => {
              setProcessedImage(preview);
            })
            .catch((error) => {
              console.error("Failed to load cached frame preview", error);
              void renderFramePreview(frame.id, frame.layers, image);
            });
        } else {
          void renderFramePreview(frame.id, frame.layers, image);
        }
      })
      .catch((error) => {
        console.error("Failed to load selected animation frame", error);
      });
  }, [applyLayerSnapshotToControls, isPlaying, playbackFrameIndex, renderFramePreview, selectedFrameIndex, workspaceMode]);

  // ── Unified play loop — cycles selectedFrameIndex at animationPreviewFps ──
  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return;

    const timer = window.setInterval(() => {
      setPlaybackFrameIndex((prev) => (prev + 1) % frames.length);
    }, playbackIntervalMs);

    return () => window.clearInterval(timer);
  }, [frames.length, isPlaying, playbackIntervalMs]);

  

  const handleReset = useCallback(() => {
    setProcessedImage(null);
    setShowOriginal(true);
    setIntensity(100);
    setContrast(100);
    setBrightness(100);
    setSaturation(100);
    setPixelSize(1);
    setBlur(0);
    setSharpness(0);
    setNoise(0);
    setStatus("Ready");
    setHasUnsavedChanges(true);
  }, []);

  // Save current processed image as PNG (was the old "Save")
  const handleExportImage = useCallback(() => {
    const imageToSave = processedImage || originalImage;
    if (!imageToSave) {
      toast.error("No image to export!");
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = imageToSave.width;
    canvas.height = imageToSave.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(imageToSave, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `dithered_${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
        }
      });
    }
  }, [originalImage, processedImage]);

  // Save / Open project (.dyproj) ─────────────────────────────────────────
  const newProject = useProjectStore((s) => s.newProject);
  const loadProject = useProjectStore((s) => s.loadProject);
  const updateManifest = useProjectStore((s) => s.updateManifest);
  const projectManifest = useProjectStore((s) => s.manifest);

  const handleNewProject = useCallback(() => {
    newProject("Untitled Project");
    const defaultLayer = createDefaultLayer("Layer 1");
    setSourceImageFile(null);
    setVideoSource(null);
    setVideoMetadata(null);
    setVideoPreviewFrames([]);
    setSelectedVideoPreviewFrame(0);
    setOriginalImage(null);
    setProcessedImage(null);
    setShowOriginal(true);
    setFrames([]);
    setSelectedFrameIndex(0);
    setPlaybackFrameIndex(0);
    setSelectedFrameIds(new Set());
    setLayers([defaultLayer]);
    setActiveLayerId(defaultLayer.id);
    applyEffectParams(DEFAULT_FRAME_SETTINGS);
    setWorkspaceMode("image");
    setStatus("New project created");
    setWorkflowStatus(undefined);
    setJobId(null);
    setJobKind(null);
    setJobProgress(null);
    setJobOutputPath(null);
    setWorkflowBusy(false);
    setHasUnsavedChanges(true);
  }, [applyEffectParams, newProject]);

  const handleSaveProject = useCallback(async (): Promise<boolean> => {
    try {
      const committedLayers = commitControlsToActiveEffect() ?? cloneLayers(layersRef.current);
      const framesForSave = framesRef.current.map((frame, index) => (
        index === selectedFrameIndex
          ? {
              ...frame,
              layers: cloneLayers(committedLayers),
              activeLayerId: activeLayerIdRef.current,
              isKeyframe: true,
            }
          : frame
      ));
      const timelineData = encodeFilmstripProjectData({
        version: 1,
        frames: framesForSave,
        selectedFrameIndex,
        selectedFrameIds: Array.from(selectedFrameIds),
      });

      // Ensure a manifest exists — create one if this is the first save.
      if (!projectManifest) {
        const name = originalImage
          ? (sourceImageFile?.name.replace(/\.[^.]+$/, "") ?? "Untitled Project")
          : "Untitled Project";
        newProject(name);
      }

      // Persist currently loaded source image as a manifest asset (for project reopen).
      // Works both for real files (native path exists) and in-memory images (canvas fallback).
      if (originalImage) {
        const existingImageAsset = useProjectStore.getState().manifest?.assets.find((a) => a.assetType === "image" && !a.offline);
        const nativeImagePath = getNativeFilePath(sourceImageFile) ?? existingImageAsset?.originalPath ?? null;
        let stagedPath: string | null = nativeImagePath;
        let storageMode: "external" | "embedded" = nativeImagePath ? (sourceImageFile ? "external" : "embedded") : "embedded";
        let imageBytes: number[] | null = null;
        const imageName = sourceImageFile?.name ?? "source-image.png";

        if (!stagedPath) {
          if (sourceImageFile) {
            imageBytes = Array.from(new Uint8Array(await sourceImageFile.arrayBuffer()));
          } else {
            const canvas = document.createElement("canvas");
            canvas.width = originalImage.naturalWidth || originalImage.width;
            canvas.height = originalImage.naturalHeight || originalImage.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              throw new Error("Failed to create canvas context for source image staging");
            }
            ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise<Blob | null>((resolve) => {
              canvas.toBlob(resolve, "image/png");
            });
            if (!blob) {
              throw new Error("Failed to encode source image for project save");
            }
            imageBytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
          }

          const extension = imageName.split(".").pop()?.toLowerCase() || "png";
          const tmpPath = `/tmp/dither-yuki/staging/source-${crypto.randomUUID()}.${extension}`;
          const writePath = await safeTauriInvoke<string>("save_bytes_to_path", {
            filePath: tmpPath,
            bytes: imageBytes,
          });
          if (!writePath) {
            throw new Error("Failed to stage source image for project save");
          }
          stagedPath = writePath;
          storageMode = "embedded";
        }

        updateManifest((m) => {
          const existingImageAsset = m.assets.find((a) => a.assetType === "image");
          const imageAssetId = existingImageAsset?.id ?? `image-${crypto.randomUUID()}`;
          const imageSize = sourceImageFile?.size ?? imageBytes?.length ?? existingImageAsset?.sizeBytes ?? 0;
          const filtered = m.assets.filter((a) => a.id !== imageAssetId && a.assetType !== "image");
          const customPaletteColors = customColors
            .map(hexToRgb)
            .filter((color): color is [number, number, number] => color !== null);

          return {
            ...m,
            palettes: palette === "Custom" && customPaletteColors.length > 0
              ? [{
                  id: "custom-palette",
                  name: "Custom",
                  colors: customPaletteColors,
                }]
              : [],
            assets: [
              {
                id: imageAssetId,
                name: imageName || existingImageAsset?.name || "source-image.png",
                assetType: "image",
                storage: storageMode,
                originalPath: stagedPath,
                hash: null,
                sizeBytes: imageSize,
                offline: false,
              },
              ...filtered,
            ],
          };
        });
      }

      // Re-read filePath from store after potential newProject() call.
      const existingPath = useProjectStore.getState().filePath;
      const path = existingPath ?? await pickSaveProjectPath(
        projectManifest?.name
          ? `${projectManifest.name}.dyproj`
          : `${sourceImageFile?.name.replace(/\.[^.]+$/, "") ?? "project"}.dyproj`,
      );
      if (!path) {
        // User cancelled the dialog
        return false;
      }
      const normalizedPath = path.toLowerCase().endsWith(".dyproj") ? path : `${path}.dyproj`;
      const saveResult = await useProjectStore.getState().saveProject(normalizedPath, timelineData);
      if (saveResult === null) {
        throw new Error("save_project returned empty result");
      }
      toast.success(`Project saved: ${normalizedPath.split("/").pop()}`);
      setStatus("Project saved");
      setHasUnsavedChanges(false);
      return true;
    } catch (err) {
      console.error("Save project failed", err);
      toast.error(`Failed to save project: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }, [activeLayerIdRef, commitControlsToActiveEffect, framesRef, layersRef, newProject, originalImage, projectManifest, selectedFrameIds, selectedFrameIndex, sourceImageFile, updateManifest]);

  useEffect(() => {
    if (!backendConnected) {
      return;
    }

    console.log("[exit-debug] syncing dirty state to Rust:", hasUnsavedChanges);
    void safeTauriInvoke("set_project_dirty", { dirty: hasUnsavedChanges });

    let unlisten: (() => void) | undefined;

    const setupExitListener = async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen("app-exit-requested", async () => {
        console.log("[exit-debug] app-exit-requested received; dirty=", hasUnsavedChanges);
        if (!hasUnsavedChanges) {
          console.log("[exit-debug] no unsaved changes; exiting immediately");
          await safeTauriInvoke("exit_app", {});
          return;
        }

        console.log("[exit-debug] unsaved changes present; showing warning dialog");
        setShowExitWarning(true);
      });
    };

    void setupExitListener();

    return () => {
      void unlisten?.();
    };
  }, [backendConnected, hasUnsavedChanges, handleSaveProject]);

  const handleSaveAndExit = useCallback(async () => {
    setIsSavingExitWarning(true);
    try {
      const saved = await handleSaveProject();
      if (saved) {
        setShowExitWarning(false);
        setHasUnsavedChanges(false);
        console.log("[exit-debug] saved via exit dialog; exiting app");
        await safeTauriInvoke("exit_app", {});
      }
    } finally {
      setIsSavingExitWarning(false);
    }
  }, [handleSaveProject, hasUnsavedChanges]);

  const handleDiscardAndExit = useCallback(async () => {
    setShowExitWarning(false);
    setHasUnsavedChanges(false);
    console.log("[exit-debug] discard clicked; exiting app");
    await safeTauriInvoke("exit_app", {});
  }, []);

  const handleCancelExitWarning = useCallback(() => {
    setShowExitWarning(false);
  }, []);

  const handleOpenProject = useCallback(async () => {
    try {
      const path = await pickOpenProjectPath();
      if (!path) return;
      const result = await loadProject(path);
      toast.success(`Project opened: ${path.split("/").pop()}`);
      if (result.offlineAssets.length) {
        toast.warning(`${result.offlineAssets.length} asset(s) could not be relinked`);
      }
      setHasUnsavedChanges(false);

      const loadedManifest = useProjectStore.getState().manifest;
      const imageAsset = loadedManifest?.assets.find((a) => a.assetType === "image" && !a.offline)
        ?? loadedManifest?.assets.find((a) => !a.offline && /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name));
      const filmstrip = decodeFilmstripProjectData(result.timelineData);
      const savedCustomPalette = loadedManifest?.palettes?.find((entry) => entry.name === "Custom" || entry.id === "custom-palette")?.colors?.length
        ? loadedManifest.palettes.find((entry) => entry.name === "Custom" || entry.id === "custom-palette")?.colors.map(([r, g, b]) => rgbToHex([r, g, b]))
        : null;

      if (savedCustomPalette?.length) {
        setCustomColors(savedCustomPalette);
        setCustomPalette(savedCustomPalette);
        setPaletteOptions((prev) => (prev.includes("Custom") ? prev : [...prev, "Custom"]));
      }

      const hydrateFilmstripSelection = (filmstripData: ReturnType<typeof decodeFilmstripProjectData>) => {
        if (!filmstripData?.frames.length) {
          return false;
        }

        const selectedIndex = Math.max(0, Math.min(filmstripData.selectedFrameIndex, filmstripData.frames.length - 1));
        const selectedFrame = filmstripData.frames[selectedIndex] ?? filmstripData.frames[0];
        const selectedFrameId = selectedFrame?.id;
        const selectedLayerId = selectedFrame?.activeLayerId ?? selectedFrame?.layers[0]?.id ?? "";
        const selectedLayer = selectedFrame?.layers.find((layer) => layer.id === selectedLayerId) ?? selectedFrame?.layers[0] ?? null;

        setFrames(filmstripData.frames);
        setSelectedFrameIndex(selectedIndex);
        setSelectedFrameIds(new Set(filmstripData.selectedFrameIds.length ? filmstripData.selectedFrameIds : selectedFrameId ? [selectedFrameId] : []));
        setLayers(selectedFrame ? cloneLayers(selectedFrame.layers) : [createDefaultLayer("Layer 1")]);
        setActiveLayerId(selectedLayerId);
        applyLayerSnapshotToControls(selectedLayer);
        setWorkspaceMode("animation");
        setStatus("Project loaded with filmstrip");
        return true;
      };

      if (imageAsset) {
        try {
          const restored = imageAsset.originalPath
            ? await loadImageFromPath(imageAsset.originalPath)
            : null;
          if (!restored) {
            throw new Error("No valid source image path available");
          }
          setOriginalImage(restored);
          setProcessedImage(null);
          setShowOriginal(true);
          setImageSize(`${restored.width}×${restored.height}`);
          if (!hydrateFilmstripSelection(filmstrip)) {
            setWorkspaceMode("image");
            setStatus("Project loaded");
          }
        } catch (imageErr) {
          if (imageAsset.originalPath) {
            try {
              const restored = await loadImageFromPath(imageAsset.originalPath);
              setOriginalImage(restored);
              setProcessedImage(null);
              setShowOriginal(true);
              setImageSize(`${restored.width}×${restored.height}`);
              if (!hydrateFilmstripSelection(filmstrip)) {
                setWorkspaceMode("image");
                setStatus("Project loaded");
              }
              return;
            } catch (fallbackErr) {
              console.error("Project opened, but image restore failed", imageErr, fallbackErr);
            }
          } else {
            console.error("Project opened, but image restore failed", imageErr);
          }
          toast.warning("Project opened, but source image could not be restored");
          setStatus("Project loaded (image unavailable)");
        }
      } else {
        if (!hydrateFilmstripSelection(filmstrip)) {
          setStatus("Project loaded (no source image asset)");
        }
      }
    } catch (err) {
      console.error("Open project failed", err);
      toast.error("Failed to open project");
    }
  }, [loadProject]);

  const handleExport = useCallback(() => {
    handleExportImage();
  }, [handleExportImage]);

  const handleExtractPaletteFromCurrentImage = useCallback(async (): Promise<string[] | null> => {
    const imageSource = processedImage || originalImage;
    if (!imageSource) {
      toast.error("Load an image first");
      return null;
    }

    setQuantizingPalette(true);
    setStatus("Extracting palette...");

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to create canvas context for quantization");
      }

      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(imageSource, 0, 0, 256, 256);
      const imageData = ctx.getImageData(0, 0, 256, 256);

      const backendExtracted = await safeTauriInvoke<[number, number, number][]>("extract_palette", {
        image_bytes: Array.from(imageData.data),
        color_count: quantizationColorCount,
        method: quantizationMethod,
      });

      const extracted = backendExtracted?.length
        ? backendExtracted
        : extractPaletteLocal(imageData.data, quantizationColorCount, quantizationMethod);

      if (!extracted.length) {
        toast.error("Palette extraction failed in this runtime");
        setStatus("Palette extraction unavailable");
        return null;
      }

      const hexColors = extracted.map(rgbToHex);

      setCustomColors(hexColors);
      setCustomPalette(hexColors);
      setPaletteOptions((prev) => (prev.includes("Custom") ? prev : [...prev, "Custom"]));
      setPalette("Custom");

      if (backendExtracted?.length) {
        toast.success(`Extracted ${hexColors.length} colors`);
      } else {
        toast.success(`Extracted ${hexColors.length} colors (local fallback)`);
      }
      setStatus("Palette extracted");
      return hexColors;
    } catch (error) {
      console.error("Auto-quantization failed", error);
      toast.error("Failed to extract palette");
      setStatus("Palette extraction error");
      return null;
    } finally {
      setQuantizingPalette(false);
    }
  }, [originalImage, processedImage, quantizationColorCount, quantizationMethod]);

  const handleExportSvg = useCallback(async () => {
    const imageToSave = processedImage || originalImage;
    if (!imageToSave) {
      toast.error("No image to export!");
      return;
    }

    try {
      const frame = await imageToRgbaFrame(imageToSave);
      const exported = await exportSvgFrame({
        name: `dithered-${Date.now()}`,
        width: frame.width,
        height: frame.height,
        frame: Array.from(frame.rgba),
        pixel_size: 1,
        shape: "square",
        include_transparent: false,
      });

      if (!exported) {
        toast.error("SVG export is available in desktop backend mode");
        return;
      }

      const savedPath = await saveSvgWithDialog(exported.file_name, exported.bytes);
      if (savedPath) {
        setWorkflowStatus(`SVG exported: ${savedPath}`);
        toast.success(`Exported ${savedPath}`);
      } else {
        // Fallback for web/non-dialog runtime.
        downloadBytes(exported.bytes, exported.file_name, "image/svg+xml");
        toast.success(`Exported ${exported.file_name}`);
      }
    } catch (error) {
      console.error("SVG export failed", error);
      toast.error("Failed to export SVG");
    }
  }, [originalImage, processedImage]);

  const handleLoadPreset = (preset: PresetPayload) => {
    const normalizedAlgorithm = normalizeDitheringAlgorithm(preset.settings.algorithm);
    const nextAlgorithm = DITHERING_ALGORITHMS.includes(normalizedAlgorithm as SupportedAlgorithmName)
      ? (normalizedAlgorithm as DitheringAlgorithm)
      : "Floyd-Steinberg";

    const normalizedPalette = normalizeColorPalette(preset.settings.palette);
    const nextPalette = COLOR_PALETTES.includes(normalizedPalette as SupportedPaletteName)
      ? (normalizedPalette as ColorPalette)
      : "Grayscale";

    setAlgorithm(nextAlgorithm);
    setPalette(nextPalette);
    setIntensity(preset.settings.intensity);
    setContrast(preset.settings.contrast);
    setBrightness(preset.settings.brightness);
    setSaturation(preset.settings.saturation);
    setPixelSize(preset.settings.pixelSize);
    setBlur(preset.settings.blur);
    setSharpness(preset.settings.sharpness);
    setNoise(preset.settings.noise);
    setHasUnsavedChanges(true);
  };

  const handleExportPatternPreset = useCallback(async () => {
    const presetName = `${algorithm} preset`;

    const isShareable = shareablePatternAlgorithms.length === 0 || shareablePatternAlgorithms.includes(algorithm);
    if (!isShareable) {
      toast.warning(`Algorithm ${algorithm} is outside the shareable list. Exporting local preset format.`);
    }

    const customPalette = customColors
      .map(hexToRgb)
      .filter((color): color is [number, number, number] => color !== null);

    const builtInPalette = palette === "Custom"
      ? []
      : getPaletteColors(palette as ColorPalette).map((color) => [
          color[0] ?? 0,
          color[1] ?? 0,
          color[2] ?? 0,
        ] as [number, number, number]);

    const exportPalette = palette === "Custom" ? customPalette : builtInPalette;

    const payload = {
      name: presetName,
      description: `Exported from ${workspaceMode} workspace`,
      author: "DitherYuki",
      algorithm,
      intensity,
      params: {
        contrast,
        brightness,
        saturation,
        pixelSize,
        blur,
        sharpness,
        noise,
      },
      tags: [workspaceMode, "dither"],
      palette_name: palette === "Custom" ? undefined : palette,
      palette: exportPalette,
    };

    const exported = await safeTauriInvoke<ExportPatternPresetResponse>("export_pattern_preset", { request: payload });

    if (exported) {
      const savedPath = await saveExportedBytes(exported.file_name, exported.bytes, "application/json");
      if (savedPath) {
        setWorkflowStatus(`Preset saved: ${savedPath}`);
        toast.success(`Preset saved: ${savedPath}`);
      } else {
        setWorkflowStatus(`Preset saved to Downloads: ${exported.file_name}`);
        toast.success(`Preset saved to Downloads: ${exported.file_name}`);
      }
      return;
    }

    const fallbackPreset: PatternPresetFilePayload = {
      magic: "DYUKI-PATTERN-PRESET",
      version: 1,
      preset: {
        name: presetName,
        algorithm,
        intensity,
        palette: exportPalette,
        params: payload.params,
        tags: payload.tags,
      },
    };

    const bytes = Array.from(new TextEncoder().encode(JSON.stringify(fallbackPreset, null, 2)));
    const fileName = `${presetName.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "pattern-preset"}.dyuki`;
    const savedPath = await saveExportedBytes(fileName, bytes, "application/json");
    if (savedPath) {
      setWorkflowStatus(`Preset saved: ${savedPath}`);
      toast.success(`Preset saved: ${savedPath}`);
    } else {
      setWorkflowStatus(`Preset saved to Downloads: ${fileName}`);
      toast.success(`Preset saved to Downloads: ${fileName}`);
    }
  }, [algorithm, blur, brightness, contrast, customColors, intensity, noise, palette, pixelSize, saturation, sharpness, shareablePatternAlgorithms, workspaceMode]);

  const applyImportedPatternPreset = useCallback((preset: PatternPresetPayload) => {
    const normalizedAlgorithm = normalizeDitheringAlgorithm(preset.algorithm);
    const nextAlgorithm = DITHERING_ALGORITHMS.includes(normalizedAlgorithm as SupportedAlgorithmName)
      ? (normalizedAlgorithm as DitheringAlgorithm)
      : null;

    if (!nextAlgorithm) {
      toast.error(`Unsupported algorithm in preset: ${preset.algorithm}`);
      return;
    }

    const currentSnapshot = captureEffectParams();
    const importedSnapshot = {
      ...currentSnapshot,
      ...(typeof preset.params === "object" && preset.params !== null ? (preset.params as Partial<FrameSettings>) : {}),
      algorithm: nextAlgorithm,
      intensity: Math.max(1, Math.min(100, Number(preset.intensity) || 100)),
    } satisfies Partial<FrameSettings>;

    applyEffectParams(importedSnapshot);

    if (Array.isArray(preset.palette) && preset.palette.length > 0) {
      const importedHex = preset.palette.map(rgbToHex);
      setCustomColors(importedHex);
      setCustomPalette(importedHex);
      setPalette("Custom");
    }

    setAlgorithm(nextAlgorithm);
    setIntensity(Math.max(1, Math.min(100, Number(preset.intensity) || 100)));

    setStatus(`Preset loaded: ${preset.name}`);
    toast.success(`Imported preset: ${preset.name}`);
    setHasUnsavedChanges(true);
  }, [applyEffectParams, captureEffectParams]);

  const handleImportPatternPreset = useCallback(() => {
    presetImportInputRef.current?.click();
  }, []);

  const handleImportPatternPresetFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const fileBytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      let imported = await safeTauriInvoke<PatternPresetPayload>("import_pattern_preset", { fileBytes });

      if (!imported) {
        const fallback = JSON.parse(await file.text()) as PatternPresetPayload | PatternPresetFilePayload;
        imported = (fallback as PatternPresetFilePayload).preset ?? (fallback as PatternPresetPayload);
      }

      if (!imported || !imported.algorithm || !Array.isArray(imported.palette)) {
        toast.error("Invalid preset file format");
        return;
      }

      applyImportedPatternPreset(imported);
    } catch (error) {
      console.error("Failed to import pattern preset", error);
      toast.error("Failed to import preset file");
    }
  }, [applyImportedPatternPreset]);

  const handleSavePalette = (colors: string[]) => {
    setCustomColors(colors);
    setCustomPalette(colors);
    setPalette("Custom");
    setShowColorStudio(false);
    setHasUnsavedChanges(true);
  };

  const handlePaletteReorder = useCallback((fromIndex: number, toIndex: number) => {
    if (palette !== "Custom") {
      return;
    }

    setCustomColors((prev) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      setCustomPalette(next);
      setHasUnsavedChanges(true);
      return next;
    });
  }, [palette]);

  const handlePaletteColorEdit = useCallback((index: number, hex: string) => {
    if (palette !== "Custom") {
      return;
    }

    const normalized = hex.startsWith("#") ? hex : `#${hex}`;
    if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
      toast.error("Use HEX format like #A1B2C3");
      return;
    }

    setCustomColors((prev) => {
      if (index < 0 || index >= prev.length) {
        return prev;
      }
      const next = [...prev];
      next[index] = normalized.toUpperCase();
      setCustomPalette(next);
      setHasUnsavedChanges(true);
      return next;
    });
  }, [palette]);

  // Global keyboard shortcuts (Photoshop-like)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) return;

      // Undo / Redo
      if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleUndo();
      } else if (mod && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleRedo();
      } else if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        handleRedo();
      // Open image
      } else if (mod && !e.shiftKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        handleOpenFile();
      // Open project
      } else if (mod && e.shiftKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        void handleOpenProject();
      // Save project
      } else if (mod && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        void handleSaveProject();
      // Export image (PNG)
      } else if (mod && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        handleExportImage();
      } else if (mod && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        handleExport();
      } else if (mod && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        handleReset();
      } else if (mod && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setShowColorStudio(true);
      } else if (!mod && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setFocusMode((prev) => !prev);
      } else if (
        workspaceMode === "animation" &&
        !mod &&
        (e.key === "Delete" || e.key === "Backspace")
      ) {
        e.preventDefault();
        handleDeleteSelectedFrame();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleDeleteSelectedFrame, handleExport, handleExportImage, handleOpenFile, handleOpenProject, handleRedo, handleReset, handleSaveProject, handleUndo, workspaceMode]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      const state = useProjectStore.getState();
      if (!state.manifest || !state.isDirty()) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  useEffect(() => {
    if (!backendConnected) {
      return;
    }

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const setupMenuListener = async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const stop = await listen<string>("menu-action", ({ payload }) => {
        switch (payload) {
          case "quit":
            if (!hasUnsavedChanges) {
              void safeTauriInvoke("exit_app", {});
              break;
            }
            setShowExitWarning(true);
            break;
          case "new-project":
            handleNewProject();
            break;
          case "open-file":
            handleOpenFile();
            break;
          case "open-project":
            void handleOpenProject();
            break;
          case "save-project":
            void handleSaveProject();
            break;
          case "export-image":
            handleExportImage();
            break;
          case "export":
            handleExport();
            break;
          case "export-svg":
            void handleExportSvg();
            break;
          case "undo":
            handleUndo();
            break;
          case "redo":
            handleRedo();
            break;
          case "reset":
            handleReset();
            break;
          case "save-preset":
          case "load-preset":
          case "manage-presets":
            setShowPresetManager(true);
            break;
          case "export-preset":
            void handleExportPatternPreset();
            break;
          case "import-preset":
            handleImportPatternPreset();
            break;
          case "shortcuts":
            setShowShortcuts(true);
            break;
        }
      });

      if (cancelled) {
        await stop();
        return;
      }

      unlisten = stop;
    };

    void setupMenuListener();

    return () => {
      cancelled = true;
      void unlisten?.();
    };
  }, [
    backendConnected,
    handleExport,
    handleExportImage,
    handleExportPatternPreset,
    handleExportSvg,
    handleImportPatternPreset,
    handleNewProject,
    handleOpenFile,
    handleOpenProject,
    handleRedo,
    handleReset,
    handleSaveProject,
    handleUndo,
    hasUnsavedChanges,
  ]);

  // Frames that are keyframes — shown with a blue dot in the filmstrip.
  const keyframeIndices = useMemo(() => {
    const s = new Set<number>();
    frames.forEach((f, idx) => { if (f.isKeyframe) s.add(idx); });
    return s;
  }, [frames]);

  return (
    <div className="win98-desktop">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={handleVideoFileChange}
        className="hidden"
      />
      <input
        ref={presetImportInputRef}
        type="file"
        accept=".dyuki,application/json"
        onChange={handleImportPatternPresetFile}
        className="hidden"
      />

      <TooltipProvider delayDuration={120}>
      <div className="win98-shell">
        <div className="win98-surface">

        {!focusMode && (
          <MenuBar
            onNewProject={handleNewProject}
            onOpenFile={handleOpenFile}
            onOpenProject={handleOpenProject}
            onSaveImage={handleExportImage}
            onSaveProject={handleSaveProject}
            onExport={handleExport}
            onExportSvg={handleExportSvg}
            onReset={handleReset}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onShowAbout={() => setShowAbout(true)}
            onShowShortcuts={() => setShowShortcuts(true)}
            onSavePreset={() => setShowPresetManager(true)}
            onLoadPreset={() => setShowPresetManager(true)}
            onExportPreset={handleExportPatternPreset}
            onImportPreset={handleImportPatternPreset}
            onManagePresets={() => setShowPresetManager(true)}
            backendConnected={backendConnected}
            workspaceMode={workspaceMode}
          />
        )}

        <Toolbar
          onToggleFocusMode={() => setFocusMode((prev) => !prev)}
          onSelectWorkspaceMode={handleToolbarWorkspaceSelect}
          onOpenColorStudio={() => setShowColorStudio(true)}
          workspaceMode={workspaceMode}
          focusMode={focusMode}
          leftPanelVisible={leftPanelVisible}
        />

        <div className="flex-1 min-h-0 overflow-hidden p-2">
          <div className={`grid h-full min-h-0 gap-2 ${focusMode ? "grid-cols-1" : leftPanelVisible ? "grid-cols-[240px_minmax(0,1fr)_280px]" : "grid-cols-[minmax(0,1fr)_280px]"}`}>
            {!focusMode && leftPanelVisible && (
              <LayersWindow
                layers={layers}
                activeLayerId={activeLayerId}
                onSelectLayer={handleSelectLayer}
                onAddLayer={handleAddLayer}
                onRemoveLayer={handleRemoveLayer}
                onToggleVisibility={handleToggleLayerVisibility}
                onToggleLock={handleToggleLayerLock}
                onMoveLayer={handleMoveLayer}
              />
            )}

            <WorkspaceMain
              focusMode={focusMode}
              workspaceMode={workspaceMode}
              originalImage={originalImage}
              processedImage={processedImage}
              showOriginal={showOriginal}
              setShowOriginal={setShowOriginal}
              frames={frames}
              selectedFrameIndex={selectedFrameIndex}
              selectedFrameIds={selectedFrameIds}
              isPlaying={isPlaying}
              workflowStatus={workflowStatus}
              animationPreviewFps={animationPreviewFps}
              setAnimationPreviewFps={setAnimationPreviewFps}
              animationPreviewSpeed={animationPreviewSpeed}
              setAnimationPreviewSpeed={setAnimationPreviewSpeed}
              onFileDrop={handleFile}
              onSelectFrame={handleSelectFrame}
              onMultiSelectFrame={handleMultiSelectFrame}
              onToggleAnimationPlayback={handleToggleAnimationPlayback}
              onAddFrame={handleAddFrameClone}
              onImportFrame={handleImportAnimationFrame}
              onDeleteSelectedFrame={handleDeleteSelectedFrame}
              onApplyEffectToSelectedFrame={handleApplyEffectToSelectedFrame}
              onApplyToSelected={handleApplyToSelected}
              onInterpolateSelected={handleInterpolateSelected}
              onRenderAnimation={handleExportAnimation}
              onToggleKeyframe={handleToggleKeyframe}
              videoPreviewFrames={videoPreviewFrames}
              selectedVideoPreviewFrame={selectedVideoPreviewFrame}
              setSelectedVideoPreviewFrame={setSelectedVideoPreviewFrame}
              workflowBusy={workflowBusy}
              videoSource={videoSource}
              canRenderVideo={canRenderVideo}
              videoRenderBlockedReason={videoRenderBlockedReason}
              videoPreviewBusy={videoPreviewBusy}
              videoMetadata={videoMetadata}
              onRunVideoWorkflow={handleRunVideoWorkflow}
            />

            {!focusMode && (
              <aside className="min-h-0 overflow-hidden">
                <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
                  <InspectorWindow title="Inspector" subtitle="controls">
                    <ControlPanel
                      algorithm={algorithm}
                      algorithmOptions={algorithmOptions}
                      setAlgorithm={(v: string) => {
                        setAlgorithm(v as DitheringAlgorithm);
                        markProjectDirty();
                      }}
                      palette={palette}
                      paletteOptions={paletteOptions}
                      setPalette={(v: string) => {
                        setPalette(v as ColorPalette);
                        markProjectDirty();
                      }}
                      intensity={intensity}
                      setIntensity={(value) => {
                        setIntensity(value);
                        markProjectDirty();
                      }}
                      contrast={contrast}
                      setContrast={(value) => {
                        setContrast(value);
                        markProjectDirty();
                      }}
                      brightness={brightness}
                      setBrightness={(value) => {
                        setBrightness(value);
                        markProjectDirty();
                      }}
                      saturation={saturation}
                      setSaturation={(value) => {
                        setSaturation(value);
                        markProjectDirty();
                      }}
                      pixelSize={pixelSize}
                      setPixelSize={(value) => {
                        setPixelSize(value);
                        markProjectDirty();
                      }}
                      blur={blur}
                      setBlur={(value) => {
                        setBlur(value);
                        markProjectDirty();
                      }}
                      sharpness={sharpness}
                      setSharpness={(value) => {
                        setSharpness(value);
                        markProjectDirty();
                      }}
                      noise={noise}
                      setNoise={(value) => {
                        setNoise(value);
                        markProjectDirty();
                      }}
                      blendMode={blendMode}
                      setBlendMode={(value) => {
                        setBlendMode(value);
                        markProjectDirty();
                      }}
                      layerOpacity={layerOpacity}
                      setLayerOpacity={(value) => {
                        setLayerOpacity(value);
                        markProjectDirty();
                      }}
                      paletteSwatches={paletteSwatches}
                      onPaletteReorder={handlePaletteReorder}
                      onPaletteColorEdit={handlePaletteColorEdit}
                      snapGlitchToPalette={snapGlitchToPalette}
                      setSnapGlitchToPalette={(value) => {
                        setSnapGlitchToPalette(value);
                        markProjectDirty();
                      }}
                      paletteMix={paletteMix}
                      setPaletteMix={(value) => {
                        setPaletteMix(value);
                        markProjectDirty();
                      }}
                      globalSeed={globalSeed}
                      setGlobalSeed={(value) => {
                        setGlobalSeed(value);
                        markProjectDirty();
                      }}
                      glitchType={glitchType}
                      setGlitchType={(value) => {
                        setGlitchType(value);
                        markProjectDirty();
                      }}
                      pixelSortMetric={pixelSortMetric}
                      setPixelSortMetric={(value) => {
                        setPixelSortMetric(value);
                        markProjectDirty();
                      }}
                      pixelSortMask={pixelSortMask}
                      setPixelSortMask={(value) => {
                        setPixelSortMask(value);
                        markProjectDirty();
                      }}
                      thresholdMin={thresholdMin}
                      setThresholdMin={(value) => {
                        setThresholdMin(value);
                        markProjectDirty();
                      }}
                      thresholdMax={thresholdMax}
                      setThresholdMax={(value) => {
                        setThresholdMax(value);
                        markProjectDirty();
                      }}
                      angle={angle}
                      setAngle={(value) => {
                        setAngle(value);
                        markProjectDirty();
                      }}
                      sortLength={sortLength}
                      setSortLength={(value) => {
                        setSortLength(value);
                        markProjectDirty();
                      }}
                      blockSize={blockSize}
                      setBlockSize={(value) => {
                        setBlockSize(value);
                        markProjectDirty();
                      }}
                      chaos={chaos}
                      setChaos={(value) => {
                        setChaos(value);
                        markProjectDirty();
                      }}
                      quantization={quantization}
                      setQuantization={(value) => {
                        setQuantization(value);
                        markProjectDirty();
                      }}
                      redShiftX={redShiftX}
                      setRedShiftX={(value) => {
                        setRedShiftX(value);
                        markProjectDirty();
                      }}
                      redShiftY={redShiftY}
                      setRedShiftY={(value) => {
                        setRedShiftY(value);
                        markProjectDirty();
                      }}
                      greenShiftX={greenShiftX}
                      setGreenShiftX={(value) => {
                        setGreenShiftX(value);
                        markProjectDirty();
                      }}
                      greenShiftY={greenShiftY}
                      setGreenShiftY={(value) => {
                        setGreenShiftY(value);
                        markProjectDirty();
                      }}
                      blueShiftX={blueShiftX}
                      setBlueShiftX={(value) => {
                        setBlueShiftX(value);
                        markProjectDirty();
                      }}
                      blueShiftY={blueShiftY}
                      setBlueShiftY={(value) => {
                        setBlueShiftY(value);
                        markProjectDirty();
                      }}
                      globalRgbShiftIntensity={globalRgbShiftIntensity}
                      setGlobalRgbShiftIntensity={(value) => {
                        setGlobalRgbShiftIntensity(value);
                        markProjectDirty();
                      }}
                      sliceCount={sliceCount}
                      setSliceCount={(value) => {
                        setSliceCount(value);
                        markProjectDirty();
                      }}
                      maxOffset={maxOffset}
                      setMaxOffset={(value) => {
                        setMaxOffset(value);
                        markProjectDirty();
                      }}
                      randomness={randomness}
                      setRandomness={(value) => {
                        setRandomness(value);
                        markProjectDirty();
                      }}
                      scanlineThickness={scanlineThickness}
                      setScanlineThickness={(value) => {
                        setScanlineThickness(value);
                        markProjectDirty();
                      }}
                      scanlineGap={scanlineGap}
                      setScanlineGap={(value) => {
                        setScanlineGap(value);
                        markProjectDirty();
                      }}
                      flicker={flicker}
                      setFlicker={(value) => {
                        setFlicker(value);
                        markProjectDirty();
                      }}
                      curvature={curvature}
                      setCurvature={(value) => {
                        setCurvature(value);
                        markProjectDirty();
                      }}
                      maskTarget={maskTarget}
                      setMaskTarget={(value) => {
                        setMaskTarget(value);
                        markProjectDirty();
                      }}
                      maskFeather={maskFeather}
                      setMaskFeather={(value) => {
                        setMaskFeather(value);
                        markProjectDirty();
                      }}
                    />
                  </InspectorWindow>
                </div>
              </aside>
            )}
          </div>
        </div>

        {!focusMode && (
          <AppFooterBars
            focusMode={focusMode}
            workspaceMode={workspaceMode}
            originalImagePresent={Boolean(originalImage)}
            videoSourcePresent={Boolean(videoSource)}
            backendConnected={backendConnected}
            imageSize={imageSize}
            currentSourceLabel={currentSourceLabel}
            videoMetadata={videoMetadata}
            activeAdjustments={activeAdjustments}
            algorithm={algorithm}
            palette={palette}
            workflowBusy={workflowBusy}
            workflowStatus={workflowStatus}
            jobProgressText={jobProgressText}
            jobOutputPath={jobOutputPath}
            canRenderVideo={canRenderVideo}
            videoRenderBlockedReason={videoRenderBlockedReason}
            status={status}
            onRunVideoWorkflow={handleRunVideoWorkflow}
            onExportSvg={handleExportSvg}
            onCancelActiveJob={handleCancelActiveJob}
          />
        )}
      </div>
      </div>
      </TooltipProvider>
      
      <AppOverlays
        showColorStudio={showColorStudio}
        onCloseColorStudio={() => setShowColorStudio(false)}
        customColors={customColors}
        quantizationMethod={quantizationMethod}
        setQuantizationMethod={setQuantizationMethod}
        quantizationColorCount={quantizationColorCount}
        setQuantizationColorCount={setQuantizationColorCount}
        canAutoQuantize={Boolean(originalImage || processedImage)}
        quantizingPalette={quantizingPalette}
        onExtractFromImage={handleExtractPaletteFromCurrentImage}
        onSavePalette={handleSavePalette}
        showAbout={showAbout}
        onCloseAbout={() => setShowAbout(false)}
        showShortcuts={showShortcuts}
        onCloseShortcuts={() => setShowShortcuts(false)}
        showPresetManager={showPresetManager}
        onClosePresetManager={() => setShowPresetManager(false)}
        presetSettings={{
          algorithm,
          palette,
          intensity,
          contrast,
          brightness,
          saturation,
          pixelSize,
          blur,
          sharpness,
          noise,
        }}
        onLoadPreset={handleLoadPreset}
        showExitWarning={showExitWarning}
        isSavingExitWarning={isSavingExitWarning}
        onSaveAndExit={handleSaveAndExit}
        onDiscardAndExit={handleDiscardAndExit}
        onCancelExitWarning={handleCancelExitWarning}
        workflowBusy={workflowBusy}
        jobId={jobId}
        jobKind={jobKind}
        workflowStatus={workflowStatus}
        jobProgressPercent={jobProgressPercent}
        jobProgress={jobProgress}
        onCancelActiveJob={handleCancelActiveJob}
      />
    </div>
  );
};

export default Index;
