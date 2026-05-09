import { cloneLayers, createNeutralLayer, type Layer } from "./layers";

/**
 * A single frame in the animation filmstrip.
 * This is the single source of truth — no parallel data structures.
 */
export interface AnimationFrame {
  id: string;
  /** Thumbnail / source data URL used for display and rendering. */
  src: string;
  width: number;
  height: number;
  /** Full layer snapshot for this frame. */
  layers: Layer[];
  /** Currently active layer id when the frame was captured. */
  activeLayerId: string;
  /** Keyframe flag. True when the user has explicitly edited this frame. */
  isKeyframe: boolean;
  /**
   * Easing function applied when interpolating FROM this keyframe to the next.
   * Only meaningful when isKeyframe === true.
   */
  easing: string;
  /** Source timestamp in seconds (video frames only). */
  sourceTimestamp?: number;
  /** Cached processed preview for this frame. */
  previewDataUrl?: string;
}

export const DEFAULT_EASING = "linear";

export function makeAnimationFrame(
  partial: Pick<AnimationFrame, "id" | "src" | "width" | "height"> & Partial<AnimationFrame>,
): AnimationFrame {
  const defaultLayers = [createNeutralLayer()];
  return {
    layers: cloneLayers(partial.layers ?? defaultLayers),
    activeLayerId: partial.activeLayerId ?? defaultLayers[0]!.id,
    isKeyframe: false,
    easing: DEFAULT_EASING,
    ...partial,
  };
}
