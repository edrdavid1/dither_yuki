import { makeAnimationFrame, type AnimationFrame } from "@/types/animationFrame";
import { cloneLayers } from "@/types/layers";

export interface FilmstripProjectData {
  version: 1;
  frames: AnimationFrame[];
  selectedFrameIndex: number;
  selectedFrameIds: string[];
  rootLayers?: AnimationFrame["layers"];
  rootActiveLayerId?: string;
}

const FILMSTRIP_DATA_VERSION = 1 as const;

function toBytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function fromBytes(bytes: number[] | Uint8Array): string {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

export function encodeFilmstripProjectData(data: FilmstripProjectData): number[] {
  return toBytes(JSON.stringify({
    version: FILMSTRIP_DATA_VERSION,
    frames: data.frames,
    selectedFrameIndex: data.selectedFrameIndex,
    selectedFrameIds: data.selectedFrameIds,
    rootLayers: data.rootLayers,
    rootActiveLayerId: data.rootActiveLayerId,
  } satisfies FilmstripProjectData));
}

export function decodeFilmstripProjectData(bytes: number[] | Uint8Array | null | undefined): FilmstripProjectData | null {
  if (!bytes || bytes.length === 0) return null;

  try {
    const parsed = JSON.parse(fromBytes(bytes)) as Partial<FilmstripProjectData> & { version?: unknown };
    if (parsed.version !== FILMSTRIP_DATA_VERSION || !Array.isArray(parsed.frames)) {
      return null;
    }

    const frames = parsed.frames.map((frame) => makeAnimationFrame({
      id: String(frame.id),
      src: String(frame.src ?? ""),
      width: Number(frame.width ?? 1),
      height: Number(frame.height ?? 1),
      layers: cloneLayers(frame.layers ?? []),
      activeLayerId: String(frame.activeLayerId ?? frame.layers?.[0]?.id ?? ""),
      isKeyframe: Boolean(frame.isKeyframe),
      easing: String(frame.easing ?? "linear"),
      sourceTimestamp: typeof frame.sourceTimestamp === "number" ? frame.sourceTimestamp : undefined,
      previewDataUrl: typeof frame.previewDataUrl === "string" ? frame.previewDataUrl : undefined,
    }));

    const selectedFrameIndex = Number.isFinite(parsed.selectedFrameIndex)
      ? Math.max(0, Math.min(Number(parsed.selectedFrameIndex), Math.max(frames.length - 1, 0)))
      : 0;
    const selectedFrameIds = Array.isArray(parsed.selectedFrameIds)
      ? parsed.selectedFrameIds.map((id) => String(id)).filter(Boolean)
      : [];

    return {
      version: FILMSTRIP_DATA_VERSION,
      frames,
      selectedFrameIndex,
      selectedFrameIds,
      rootLayers: Array.isArray(parsed.rootLayers) ? cloneLayers(parsed.rootLayers) : undefined,
      rootActiveLayerId: typeof parsed.rootActiveLayerId === "string" ? parsed.rootActiveLayerId : undefined,
    };
  } catch {
    return null;
  }
}
