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

export async function readBytesFromPath(filePath: string): Promise<Uint8Array | null> {
  const bytes = await safeTauriInvoke<number[]>("read_bytes_from_path", { filePath });
  return bytes ? new Uint8Array(bytes) : null;
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
