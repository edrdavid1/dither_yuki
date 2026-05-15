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
import { useFrameLayerSync } from "@/hooks/useFrameLayerSync";
import { useLayerSession } from "@/hooks/useLayerSession";
import { useFilmstripSession } from "@/hooks/useFilmstripSession";
import { useVideoMediaSession } from "@/hooks/useVideoMediaSession";
import { useVideoPlaybackOrchestration } from "@/hooks/useVideoPlaybackOrchestration";
import { useMasterClock } from "@/hooks/useMasterClock";
import { usePreviewOrchestration } from "@/hooks/usePreviewOrchestration";
import { useProjectHydrator } from "@/hooks/useProjectHydrator";
import { useVideoJobLifecycle, type VideoJobProgressResponse } from "@/hooks/useVideoJobLifecycle";
import { useVideoRenderQueue } from "@/hooks/useVideoRenderQueue";
import { useLayerReadOnlyGuards } from "@/hooks/useLayerReadOnlyGuards";
import { usePaletteWorkflow } from "@/hooks/usePaletteWorkflow";
import { usePerformanceBudget } from "@/hooks/usePerformanceBudget";
import { useVideoPreviewRuntime } from "@/hooks/useVideoPreviewRuntime";
import { useVideoRenderRuntime } from "@/hooks/useVideoRenderRuntime";
import {
  exportSvgFrame,
  importGif,
  readBytesFromPath,
  saveSvgWithDialog,
  safeTauriInvoke,
} from "@/lib/tauriBridge";
import { useProjectStore } from "@/store/projectStore";
import { useVideoPlaybackStore } from "@/store/videoPlaybackStore";
import { useShallow } from "zustand/react/shallow";
import { type FrameSettings } from "@/types/frameSettings";
import { validateBackendPayload } from "@/lib/layerMapping";
import {
  buildSiblingOutputPath,
  downloadBytes,
  extractSingleVideoFrame,
  getNativeFilePath,
  imageToRgbaFrame,
  rgbaToImage,
} from "@/lib/mediaWorkflow";
import {
  buildBackendLayersPayload,
  cloneLayer,
  cloneLayers,
  createNeutralLayer,
  type Layer,
} from "@/types/layers";
import { toast } from "sonner";
import { isVideoGpuPreviewEnabled, isVideoGpuRenderEnabled } from "@/lib/videoRuntime/featureFlags";
import { cloneLayerTracks, type LayerTrack } from "@/lib/videoRuntime/layerTracks";

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

interface DependencyStatusResponse {
  ffmpeg_available: boolean;
  ffmpeg_version?: string | null;
  ffmpeg_source?: string | null;
  ffprobe_available: boolean;
  ffprobe_version?: string | null;
  ffprobe_source?: string | null;
}

interface ColorPipelineSnapshot {
  capturedAt: number;
  layersPayload: ReturnType<typeof buildBackendLayersPayload>;
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

const loadImageFromBytes = async (bytes: Uint8Array) => {
  const dataUrl = await blobToDataUrl(new Blob([bytes as unknown as BlobPart]));
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image frame"));
    image.src = dataUrl;
  });
};

const loadImageFromPath = async (filePath: string) => {
  const bytes = await readBytesFromPath(filePath);
  if (!bytes?.length) {
    throw new Error(`Failed to read image bytes from ${filePath}`);
  }
  return loadImageFromBytes(bytes);
};

const loadImageFromSrc = async (src: string): Promise<HTMLImageElement> => {
  const image = new Image();
  const resolvedSrc = await sourceToDataUrl(src).catch((error) => {
    // Fallback to the original source path if fetch is unavailable in this runtime.
    console.warn("[image-load] source conversion failed, using direct src", error);
    return src;
  });

  return new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image frame"));
    image.src = resolvedSrc;
  });
};

const applyCmykSoftProof = (rgba: Uint8ClampedArray): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(rgba);
  const dotGain = 0.12;
  const totalInkLimit = 2.9; // slightly below 300%

  for (let i = 0; i < out.length; i += 4) {
    const r = (out[i] ?? 0) / 255;
    const g = (out[i + 1] ?? 0) / 255;
    const b = (out[i + 2] ?? 0) / 255;

    const k = 1 - Math.max(r, g, b);
    const denom = Math.max(1e-6, 1 - k);
    let c = (1 - r - k) / denom;
    let m = (1 - g - k) / denom;
    let y = (1 - b - k) / denom;

    c = Math.max(0, Math.min(1, Math.pow(c, 1 - dotGain)));
    m = Math.max(0, Math.min(1, Math.pow(m, 1 - dotGain)));
    y = Math.max(0, Math.min(1, Math.pow(y, 1 - dotGain)));
    const kk = Math.max(0, Math.min(1, Math.pow(k, 1 - dotGain)));

    const totalInk = c + m + y + kk;
    if (totalInk > totalInkLimit) {
      const scale = totalInkLimit / totalInk;
      c *= scale;
      m *= scale;
      y *= scale;
    }

    out[i] = Math.round(255 * (1 - c) * (1 - kk));
    out[i + 1] = Math.round(255 * (1 - m) * (1 - kk));
    out[i + 2] = Math.round(255 * (1 - y) * (1 - kk));
  }

  return out;
};

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
  const [imageProcessedRgba, setImageProcessedRgba] = useState<{ width: number; height: number; rgba: Uint8ClampedArray } | null>(null);
  const [showOriginal, setShowOriginal] = useState(true);
  const [showColorStudio, setShowColorStudio] = useState(false);
  const [customColors, setCustomColors] = useState<string[]>(["#000000", "#FFFFFF"]);
  const [maskR, setMaskR] = useState(true);
  const [maskG, setMaskG] = useState(true);
  const [maskB, setMaskB] = useState(true);
  const [maskA, setMaskA] = useState(true);
  const [snapGlitchToPalette, setSnapGlitchToPalette] = useState(false);
  const [paletteMix, setPaletteMix] = useState(100);
  const [cmykSoftProof, setCmykSoftProof] = useState(false);
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
  const {
    videoPlayheadFrameIndex,
    setVideoPlayheadFrameIndex,
    videoPlaying,
    setVideoPlaying,
    videoLoopEnabled,
    setVideoLoopEnabled,
    videoInFrame,
    setVideoInFrame,
    videoOutFrame,
    setVideoOutFrame,
    videoLayerTracks,
    setVideoLayerTracks,
  } = useVideoPlaybackStore(
    useShallow((state) => ({
      videoPlayheadFrameIndex: state.playheadFrameIndex,
      setVideoPlayheadFrameIndex: state.setPlayheadFrameIndex,
      videoPlaying: state.playing,
      setVideoPlaying: state.setPlaying,
      videoLoopEnabled: state.loopEnabled,
      setVideoLoopEnabled: state.setLoopEnabled,
      videoInFrame: state.inFrame,
      setVideoInFrame: state.setInFrame,
      videoOutFrame: state.outFrame,
      setVideoOutFrame: state.setOutFrame,
      videoLayerTracks: state.layerTracks,
      setVideoLayerTracks: state.setLayerTracks,
    })),
  );
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
  const [layers, setLayers] = useState<Layer[]>(() => [createNeutralLayer("1")]);
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
  const [previewQuality, setPreviewQuality] = useState<"fast" | "accurate">("fast");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [isSavingExitWarning, setIsSavingExitWarning] = useState(false);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  hasUnsavedChangesRef.current = hasUnsavedChanges;
  const lastSyncedDirtyRef = useRef<boolean | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const presetImportInputRef = useRef<HTMLInputElement>(null);
  const previewRequestIdRef = useRef(0);
  const previewRgbaCacheRef = useRef<Map<string, { width: number; height: number; rgba: Uint8ClampedArray }>>(new Map());
  const framesRef = useRef<AnimationFrame[]>(frames);
  framesRef.current = frames;
  const layersRef = useRef<Layer[]>(layers);
  layersRef.current = layers;
  const activeLayerIdRef = useRef(activeLayerId);
  activeLayerIdRef.current = activeLayerId;
  const { processImage } = useImageWorker();
  const markProjectDirty = useCallback(() => {
    setHasUnsavedChanges((prev) => (prev ? prev : true));
  }, []);
  const clearProjectDirty = useCallback(() => {
    setHasUnsavedChanges((prev) => (prev ? false : prev));
  }, []);

  const commitVideoLayerTracks = useCallback((nextTracks: LayerTrack[]) => {
    const cloned = cloneLayerTracks(nextTracks);
    setVideoLayerTracks(cloned);

    const state = useProjectStore.getState();
    if (state.manifest) {
      state.updateManifest((manifest) => ({
        ...manifest,
        videoLayerTracks: cloneLayerTracks(cloned),
      }));
    }

    markProjectDirty();
  }, [markProjectDirty, setVideoLayerTracks]);

  const {
    videoSource,
    setVideoSource,
    videoMetadata,
    setVideoMetadata,
    videoPreviewFrames,
    setVideoPreviewFrames,
    selectedVideoPreviewFrame,
    setSelectedVideoPreviewFrame,
    videoPreviewBusy,
    videoOriginalRgba,
    videoProcessedRgba,
    setVideoOriginalRgba,
    setVideoProcessedRgba,
    videoProcessingMs,
    setVideoProcessingMs,
    loadVideoFile,
    clearVideoMediaState,
  } = useVideoMediaSession({
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
  });

  // Maximum dimension (px) used for live preview. High-res images are downscaled
  // to this limit before being sent to the backend, reducing IPC payload by up to
  // 10-20× for large photos while keeping the preview visually accurate.
  const MAX_PREVIEW_PX = 1200;
  const MAX_PREVIEW_RGBA_CACHE_ENTRIES = 24;

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

  const customPaletteRgb = useMemo(
    () => customColors
      .map(hexToRgb)
      .filter((color): color is [number, number, number] => color !== null),
    [customColors],
  );

  const editorControlValues = useMemo(() => ({
    algorithm,
    palette,
    customPalette: customPaletteRgb,
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
    maskR,
    maskG,
    maskB,
    maskA,
  }), [
    algorithm,
    palette,
    customPaletteRgb,
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
    maskR,
    maskG,
    maskB,
    maskA,
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

  const { isActiveLayerLocked, updateActiveLayerControl } = useLayerReadOnlyGuards({
    activeLayerIdRef,
    layersRef,
    markProjectDirty,
  });

  const { measureBudget } = usePerformanceBudget({
    setStatus,
  });
  const videoGpuPreviewEnabled = isVideoGpuPreviewEnabled();
  const videoGpuRenderEnabled = isVideoGpuRenderEnabled();
  useVideoPreviewRuntime({
    enabled: workspaceMode === "video" && Boolean(videoSource),
  });
  const videoRenderRuntime = useVideoRenderRuntime({
    enabled: videoGpuRenderEnabled,
  });
  const videoRenderQueue = useVideoRenderQueue({
    enabled: videoGpuRenderEnabled,
    pollIntervalMs: 2000,
  });

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

  const domainState = useMemo(() => ({
    layers,
    frames,
    activeLayerId,
    paletteSwatches,
    customColors,
  }), [activeLayerId, customColors, frames, layers, paletteSwatches]);

  const viewState = useMemo(() => ({
    workspaceMode,
    focusMode,
    leftPanelVisible,
    showColorStudio,
  }), [focusMode, leftPanelVisible, showColorStudio, workspaceMode]);

  const transientState = useMemo(() => ({
    previewProcessing,
    previewQuality,
    workflowBusy,
    videoPreviewBusy,
  }), [previewProcessing, previewQuality, videoPreviewBusy, workflowBusy]);

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

  const handleGifFile = useCallback(async (file: File) => {
    setStatus("GIF loading...");
    try {
      const gifBytes = new Uint8Array(await file.arrayBuffer());
      const decoded = await importGif(gifBytes);
      if (!decoded || !decoded.frames.length) {
        toast.error("Failed to decode GIF frames");
        setStatus("GIF import failed");
        return;
      }

      const baseLayers = cloneLayers(layersRef.current);
      const activeLayer = activeLayerIdRef.current || baseLayers[0]?.id || "";
      const importedFrames = decoded.frames.map((frame, index) => makeAnimationFrame({
        id: `gif-${Date.now()}-${index}`,
        src: frame.data_url,
        width: frame.width,
        height: frame.height,
        layers: cloneLayers(baseLayers),
        activeLayerId: activeLayer,
        isKeyframe: true,
      }));

      await clearVideoMediaState();
      setWorkspaceMode("animation");
      setFrames(importedFrames);
      setSelectedFrameIndex(0);
      setSelectedFrameIds(new Set(importedFrames[0] ? [importedFrames[0].id] : []));
      setIsPlaying(false);

      const firstFrame = importedFrames[0];
      if (firstFrame) {
        const firstImage = await loadImageFromSrc(firstFrame.src);
        setOriginalImage(firstImage);
        setProcessedImage(null);
        setImageProcessedRgba(null);
        setShowOriginal(true);
        setImageSize(`${firstImage.width}×${firstImage.height}`);
      }

      setStatus(`GIF imported — ${importedFrames.length} frames`);
      toast.success(`GIF imported: ${importedFrames.length} frames`);
      markProjectDirty();
    } catch (error) {
      console.error("Failed to import GIF", error);
      toast.error("Failed to import GIF");
      setStatus("GIF import failed");
    }
  }, [clearVideoMediaState, markProjectDirty, setFrames, setSelectedFrameIds, setWorkspaceMode]);

  const handleFile = useCallback((file: File) => {
    if (file.type.startsWith("video/")) {
      void loadVideoFile(file);
      return;
    }
    if (file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif")) {
      void handleGifFile(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Neutral import: do not auto-apply palette/effect.
        setAlgorithm("None");
        setPalette("Grayscale");
        setSourceImageFile(file);
        setOriginalImage(img);
        setProcessedImage(null);
        setImageProcessedRgba(null);
        // Clear frames so the animation auto-populate effect creates a fresh
        // first frame with the CURRENT settings (not DEFAULT_FRAME_SETTINGS).
        setFrames([]);
        setSelectedFrameIndex(0);
        setIsPlaying(false);
        setImageSize(`${img.width}\u00d7${img.height}`);
        setStatus("Image loaded");
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [handleGifFile]);

  useEffect(() => {
    const handleWindowDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
    };

    const handleWindowDrop = (event: DragEvent) => {
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      event.preventDefault();
      // If it's a video without a native path, Tauri's drag-drop listener below
      // will handle it with the correct native path. Skip here to avoid a
      // double-call with an incomplete File (no .path).
      const isVideo = file.type.startsWith("video/");
      const hasNativePath = typeof (file as File & { path?: string }).path === "string" &&
        (file as File & { path?: string }).path!.length > 0;
      if (isVideo && !hasNativePath) return;
      handleFile(file);
    };

    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("drop", handleWindowDrop);

    return () => {
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, [handleFile]);

  // Listen to Tauri's native drag-drop event which provides full native paths.
  // This handles video files dragged from Finder (browser DnD does not expose .path).
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const VIDEO_EXTS = new Set(["mp4", "mov", "avi", "mkv", "webm", "m4v", "flv", "wmv", "ts", "mts"]);

    const setup = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
          const filePath = event.payload.paths?.[0];
          if (!filePath) return;
          const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
          const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
          if (!VIDEO_EXTS.has(ext)) return; // non-video drops handled by browser handler
          // Create a File with the native path attached so loadVideoFile can open the Rust stream.
          const fileWithPath = Object.assign(new File([], fileName), { path: filePath });
          handleFile(fileWithPath);
        });
      } catch {
        // Not running inside Tauri — browser DnD fallback is sufficient.
      }
    };
    void setup();
    return () => {
      if (!unlisten) return;
      try {
        unlisten();
      } catch (err) {
        console.warn("[Index] drag-drop unlisten failed", err);
      }
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
    void loadVideoFile(file);
  };

  // Control sync hook - handles editor parameter state and undo/redo
  const {
    captureEffectParams,
    applyEffectParams,
    handleUndo,
    handleRedo,
  } = useEditorControlSync({
    values: editorControlValues,
    setters: {
      setCustomColors,
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
      setMaskR,
      setMaskG,
      setMaskB,
      setMaskA,
    },
  });

  const activeLayersPayload = useMemo(() => {
    const mergedLayers = layers.map((layer) => (
      layer.id === activeLayerId && !layer.locked
        ? {
            ...layer,
            settings: {
              ...layer.settings,
              ...editorControlValues,
            },
          }
        : layer
    ));

    const payload = buildBackendLayersPayload(mergedLayers, customPaletteRgb);

    // Guardrail: validate payload before it reaches backend
    if (import.meta.env.DEV) {
      const invalidItems = payload
        .map((item, idx) => ({ valid: validateBackendPayload(item), idx, item }))
        .filter((r) => r.valid === null);
      if (invalidItems.length > 0) {
        console.error("[layer-validation] Invalid backend payload detected:", invalidItems);
      }
    }

    return payload;
  }, [activeLayerId, customPaletteRgb, editorControlValues, layers]);

  const captureColorPipelineSnapshot = useCallback((): ColorPipelineSnapshot => {
    const mergedLayers = layersRef.current.map((layer) => (
      layer.id === activeLayerIdRef.current && !layer.locked
        ? {
            ...layer,
            settings: {
              ...layer.settings,
              ...editorControlValues,
            },
          }
        : layer
    ));
    const paletteSnapshot = customPaletteRgb.map((rgb) => [rgb[0], rgb[1], rgb[2]] as [number, number, number]);
    const layersPayload = buildBackendLayersPayload(mergedLayers, paletteSnapshot);

    if (import.meta.env.DEV) {
      const invalidItems = layersPayload
        .map((item, idx) => ({ valid: validateBackendPayload(item), idx, item }))
        .filter((r) => r.valid === null);
      if (invalidItems.length > 0) {
        console.error("[layer-validation] Invalid backend payload detected:", invalidItems);
      }
    }

    return {
      capturedAt: Date.now(),
      layersPayload,
    };
  }, [customPaletteRgb, editorControlValues]);

  const getOrCreatePreviewRgbaFrame = useCallback(async (
    cacheKey: string,
    image: HTMLImageElement,
    maxDimension: number | undefined,
  ) => {
    const cached = previewRgbaCacheRef.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    const frame = await imageToRgbaFrame(image, maxDimension);
    const snapshot = {
      width: frame.width,
      height: frame.height,
      rgba: frame.rgba,
    };
    previewRgbaCacheRef.current.set(cacheKey, snapshot);

    // Keep cache bounded to avoid unbounded memory growth while navigating frames.
    if (previewRgbaCacheRef.current.size > MAX_PREVIEW_RGBA_CACHE_ENTRIES) {
      const oldestKey = previewRgbaCacheRef.current.keys().next().value;
      if (oldestKey) {
        previewRgbaCacheRef.current.delete(oldestKey);
      }
    }

    return snapshot;
  }, []);

  // Frame preview renderer - defined early for useFrameLayerSync
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
      const sourceKey = imageToFrameSrc(image) || frame.src || frame.id;
      const rgbaFrame = await getOrCreatePreviewRgbaFrame(
        `frame:${frame.id}:${sourceKey}:fast`,
        image,
        MAX_PREVIEW_PX,
      );
      const paletteSnapshot = customPaletteRgb.map((rgb) => [rgb[0], rgb[1], rgb[2]] as [number, number, number]);
      const payload = buildBackendLayersPayload(snapshotLayers ?? frame.layers, paletteSnapshot);

      const imageData = new ImageData(
        new Uint8ClampedArray(rgbaFrame.rgba),
        rgbaFrame.width,
        rgbaFrame.height,
      );

      const { buffer, width, height } = await processImage(imageData, payload);
      const rendered = new Uint8ClampedArray(buffer);
      const previewBytes = cmykSoftProof ? applyCmykSoftProof(rendered) : rendered;
      const previewImage = await rgbaToImage(previewBytes, width, height);
      const previewDataUrl = previewImage.src;

      setFrames((prev) => {
        const index = prev.findIndex((item) => item.id === frameId);
        if (index < 0) return prev;
        const existing = prev[index];
        if (!existing || existing.previewDataUrl === previewDataUrl) {
          return prev;
        }
        const next = [...prev];
        next[index] = { ...existing, previewDataUrl };
        return next;
      });

      if (forceProcessedImage || framesRef.current[selectedFrameIndex]?.id === frameId) {
        setProcessedImage(previewImage);
        setShowOriginal(false);
      }

      return previewDataUrl;
    } catch (error) {
      console.error("Failed to render frame preview", error);
      return null;
    }
  }, [cmykSoftProof, customPaletteRgb, getOrCreatePreviewRgbaFrame, processImage, selectedFrameIndex, setProcessedImage, setShowOriginal]);

  // Frame-layer synchronization - canonical source for layer persistence
  const { persistCurrentLayersToFrame, syncLayersFromFrame } = useFrameLayerSync({
    framesRef,
    layersRef,
    activeLayerIdRef,
    selectedFrameIndex,
    setFrames,
    renderFramePreview,
    markProjectDirty,
  });

  const applyLayerSnapshotToControls = useCallback((layerSnapshot: Layer | null) => {
    if (!layerSnapshot) return;
    setActiveLayerId(layerSnapshot.id);
    applyEffectParams(layerSnapshot.settings ?? DEFAULT_FRAME_SETTINGS);
  }, [applyEffectParams]);

  const commitControlsToActiveEffect = useCallback((): Layer[] | null => {
    const settings = captureEffectParams();
    const currentLayerId = activeLayerIdRef.current;
    let didUpdate = false;

    const next = layersRef.current.map((layer) => {
      if (layer.id !== currentLayerId) return cloneLayer(layer);
      if (layer.locked) return cloneLayer(layer);
      didUpdate = true;
      return {
        ...cloneLayer(layer),
        settings: { ...settings },
      };
    });

    if (!didUpdate) {
      return null;
    }

    setLayers(next);
    persistCurrentLayersToFrame(next, currentLayerId);
    markProjectDirty();
    return next;
  }, [captureEffectParams, persistCurrentLayersToFrame]);

  // Layer session - command-based layer operations
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
    quality: "fast" | "accurate" = "fast",
  ) => {
    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    setPreviewProcessing(true);
    const colorSnapshot = captureColorPipelineSnapshot();

    try {
      let previewImage: HTMLImageElement | null = null;
      const sourceKey = imageToFrameSrc(sourceImage) || "inspector";
      const previewMaxDimension = quality === "fast" ? MAX_PREVIEW_PX : undefined;
      const frame = await getOrCreatePreviewRgbaFrame(
        `inspector:${sourceKey}:${quality}`,
        sourceImage,
        previewMaxDimension,
      );
      const frameSize = frame.width * frame.height * 4;
      const packedResult = colorSnapshot.layersPayload.length > 0
        ? await safeTauriInvoke<ProcessVideoFramesPackedResponse>(
            "process_video_frames_packed",
            {
              request: {
                width: frame.width,
                height: frame.height,
                frame_count: 1,
                frame_size: frameSize,
                frames_blob: new Uint8Array(frame.rgba),
                layers: colorSnapshot.layersPayload,
                temporal: { enabled: false, mode: "sine", amount: 0, speed: 1, phase: 0 },
              },
            },
          )
        : null;

      if (packedResult?.frame_count) {
        const processedFrame = new Uint8ClampedArray(
          packedResult.processed_frames_blob.slice(0, packedResult.frame_size),
        );
        const previewBytes = cmykSoftProof ? applyCmykSoftProof(processedFrame) : processedFrame;
        previewImage = await rgbaToImage(previewBytes, packedResult.width, packedResult.height);
      }

      if (!previewImage) {
        // Fallback must use the same downscaled frame as packed path; full-size
        // canvas processing here can freeze UI on large sources.
        const imageData = new ImageData(
          new Uint8ClampedArray(frame.rgba),
          frame.width,
          frame.height,
        );
        const { buffer, width, height } = await processImage(imageData, colorSnapshot.layersPayload);
        const rendered = new Uint8ClampedArray(buffer);
        const previewBytes = cmykSoftProof ? applyCmykSoftProof(rendered) : rendered;
        previewImage = await rgbaToImage(previewBytes, width, height);
      }

      if (requestId !== previewRequestIdRef.current) return;
      setProcessedImage(previewImage);
      setShowOriginal(false);
      setPreviewQuality(quality);
      setStatus("Ready");
    } catch (error) {
      if (requestId !== previewRequestIdRef.current) return;
      console.error("Failed to render inspector preview", error);
      setStatus("Preview error");
    } finally {
      setPreviewProcessing(false);
    }
  }, [captureColorPipelineSnapshot, cmykSoftProof, getOrCreatePreviewRgbaFrame, processImage, setProcessedImage, setPreviewQuality, setShowOriginal, setStatus]);

  const masterClock = useMasterClock();

  const {
    estimatedVideoFps,
    estimatedVideoTotalFrames,
    effectiveVideoInFrame,
    effectiveVideoOutFrame,
  } = useVideoPlaybackOrchestration({
    enabled: workspaceMode === "video",
    workspaceMode,
    videoSource,
    videoMetadata,
    videoPreviewFrameCount: videoPreviewFrames.length,
    videoPreviewBusy,
    videoPlaying,
    setVideoPlaying,
    videoLoopEnabled,
    videoInFrame,
    videoOutFrame,
    videoPlayheadFrameIndex,
    setVideoPlayheadFrameIndex,
    videoLayerTracks,
    captureColorPipelineSnapshot,
    setVideoProcessedRgba,
    setVideoProcessingMs,
    setPreviewQuality,
    setShowOriginal,
    // Use the Rust MasterClockService only when Tauri events are confirmed
    // available.  When unavailable (browser / cold start) the JS setInterval
    // in useVideoPlaybackOrchestration acts as the fallback timing source.
    masterClockEnabled: masterClock.tauriAvailable,
    masterClockAwaitingFirstTick: masterClock.awaitingFirstTick,
  });

  // Master-clock-aware play/pause toggle for the video transport.
  // When playing, the Rust MasterClockService drives the playhead via
  // `clock_tick` events; when pausing, the JS interval in
  // useVideoPlaybackOrchestration is the fallback timing source.
  const handleToggleVideoPlayback = useCallback(() => {
    if (videoPlaying) {
      masterClock.pause();
    } else {
      setShowOriginal(false);
      masterClock.play(
        Math.max(1, estimatedVideoFps),
        effectiveVideoInFrame,
        effectiveVideoOutFrame,
        estimatedVideoTotalFrames,
      );
    }
  }, [
    effectiveVideoInFrame,
    effectiveVideoOutFrame,
    estimatedVideoFps,
    estimatedVideoTotalFrames,
    masterClock,
    setShowOriginal,
    videoPlaying,
  ]);

  usePreviewOrchestration({
    originalImage,
    workspaceMode,
    isPlaying,
    videoPreviewBusy,
    activeLayersPayload,
    processImage,
    setProcessedRgba: setImageProcessedRgba,
    renderInspectorPreview,
    setProcessedImage,
    setShowOriginal,
    setStatus,
    setPreviewProcessing,
    maxPreviewPx: MAX_PREVIEW_PX,
    accuratePreviewMaxPixels: 3_000_000,
    onPreviewQualityChange: setPreviewQuality,
    onPreviewLatencyMeasured: (latencyMs, quality) => {
      if (latencyMs > 120) {
        setStatus(`Preview (${quality}) ${latencyMs}ms`);
      }
    },
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
    const colorSnapshot = captureColorPipelineSnapshot();
    const nativePath = getNativeFilePath(videoSource);
    const sourceExtension = videoSource.name.split(".").pop() || "mp4";
    const defaultOutputPath = await safeTauriInvoke<string>("get_default_output_path", {
      fileName: `dither-yuki-video-v2-${Date.now()}.mp4`, // V2 currently targets mp4 mostly
    });

    if (videoRenderRuntime.enabled && nativePath && defaultOutputPath) {
      const v2Job = await videoRenderRuntime.startRenderJob({
        videoId: videoSource.name,
        startFrame: videoInFrame ?? 0,
        endFrame: videoOutFrame ?? Math.max(0, estimatedVideoTotalFrames - 1),
        fps: estimatedVideoFps,
        outputFormat: "mp4",
        inputPath: nativePath,
        outputPath: defaultOutputPath,
        layers: colorSnapshot.layersPayload,
        tracks: videoLayerTracks,
        keepAudio: true,
      });
      if (v2Job?.job_id) {
        setWorkflowStatus(`Video v2 pipeline queued (${v2Job.job_id.slice(0, 8)})`);
        setWorkflowBusy(false);
        return;
      }
    }

    try {
      const nativePath = getNativeFilePath(videoSource);
      const sourceExtension = videoSource.name.split(".").pop() || "mp4";
      const outputPath = await safeTauriInvoke<string>("get_default_output_path", {
        fileName: `dither-yuki-video-${Date.now()}.${sourceExtension}`,
      });

      const requestBase = {
        layers: colorSnapshot.layersPayload,
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
  }, [animationPreviewFps, captureColorPipelineSnapshot, videoPreviewFrames.length, videoRenderRuntime, videoSource, workspaceMode]);

  const { handleCancelActiveJob } = useVideoJobLifecycle({
    jobId,
    jobKind,
    setJobId,
    setJobProgress,
    setJobOutputPath,
    setWorkflowBusy,
    setWorkflowStatus,
    setStatus,
  });

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

    // Clicking a sample should move the playhead near that timestamp.
    if (videoMetadata?.duration_seconds && videoMetadata.duration_seconds > 0) {
      const secondsLabel = frame.label.endsWith("s") ? frame.label.slice(0, -1) : frame.label;
      const approxSeconds = Number(secondsLabel);
      if (Number.isFinite(approxSeconds)) {
        const nextFrame = Math.max(0, Math.min(
          estimatedVideoTotalFrames - 1,
          Math.round((approxSeconds / videoMetadata.duration_seconds) * (estimatedVideoTotalFrames - 1)),
        ));
        setVideoPlayheadFrameIndex(nextFrame);
        masterClock.seek(nextFrame);
      }
    }
  }, [selectedVideoPreviewFrame, videoMetadata?.duration_seconds, estimatedVideoTotalFrames, videoPreviewFrames, workspaceMode]);

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

    let cancelled = false;

    void (async () => {
      if (isPlaying) {
        setShowOriginal(false);

        if (frame.previewDataUrl) {
          try {
            const preview = await loadImageFromSrc(frame.previewDataUrl);
            if (cancelled) return;
            setProcessedImage(preview);
            return;
          } catch (error) {
            if (cancelled) return;
            console.error("Failed to load cached frame preview", error);
          }
        }

        if (!cancelled) {
          void renderFramePreview(frame.id, frame.layers, undefined, true);
        }
        return;
      }

      try {
        const image = await loadImageFromSrc(frame.src);
        if (cancelled) return;
        setOriginalImage(image);
        setImageSize(`${image.width}×${image.height}`);

        setLayers(cloneLayers(frame.layers));
        setActiveLayerId(frame.activeLayerId ?? frame.layers[0]?.id ?? "");
        const snapshotLayer = frame.layers.find((layer) => layer.id === (frame.activeLayerId ?? frame.layers[0]?.id)) ?? frame.layers[0] ?? null;
        applyLayerSnapshotToControls(snapshotLayer);

        if (frame.previewDataUrl) {
          try {
            const preview = await loadImageFromSrc(frame.previewDataUrl);
            if (cancelled) return;
            setProcessedImage(preview);
            setShowOriginal(false);
            return;
          } catch (error) {
            if (cancelled) return;
            console.error("Failed to load cached frame preview", error);
          }
        }

        void renderFramePreview(frame.id, frame.layers, image);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load selected animation frame", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyLayerSnapshotToControls, isPlaying, playbackFrameIndex, renderFramePreview, selectedFrameIndex, setActiveLayerId, setImageSize, setLayers, setOriginalImage, setProcessedImage, setShowOriginal, workspaceMode]);

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
    setImageProcessedRgba(null);
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

  const renderFreshExportImage = useCallback(async (): Promise<HTMLImageElement | null> => {
    return measureBudget("export", async () => {
      if (!originalImage) {
        return processedImage || null;
      }
      const colorSnapshot = captureColorPipelineSnapshot();

      const frame = await imageToRgbaFrame(originalImage);
      const imageData = new ImageData(
        new Uint8ClampedArray(frame.rgba),
        frame.width,
        frame.height,
      );
      const { buffer, width, height } = await processImage(imageData, colorSnapshot.layersPayload);
      const rendered = new Uint8ClampedArray(buffer);
      const exportBytes = cmykSoftProof ? applyCmykSoftProof(rendered) : rendered;
      return rgbaToImage(exportBytes, width, height);
    });
  }, [captureColorPipelineSnapshot, cmykSoftProof, measureBudget, originalImage, processImage, processedImage]);

  // Save current image as PNG from a fresh payload render.
  const handleExportImage = useCallback(async () => {
    const imageToSave = await renderFreshExportImage();
    if (!imageToSave) {
      toast.error("No image to export!");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = imageToSave.width;
    canvas.height = imageToSave.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(imageToSave, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        toast.error("Failed to encode PNG");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dithered_${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [renderFreshExportImage]);

  // Project save/load ───────────────────────────────────────────────────────
  const { handleNewProject, handleSaveProject, handleOpenProject } = useProjectHydrator({
    originalImage,
    sourceImageFile,
    videoSource,
    framesRef,
    selectedFrameIndex,
    selectedFrameIds,
    layersRef,
    activeLayerIdRef,
    setOriginalImage,
    setProcessedImage,
    setShowOriginal,
    setImageSize,
    setSourceImageFile,
    setVideoSource,
    setVideoMetadata,
    setVideoPreviewFrames,
    setSelectedVideoPreviewFrame,
    setVideoLayerTracks,
    clearVideoMediaState,
    loadVideoFile,
    setFrames,
    setSelectedFrameIndex,
    setSelectedFrameIds,
    setLayers,
    setActiveLayerId,
    setWorkspaceMode,
    setStatus,
    setCustomColors,
    setPaletteOptions,
    setPalette,
    applyLayerSnapshotToControls,
    applyEffectParams,
    markProjectDirty,
    clearProjectDirty,
    setCustomPalette,
  });

  useEffect(() => {
    if (!backendConnected) {
      return;
    }

    // TEMP: disable project dirty sync noise while debugging black preview.
    // Re-enable after worker rendering diagnostics are complete.
    return;

    if (videoPlaying) {
      // Avoid hammering Rust dirty-sync while transport playback is active.
      return;
    }

    // Sync dirty flag to Rust only when the value actually changes.
    if (lastSyncedDirtyRef.current === hasUnsavedChanges) {
      return;
    }

    const timer = window.setTimeout(() => {
      // Re-check at fire time to avoid stale syncs.
      if (lastSyncedDirtyRef.current === hasUnsavedChanges) {
        return;
      }
      lastSyncedDirtyRef.current = hasUnsavedChanges;
      console.log("[exit-debug] syncing dirty state to Rust:", hasUnsavedChanges);
      void safeTauriInvoke("set_project_dirty", { dirty: hasUnsavedChanges });
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [backendConnected, hasUnsavedChanges, videoPlaying]);

  useEffect(() => {
    if (!backendConnected) {
      return;
    }

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const setupExitListener = async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const stop = await listen("app-exit-requested", async () => {
        const isDirty = hasUnsavedChangesRef.current;
        console.log("[exit-debug] app-exit-requested received; dirty=", isDirty);
        if (!isDirty) {
          console.log("[exit-debug] no unsaved changes; exiting immediately");
          await safeTauriInvoke("exit_app", {});
          return;
        }

        console.log("[exit-debug] unsaved changes present; showing warning dialog");
        setShowExitWarning(true);
      });

      if (cancelled) {
        try {
          stop();
        } catch (err) {
          console.warn("[Index] exit listener teardown failed during setup cancellation", err);
        }
        return;
      }

      unlisten = stop;
    };

    void setupExitListener();

    return () => {
      cancelled = true;
      if (!unlisten) return;
      try {
        unlisten();
      } catch (err) {
        console.warn("[Index] exit listener unlisten failed", err);
      }
    };
  }, [backendConnected]);

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
  }, [handleSaveProject]);

  const handleDiscardAndExit = useCallback(async () => {
    setShowExitWarning(false);
    setHasUnsavedChanges(false);
    console.log("[exit-debug] discard clicked; exiting app");
    await safeTauriInvoke("exit_app", {});
  }, []);

  const handleCancelExitWarning = useCallback(() => {
    setShowExitWarning(false);
  }, []);

  const handleExport = useCallback(() => {
    void handleExportImage();
  }, [handleExportImage]);

  const {
    handleExtractPaletteFromCurrentImage,
    handleExtractPaletteFromOriginalImage,
    handleSavePalette,
    handleImportPaletteFile,
    handleExportPaletteFile,
    handlePaletteReorder,
    handlePaletteColorEdit,
  } = usePaletteWorkflow({
    isActiveLayerLocked,
    palette,
    customColors,
    quantizationColorCount,
    quantizationMethod,
    originalImage,
    processedImage,
    setStatus,
    setQuantizingPalette,
    setPalette: (v: string) => setPalette(v as ColorPalette),
    setPaletteOptions,
    setCustomColors,
    setHasUnsavedChanges,
    setShowColorStudio,
    setCustomPalette,
    rgbToHex,
    hexToRgb,
    extractPaletteLocal,
  });

  const handleExportSvg = useCallback(async () => {
    const imageToSave = await renderFreshExportImage();
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
  }, [renderFreshExportImage]);

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
            if (!hasUnsavedChangesRef.current) {
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
        try {
          stop();
        } catch (err) {
          console.warn("[Index] menu listener teardown failed during setup cancellation", err);
        }
        return;
      }

      unlisten = stop;
    };

    void setupMenuListener();

    return () => {
      cancelled = true;
      if (!unlisten) return;
      try {
        unlisten();
      } catch (err) {
        console.warn("[Index] menu listener unlisten failed", err);
      }
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
            workspaceMode={viewState.workspaceMode}
          />
        )}

        <Toolbar
          onToggleFocusMode={() => setFocusMode((prev) => !prev)}
          onSelectWorkspaceMode={handleToolbarWorkspaceSelect}
          onOpenColorStudio={() => setShowColorStudio(true)}
          workspaceMode={viewState.workspaceMode}
          focusMode={viewState.focusMode}
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
              focusMode={viewState.focusMode}
              workspaceMode={viewState.workspaceMode}
              originalImage={originalImage}
              processedImage={processedImage}
              originalRgba={viewState.workspaceMode === "video" ? videoOriginalRgba : null}
              processedRgba={
                viewState.workspaceMode === "video"
                  ? videoProcessedRgba
                  : viewState.workspaceMode === "image"
                    ? imageProcessedRgba
                    : null
              }
              processingMs={viewState.workspaceMode === "video" ? videoProcessingMs : null}
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
              onApplyToSelected={handleApplyToSelected}
              onRenderAnimation={handleExportAnimation}
              layers={layers}
              activeLayerId={activeLayerId}
              videoLayerTracks={videoLayerTracks}
              onUpdateVideoLayerTrack={(track) => {
                const next = videoLayerTracks.filter((t) => t.layerId !== track.layerId);
                next.push(track);
                commitVideoLayerTracks(next);
              }}
              onSelectVideoTrackLayer={setActiveLayerId}
              videoPreviewFrames={videoPreviewFrames}
              selectedVideoPreviewFrame={selectedVideoPreviewFrame}
              setSelectedVideoPreviewFrame={setSelectedVideoPreviewFrame}
              videoPlayheadFrameIndex={videoPlayheadFrameIndex}
              setVideoPlayheadFrameIndex={(frame) => {
                setVideoPlayheadFrameIndex(frame);
                masterClock.seek(frame);
              }}
              videoTotalFrames={estimatedVideoTotalFrames}
              videoFps={estimatedVideoFps}
              videoPlaying={videoPlaying}
              onToggleVideoPlayback={handleToggleVideoPlayback}
              videoLoopEnabled={videoLoopEnabled}
              setVideoLoopEnabled={setVideoLoopEnabled}
              videoInFrame={effectiveVideoInFrame}
              setVideoInFrame={(v) => setVideoInFrame(v)}
              videoOutFrame={effectiveVideoOutFrame}
              setVideoOutFrame={(v) => setVideoOutFrame(v)}
              onTrackActiveLayerForVideo={() => {
                const layerId = activeLayerIdRef.current;
                if (!layerId) return;
                const startFrame = effectiveVideoInFrame;
                const endFrame = effectiveVideoOutFrame;
                commitVideoLayerTracks([
                  ...videoLayerTracks.filter((t) => t.layerId !== layerId),
                  {
                    layerId,
                    disableOutsideRanges: true,
                    ranges: [{ startFrame, endFrame, enabled: true }],
                    keyframes: [],
                  },
                ]);
              }}
              activeLayerLabel={layersRef.current.find((l) => l.id === activeLayerIdRef.current)?.name ?? ""}
              workflowBusy={transientState.workflowBusy}
              videoSource={videoSource}
              canRenderVideo={canRenderVideo}
              videoRenderBlockedReason={videoRenderBlockedReason}
              videoPreviewBusy={transientState.videoPreviewBusy}
              videoMetadata={videoMetadata}
              onRunVideoWorkflow={handleRunVideoWorkflow}
              // Render queue integration
              renderJobs={videoRenderQueue.jobs}
              activeRenderJobId={videoRenderQueue.activeJobId}
              onSelectRenderJob={videoRenderQueue.setActiveJobId}
              onCancelRenderJob={videoRenderQueue.cancelJob}
              onClearCompletedRenderJobs={videoRenderQueue.clearCompletedJobs}
              // Ghost frame context
              videoId={videoSource ? (getNativeFilePath(videoSource) ?? videoSource.name) : null}
              videoInputPath={videoSource ? getNativeFilePath(videoSource) : null}
              videoWidth={videoMetadata?.width ?? 0}
              videoHeight={videoMetadata?.height ?? 0}
              layerPayload={activeLayersPayload as unknown[]}
              layerTracks={videoLayerTracks as unknown[]}
              videoProcessingBackend={videoGpuPreviewEnabled ? "gpu" : "cpu"}
            />

            {!focusMode && (
              <aside className="min-h-0 overflow-hidden">
                <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
                  <InspectorWindow title="Inspector">
                    <ControlPanel
                      isReadOnly={isActiveLayerLocked()}
                      algorithm={algorithm}
                      algorithmOptions={algorithmOptions}
                      setAlgorithm={(v: string) => {
                        updateActiveLayerControl(() => setAlgorithm(v as DitheringAlgorithm));
                      }}
                      palette={palette}
                      paletteOptions={paletteOptions}
                      setPalette={(v: string) => {
                        updateActiveLayerControl(() => setPalette(v as ColorPalette));
                      }}
                      intensity={intensity}
                      setIntensity={(value) => {
                        updateActiveLayerControl(() => setIntensity(value));
                      }}
                      contrast={contrast}
                      setContrast={(value) => {
                        updateActiveLayerControl(() => setContrast(value));
                      }}
                      brightness={brightness}
                      setBrightness={(value) => {
                        updateActiveLayerControl(() => setBrightness(value));
                      }}
                      saturation={saturation}
                      setSaturation={(value) => {
                        updateActiveLayerControl(() => setSaturation(value));
                      }}
                      pixelSize={pixelSize}
                      setPixelSize={(value) => {
                        updateActiveLayerControl(() => setPixelSize(value));
                      }}
                      blur={blur}
                      setBlur={(value) => {
                        updateActiveLayerControl(() => setBlur(value));
                      }}
                      sharpness={sharpness}
                      setSharpness={(value) => {
                        updateActiveLayerControl(() => setSharpness(value));
                      }}
                      noise={noise}
                      setNoise={(value) => {
                        updateActiveLayerControl(() => setNoise(value));
                      }}
                      blendMode={blendMode}
                      setBlendMode={(value) => {
                        updateActiveLayerControl(() => setBlendMode(value));
                      }}
                      layerOpacity={layerOpacity}
                      setLayerOpacity={(value) => {
                        updateActiveLayerControl(() => setLayerOpacity(value));
                      }}
                      paletteSwatches={domainState.paletteSwatches}
                      onPaletteReorder={handlePaletteReorder}
                      onPaletteColorEdit={handlePaletteColorEdit}
                      snapGlitchToPalette={snapGlitchToPalette}
                      setSnapGlitchToPalette={(value) => {
                        updateActiveLayerControl(() => setSnapGlitchToPalette(value));
                      }}
                      paletteMix={paletteMix}
                      setPaletteMix={(value) => {
                        updateActiveLayerControl(() => setPaletteMix(value));
                      }}
                      globalSeed={globalSeed}
                      setGlobalSeed={(value) => {
                        updateActiveLayerControl(() => setGlobalSeed(value));
                      }}
                      glitchType={glitchType}
                      setGlitchType={(value) => {
                        updateActiveLayerControl(() => setGlitchType(value));
                      }}
                      pixelSortMetric={pixelSortMetric}
                      setPixelSortMetric={(value) => {
                        updateActiveLayerControl(() => setPixelSortMetric(value));
                      }}
                      pixelSortMask={pixelSortMask}
                      setPixelSortMask={(value) => {
                        updateActiveLayerControl(() => setPixelSortMask(value));
                      }}
                      thresholdMin={thresholdMin}
                      setThresholdMin={(value) => {
                        updateActiveLayerControl(() => setThresholdMin(value));
                      }}
                      thresholdMax={thresholdMax}
                      setThresholdMax={(value) => {
                        updateActiveLayerControl(() => setThresholdMax(value));
                      }}
                      angle={angle}
                      setAngle={(value) => {
                        updateActiveLayerControl(() => setAngle(value));
                      }}
                      sortLength={sortLength}
                      setSortLength={(value) => {
                        updateActiveLayerControl(() => setSortLength(value));
                      }}
                      blockSize={blockSize}
                      setBlockSize={(value) => {
                        updateActiveLayerControl(() => setBlockSize(value));
                      }}
                      chaos={chaos}
                      setChaos={(value) => {
                        updateActiveLayerControl(() => setChaos(value));
                      }}
                      quantization={quantization}
                      setQuantization={(value) => {
                        updateActiveLayerControl(() => setQuantization(value));
                      }}
                      redShiftX={redShiftX}
                      setRedShiftX={(value) => {
                        updateActiveLayerControl(() => setRedShiftX(value));
                      }}
                      redShiftY={redShiftY}
                      setRedShiftY={(value) => {
                        updateActiveLayerControl(() => setRedShiftY(value));
                      }}
                      greenShiftX={greenShiftX}
                      setGreenShiftX={(value) => {
                        updateActiveLayerControl(() => setGreenShiftX(value));
                      }}
                      greenShiftY={greenShiftY}
                      setGreenShiftY={(value) => {
                        updateActiveLayerControl(() => setGreenShiftY(value));
                      }}
                      blueShiftX={blueShiftX}
                      setBlueShiftX={(value) => {
                        updateActiveLayerControl(() => setBlueShiftX(value));
                      }}
                      blueShiftY={blueShiftY}
                      setBlueShiftY={(value) => {
                        updateActiveLayerControl(() => setBlueShiftY(value));
                      }}
                      globalRgbShiftIntensity={globalRgbShiftIntensity}
                      setGlobalRgbShiftIntensity={(value) => {
                        updateActiveLayerControl(() => setGlobalRgbShiftIntensity(value));
                      }}
                      sliceCount={sliceCount}
                      setSliceCount={(value) => {
                        updateActiveLayerControl(() => setSliceCount(value));
                      }}
                      maxOffset={maxOffset}
                      setMaxOffset={(value) => {
                        updateActiveLayerControl(() => setMaxOffset(value));
                      }}
                      randomness={randomness}
                      setRandomness={(value) => {
                        updateActiveLayerControl(() => setRandomness(value));
                      }}
                      scanlineThickness={scanlineThickness}
                      setScanlineThickness={(value) => {
                        updateActiveLayerControl(() => setScanlineThickness(value));
                      }}
                      scanlineGap={scanlineGap}
                      setScanlineGap={(value) => {
                        updateActiveLayerControl(() => setScanlineGap(value));
                      }}
                      flicker={flicker}
                      setFlicker={(value) => {
                        updateActiveLayerControl(() => setFlicker(value));
                      }}
                      curvature={curvature}
                      setCurvature={(value) => {
                        updateActiveLayerControl(() => setCurvature(value));
                      }}
                      maskTarget={maskTarget}
                      setMaskTarget={(value) => {
                        updateActiveLayerControl(() => setMaskTarget(value));
                      }}
                      maskFeather={maskFeather}
                      setMaskFeather={(value) => {
                        updateActiveLayerControl(() => setMaskFeather(value));
                      }}
                      cmykSoftProof={cmykSoftProof}
                      setCmykSoftProof={(value) => {
                        setCmykSoftProof(value);
                      }}
                      maskR={maskR}
                      setMaskR={(value) => {
                        updateActiveLayerControl(() => setMaskR(value));
                      }}
                      maskG={maskG}
                      setMaskG={(value) => {
                        updateActiveLayerControl(() => setMaskG(value));
                      }}
                      maskB={maskB}
                      setMaskB={(value) => {
                        updateActiveLayerControl(() => setMaskB(value));
                      }}
                      maskA={maskA}
                      setMaskA={(value) => {
                        updateActiveLayerControl(() => setMaskA(value));
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
            focusMode={viewState.focusMode}
            workspaceMode={viewState.workspaceMode}
            backendConnected={backendConnected}
            imageSize={imageSize}
            workflowStatus={workflowStatus}
            jobProgressText={jobProgressText}
            status={status}
            previewQualityLabel={transientState.previewQuality === "accurate" ? "Accurate" : "Fast"}
          />
        )}
      </div>
      </div>
      </TooltipProvider>
      
      <AppOverlays
        showColorStudio={showColorStudio}
        onCloseColorStudio={() => setShowColorStudio(false)}
        activePaletteColors={domainState.paletteSwatches}
        quantizationMethod={quantizationMethod}
        setQuantizationMethod={setQuantizationMethod}
        quantizationColorCount={quantizationColorCount}
        setQuantizationColorCount={setQuantizationColorCount}
        canAutoQuantize={Boolean(originalImage || processedImage)}
        canExtractFromOriginal={Boolean(originalImage)}
        quantizingPalette={quantizingPalette}
        onExtractFromImage={handleExtractPaletteFromCurrentImage}
        onExtractFromOriginal={handleExtractPaletteFromOriginalImage}
        onImportPalette={handleImportPaletteFile}
        onExportPalette={handleExportPaletteFile}
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
        workflowBusy={transientState.workflowBusy}
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
