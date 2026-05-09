import { useCallback } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { toast } from "sonner";
import { type AnimationFrame } from "@/types/animationFrame";
import { type Layer, cloneLayers, createNeutralLayer } from "@/types/layers";
import { useProjectStore } from "@/store/projectStore";
import { encodeFilmstripProjectData, decodeFilmstripProjectData } from "@/lib/animation/filmstripPersistence";
import { getNativeFilePath } from "@/lib/mediaWorkflow";
import { readBytesFromPath, safeTauriInvoke, pickSaveProjectPath, pickOpenProjectPath } from "@/lib/tauriBridge";
import type { DyprojManifest } from "@/types/project";
import type { ColorPalette } from "@/utils/dithering";
import type { FrameSettings } from "@/types/frameSettings";
import type { WorkspaceMode } from "@/components/WorkspaceModeSwitcher";
import { DEFAULT_FRAME_SETTINGS } from "@/types/frameSettings";

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

const loadImageFromBytes = (bytes: Uint8Array): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(new Blob([bytes as unknown as BlobPart]));
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image from bytes"));
    };
    image.src = objectUrl;
  });
};

export interface UseProjectHydratorArgs {
  originalImage: HTMLImageElement | null;
  sourceImageFile: File | null;
  videoSource: File | null;
  framesRef: RefObject<AnimationFrame[]>;
  selectedFrameIndex: number;
  selectedFrameIds: Set<string>;
  layersRef: RefObject<Layer[]>;
  activeLayerIdRef: RefObject<string>;
  setOriginalImage: Dispatch<SetStateAction<HTMLImageElement | null>>;
  setProcessedImage: Dispatch<SetStateAction<HTMLImageElement | null>>;
  setShowOriginal: Dispatch<SetStateAction<boolean>>;
  setImageSize: Dispatch<SetStateAction<string | undefined>>;
  setSourceImageFile: Dispatch<SetStateAction<File | null>>;
  setVideoSource: Dispatch<SetStateAction<File | null>>;
  setVideoMetadata: Dispatch<SetStateAction<VideoMetadataLike | null>>;
  setVideoPreviewFrames: Dispatch<SetStateAction<VideoPreviewFrame[]>>;
  setSelectedVideoPreviewFrame: Dispatch<SetStateAction<number>>;
  setFrames: Dispatch<SetStateAction<AnimationFrame[]>>;
  setSelectedFrameIndex: Dispatch<SetStateAction<number>>;
  setSelectedFrameIds: Dispatch<SetStateAction<Set<string>>>;
  setLayers: Dispatch<SetStateAction<Layer[]>>;
  setActiveLayerId: Dispatch<SetStateAction<string>>;
  setWorkspaceMode: Dispatch<SetStateAction<WorkspaceMode>>;
  setStatus: (status: string) => void;
  setCustomColors: Dispatch<SetStateAction<string[]>>;
  setPaletteOptions: Dispatch<SetStateAction<ColorPalette[]>>;
  setPalette: Dispatch<SetStateAction<ColorPalette>>;
  applyLayerSnapshotToControls: (layerSnapshot: Layer | null) => void;
  applyEffectParams: (params: Partial<FrameSettings>) => void;
  markProjectDirty: () => void;
  clearProjectDirty: () => void;
  setCustomPalette: (colors: string[]) => void;
}

export interface UseProjectHydratorResult {
  handleNewProject: () => void;
  handleSaveProject: () => Promise<boolean>;
  handleOpenProject: () => Promise<void>;
}

export function useProjectHydrator(args: UseProjectHydratorArgs): UseProjectHydratorResult {
  const {
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
  } = args;

  const projectManifest = useProjectStore((s) => s.manifest);
  const newProject = useProjectStore((s) => s.newProject);
  const loadProjectStore = useProjectStore((s) => s.loadProject);
  const saveProjectStore = useProjectStore((s) => s.saveProject);
  const updateManifest = useProjectStore((s) => s.updateManifest);

  const resetToDefaultSingleLayer = useCallback(() => {
    const defaultLayer = createNeutralLayer("1");
    setLayers([defaultLayer]);
    setActiveLayerId(defaultLayer.id);
    applyLayerSnapshotToControls(defaultLayer);
    return defaultLayer;
  }, [applyLayerSnapshotToControls, setActiveLayerId, setLayers]);

  const handleNewProject = useCallback(() => {
    newProject("Untitled Project");
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
    setSelectedFrameIds(new Set());
    resetToDefaultSingleLayer();
    applyEffectParams(DEFAULT_FRAME_SETTINGS);
    setWorkspaceMode("image");
    setStatus("New project created");
    markProjectDirty();
  }, [
    newProject,
    setSourceImageFile,
    setVideoSource,
    setVideoMetadata,
    setVideoPreviewFrames,
    setSelectedVideoPreviewFrame,
    setOriginalImage,
    setProcessedImage,
    setShowOriginal,
    setFrames,
    setSelectedFrameIndex,
    setSelectedFrameIds,
    resetToDefaultSingleLayer,
    setWorkspaceMode,
    setStatus,
    applyEffectParams,
    markProjectDirty,
  ]);

  const handleSaveProject = useCallback(async (): Promise<boolean> => {
    try {
      const committedLayers = layersRef.current.map((layer) => ({
        ...layer,
        settings: { ...layer.settings },
      }));
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
        rootLayers: cloneLayers(committedLayers),
        rootActiveLayerId: activeLayerIdRef.current,
      });

      if (!projectManifest) {
        const name = originalImage
          ? (sourceImageFile?.name.replace(/\.[^.]+$/, "") ?? "Untitled Project")
          : "Untitled Project";
        newProject(name);
      }

      if (originalImage) {
        await persistSourceImageForProject(
          originalImage,
          sourceImageFile,
          updateManifest,
          setCustomColors,
          setCustomPalette,
          setPalette,
        );
      }

      const existingPath = useProjectStore.getState().filePath;
      const path = existingPath ?? await pickSaveProjectPath(
        projectManifest?.name
          ? `${projectManifest.name}.dyproj`
          : `${sourceImageFile?.name.replace(/\.[^.]+$/, "") ?? "project"}.dyproj`,
      );
      if (!path) {
        return false;
      }

      const normalizedPath = path.toLowerCase().endsWith(".dyproj") ? path : `${path}.dyproj`;
      await saveProjectStore(normalizedPath, timelineData ? Array.from(new TextEncoder().encode(JSON.stringify(timelineData))) : null);
      toast.success(`Project saved: ${normalizedPath.split("/").pop()}`);
      setStatus("Project saved");
      clearProjectDirty();
      return true;
    } catch (err) {
      console.error("Save project failed", err);
      toast.error(`Failed to save project: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }, [
    originalImage,
    sourceImageFile,
    layersRef,
    activeLayerIdRef,
    framesRef,
    selectedFrameIndex,
    selectedFrameIds,
    projectManifest,
    newProject,
    updateManifest,
    setCustomColors,
    setCustomPalette,
    setPalette,
    setStatus,
    clearProjectDirty,
    saveProjectStore,
  ]);

  const handleOpenProject = useCallback(async () => {
    try {
      const path = await pickOpenProjectPath();
      if (!path) return;

      const result = await loadProjectStore(path);
      toast.success(`Project opened: ${path.split("/").pop()}`);
      if (result.offlineAssets.length) {
        toast.warning(`${result.offlineAssets.length} asset(s) could not be relinked`);
      }
      clearProjectDirty();

      const loadedManifest = useProjectStore.getState().manifest;
      const imageAsset = loadedManifest?.assets.find((a) => a.assetType === "image" && !a.offline)
        ?? loadedManifest?.assets.find((a) => !a.offline && /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name));

      const filmstrip = decodeFilmstripProjectData(result.timelineData ?? undefined);

      const savedCustomPalette = loadedManifest?.palettes?.find(
        (entry) => entry.name === "Custom" || entry.id === "custom-palette"
      )?.colors?.length
        ? loadedManifest.palettes.find((entry) => entry.name === "Custom" || entry.id === "custom-palette")
            ?.colors.map(([r, g, b]) => rgbToHex([r, g, b]))
        : null;

      if (savedCustomPalette?.length) {
        setCustomColors(savedCustomPalette);
        setCustomPalette(savedCustomPalette);
        setPaletteOptions((prev) => (prev.includes("Custom") ? prev : [...prev, "Custom"]));
      }

      const didHydrateFilmstrip = hydrateFilmstripSelection(
        filmstrip,
        setFrames,
        setSelectedFrameIndex,
        setSelectedFrameIds,
        setLayers,
        setActiveLayerId,
        applyLayerSnapshotToControls,
        setWorkspaceMode,
        setStatus,
      );

      const didHydrateRootLayers = !didHydrateFilmstrip && hydrateRootLayerSelection(
        filmstrip,
        setLayers,
        setActiveLayerId,
        applyLayerSnapshotToControls,
      );

      if (!didHydrateFilmstrip && !didHydrateRootLayers) {
        // Ensure deterministic baseline for image-only projects:
        // one default layer, active ID set, controls synced from the layer snapshot.
        resetToDefaultSingleLayer();
      }

      if (imageAsset?.originalPath) {
        try {
          const bytes = await readBytesFromPath(imageAsset.originalPath);
          if (bytes) {
            const image = await loadImageFromBytes(bytes);
            setOriginalImage(image);
            setProcessedImage(null);
            setShowOriginal(true);
            setImageSize(`${image.width}×${image.height}`);
            if (!didHydrateFilmstrip) {
              setWorkspaceMode("image");
              setStatus("Project loaded");
            }
          }
        } catch (err) {
          console.error("Failed to restore source image", err);
          toast.warning("Project opened, but source image could not be restored");
          if (!didHydrateFilmstrip) {
            setStatus("Project loaded (image unavailable)");
          }
        }
      } else {
        if (!didHydrateFilmstrip) {
          setStatus("Project loaded (no source image asset)");
        }
      }
    } catch (err) {
      console.error("Open project failed", err);
      toast.error("Failed to open project");
    }
  }, [
    loadProjectStore,
    clearProjectDirty,
    setCustomColors,
    setCustomPalette,
    setPaletteOptions,
    setPalette,
    setFrames,
    setSelectedFrameIndex,
    setSelectedFrameIds,
    resetToDefaultSingleLayer,
    applyLayerSnapshotToControls,
    setWorkspaceMode,
    setStatus,
    setOriginalImage,
    setProcessedImage,
    setShowOriginal,
    setImageSize,
  ]);

  return {
    handleNewProject,
    handleSaveProject,
    handleOpenProject,
  };
}

async function persistSourceImageForProject(
  originalImage: HTMLImageElement,
  sourceImageFile: File | null,
  updateManifest: (updater: (m: DyprojManifest) => DyprojManifest) => void,
  setCustomColors: Dispatch<SetStateAction<string[]>>,
  setCustomPalette: (colors: string[]) => void,
  setPalette: Dispatch<SetStateAction<ColorPalette>>,
) {
  const existingImageAsset = useProjectStore.getState().manifest?.assets.find(
    (a) => a.assetType === "image" && !a.offline
  );
  const nativeImagePath = getNativeFilePath(sourceImageFile) ?? existingImageAsset?.originalPath ?? null;
  let stagedPath: string | null = nativeImagePath;
  let storageMode: "external" | "embedded" = nativeImagePath
    ? (sourceImageFile ? "external" : "embedded")
    : "embedded";
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
      if (!ctx) throw new Error("Failed to create canvas context");
      ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
      if (!blob) throw new Error("Failed to encode source image");
      imageBytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
    }

    const extension = imageName.split(".").pop()?.toLowerCase() || "png";
    const tmpPath = `/tmp/dither-yuki/staging/source-${crypto.randomUUID()}.${extension}`;
    const writePath = await safeTauriInvoke<string>("save_bytes_to_path", {
      filePath: tmpPath,
      bytes: imageBytes,
    });
    if (!writePath) throw new Error("Failed to stage source image");
    stagedPath = writePath;
    storageMode = "embedded";
  }

  const customPaletteColors = useProjectStore.getState().manifest?.palettes
    ?.find((p) => p.id === "custom-palette")?.colors ?? [];

  updateManifest((m) => {
    const existingImageAsset = m.assets.find((a) => a.assetType === "image");
    const imageAssetId = existingImageAsset?.id ?? `image-${crypto.randomUUID()}`;
    const imageSize = sourceImageFile?.size ?? imageBytes?.length ?? existingImageAsset?.sizeBytes ?? 0;
    const filtered = m.assets.filter((a) => a.id !== imageAssetId && a.assetType !== "image");

    return {
      ...m,
      palettes: customPaletteColors.length > 0
        ? [{ id: "custom-palette", name: "Custom", colors: customPaletteColors }]
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

function hydrateFilmstripSelection(
  filmstripData: ReturnType<typeof decodeFilmstripProjectData>,
  setFrames: Dispatch<SetStateAction<AnimationFrame[]>>,
  setSelectedFrameIndex: Dispatch<SetStateAction<number>>,
  setSelectedFrameIds: Dispatch<SetStateAction<Set<string>>>,
  setLayers: Dispatch<SetStateAction<Layer[]>>,
  setActiveLayerId: Dispatch<SetStateAction<string>>,
  applyLayerSnapshotToControls: (layerSnapshot: Layer | null) => void,
  setWorkspaceMode: Dispatch<SetStateAction<WorkspaceMode>>,
  setStatus: (status: string) => void,
): boolean {
  if (!filmstripData?.frames.length) {
    return false;
  }

  const selectedIndex = Math.max(0, Math.min(filmstripData.selectedFrameIndex, filmstripData.frames.length - 1));
  const selectedFrame = filmstripData.frames[selectedIndex] ?? filmstripData.frames[0];
  const selectedFrameId = selectedFrame?.id;
  const selectedLayerId = selectedFrame?.activeLayerId ?? selectedFrame?.layers[0]?.id ?? "";
  const selectedLayer = selectedFrame?.layers.find((layer) => layer.id === selectedLayerId)
    ?? selectedFrame?.layers[0]
    ?? null;

  setFrames(filmstripData.frames);
  setSelectedFrameIndex(selectedIndex);
  setSelectedFrameIds(new Set(filmstripData.selectedFrameIds.length ? filmstripData.selectedFrameIds : selectedFrameId ? [selectedFrameId] : []));
  setLayers(selectedFrame ? cloneLayers(selectedFrame.layers) : [createNeutralLayer("1")]);
  setActiveLayerId(selectedLayerId);
  applyLayerSnapshotToControls(selectedLayer);
  setWorkspaceMode("animation");
  setStatus("Project loaded with filmstrip");
  return true;
}

function hydrateRootLayerSelection(
  filmstripData: ReturnType<typeof decodeFilmstripProjectData>,
  setLayers: Dispatch<SetStateAction<Layer[]>>,
  setActiveLayerId: Dispatch<SetStateAction<string>>,
  applyLayerSnapshotToControls: (layerSnapshot: Layer | null) => void,
): boolean {
  const rootLayers = filmstripData?.rootLayers;
  if (!rootLayers || rootLayers.length === 0) {
    return false;
  }

  const layers = cloneLayers(rootLayers);
  const activeLayerId = filmstripData?.rootActiveLayerId || layers[0]?.id || "";
  const activeLayer = layers.find((layer) => layer.id === activeLayerId) ?? layers[0] ?? null;

  setLayers(layers);
  setActiveLayerId(activeLayer?.id ?? "");
  applyLayerSnapshotToControls(activeLayer);
  return true;
}

// Type compatibility with Index.tsx
type VideoMetadataLike = import("@/lib/mediaWorkflow").VideoMetadataLike;

interface VideoPreviewFrame {
  id: string;
  src: string;
  width: number;
  height: number;
  label: string;
}
