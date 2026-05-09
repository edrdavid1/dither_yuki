import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { encodeAsePalette, encodeGplPalette, encodeHexPalette, encodeJsonPalette, parseAsePalette, parsePaletteByExtension, rgbToHex as rgbToHexPaletteFormat } from "@/lib/paletteFormats";
import { pickOpenPalettePath, pickSavePalettePath, readBytesFromPath, safeTauriInvoke } from "@/lib/tauriBridge";

interface UsePaletteWorkflowArgs {
  isActiveLayerLocked: () => boolean;
  palette: string;
  customColors: string[];
  quantizationColorCount: number;
  quantizationMethod: string;
  originalImage: HTMLImageElement | null;
  processedImage: HTMLImageElement | null;
  setStatus: (status: string) => void;
  setQuantizingPalette: (value: boolean) => void;
  setPalette: (value: string) => void;
  setPaletteOptions: Dispatch<SetStateAction<string[]>>;
  setCustomColors: Dispatch<SetStateAction<string[]>>;
  setHasUnsavedChanges: (value: boolean) => void;
  setShowColorStudio: (value: boolean) => void;
  setCustomPalette: (hexColors: string[]) => void;
  rgbToHex: (color: [number, number, number]) => string;
  hexToRgb: (hex: string) => [number, number, number] | null;
  extractPaletteLocal: (
    rgba: Uint8ClampedArray,
    colorCount: number,
    method: string,
  ) => [number, number, number][];
}

export function usePaletteWorkflow({
  isActiveLayerLocked,
  palette,
  customColors,
  quantizationColorCount,
  quantizationMethod,
  originalImage,
  processedImage,
  setStatus,
  setQuantizingPalette,
  setPalette,
  setPaletteOptions,
  setCustomColors,
  setHasUnsavedChanges,
  setShowColorStudio,
  setCustomPalette,
  rgbToHex,
  hexToRgb,
  extractPaletteLocal,
}: UsePaletteWorkflowArgs) {
  const extractPaletteFromImageSource = useCallback(async (
    imageSource: HTMLImageElement | null,
    sourceLabel: "frame" | "original",
  ): Promise<string[] | null> => {
    if (!imageSource) {
      toast.error("Load an image first");
      return null;
    }

    setQuantizingPalette(true);
    setStatus(sourceLabel === "original" ? "Extracting palette from original..." : "Extracting palette...");

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

      toast.success(
        backendExtracted?.length
          ? `Extracted ${hexColors.length} colors`
          : `Extracted ${hexColors.length} colors (local fallback)`,
      );
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
  }, [
    extractPaletteLocal,
    quantizationColorCount,
    quantizationMethod,
    rgbToHex,
    setCustomColors,
    setCustomPalette,
    setPalette,
    setPaletteOptions,
    setQuantizingPalette,
    setStatus,
  ]);

  const handleExtractPaletteFromCurrentImage = useCallback(async () => {
    return extractPaletteFromImageSource(processedImage || originalImage, "frame");
  }, [extractPaletteFromImageSource, originalImage, processedImage]);

  const handleExtractPaletteFromOriginalImage = useCallback(async () => {
    return extractPaletteFromImageSource(originalImage, "original");
  }, [extractPaletteFromImageSource, originalImage]);

  const handleSavePalette = useCallback((colors: string[]) => {
    if (isActiveLayerLocked()) return;
    setCustomColors(colors);
    setCustomPalette(colors);
    setPalette("Custom");
    setShowColorStudio(false);
    setHasUnsavedChanges(true);
  }, [isActiveLayerLocked, setCustomColors, setCustomPalette, setHasUnsavedChanges, setPalette, setShowColorStudio]);

  const handleImportPaletteFile = useCallback(async (): Promise<string[] | null> => {
    const path = await pickOpenPalettePath();
    if (!path) return null;

    try {
      const bytes = await readBytesFromPath(path);
      if (!bytes) {
        toast.error("Failed to read palette file");
        return null;
      }

      const content = new TextDecoder().decode(bytes);
      const fileName = path.split("/").pop() ?? path;
      const ext = fileName.toLowerCase().split(".").pop() ?? "";
      const parsed = ext === "ase"
        ? parseAsePalette(bytes)
        : parsePaletteByExtension(fileName, content);
      if (parsed.length < 2) {
        toast.error("Palette file must contain at least 2 colors");
        return null;
      }

      const hexColors = parsed.map((rgb) => rgbToHexPaletteFormat(rgb));
      setStatus(`Palette imported (${hexColors.length} colors)`);
      toast.success(`Palette imported: ${fileName}`);
      return hexColors;
    } catch (error) {
      console.error("Failed to import palette file", error);
      toast.error("Failed to import palette");
      return null;
    }
  }, [setStatus]);

  const handleExportPaletteFile = useCallback(async (): Promise<void> => {
    const rgbColors = customColors
      .map(hexToRgb)
      .filter((color): color is [number, number, number] => color !== null);

    if (rgbColors.length < 2) {
      toast.error("Palette needs at least 2 colors");
      return;
    }

    const path = await pickSavePalettePath("palette.gpl");
    if (!path) return;

    const ext = path.toLowerCase().split(".").pop() ?? "gpl";
    const resolvedPath = path.includes(".") ? path : `${path}.gpl`;
    const bytes = ext === "ase"
      ? Array.from(encodeAsePalette("Custom Palette", rgbColors))
      : Array.from(new TextEncoder().encode(
          ext === "json"
            ? encodeJsonPalette("Custom Palette", rgbColors)
            : ext === "hex" || ext === "txt"
              ? encodeHexPalette(rgbColors)
              : encodeGplPalette("Custom Palette", rgbColors),
        ));
    const savedPath = await safeTauriInvoke<string>("save_bytes_to_path", {
      filePath: resolvedPath,
      bytes,
    });

    if (savedPath) {
      setStatus(`Palette exported: ${savedPath.split("/").pop()}`);
      toast.success(`Palette exported: ${savedPath}`);
      return;
    }

    toast.error("Failed to export palette");
  }, [customColors, hexToRgb, setStatus]);

  const handlePaletteReorder = useCallback((fromIndex: number, toIndex: number) => {
    if (isActiveLayerLocked()) return;
    if (palette !== "Custom") return;

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
  }, [isActiveLayerLocked, palette, setCustomColors, setCustomPalette, setHasUnsavedChanges]);

  const handlePaletteColorEdit = useCallback((index: number, hex: string) => {
    if (isActiveLayerLocked()) return;
    if (palette !== "Custom") return;

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
  }, [isActiveLayerLocked, palette, setCustomColors, setCustomPalette, setHasUnsavedChanges]);

  return {
    handleExtractPaletteFromCurrentImage,
    handleExtractPaletteFromOriginalImage,
    handleSavePalette,
    handleImportPaletteFile,
    handleExportPaletteFile,
    handlePaletteReorder,
    handlePaletteColorEdit,
  };
}

