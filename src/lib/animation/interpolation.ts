import { cloneLayers, type Layer } from "@/types/layers";
import { type AnimationFrame } from "@/types/animationFrame";
import { lerpFrameSettings } from "@/types/frameSettings";

type EasingFn = (t: number) => number;

const EASING_FUNCTIONS: Record<string, EasingFn> = {
  linear: (t) => t,
  "ease-in": (t) => t * t,
  "ease-out": (t) => t * (2 - t),
  "ease-in-out": (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  "ease-in-cubic": (t) => t * t * t,
  "ease-out-cubic": (t) => 1 - Math.pow(1 - t, 3),
  "ease-in-out-cubic": (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
};

export const EASING_OPTIONS = Object.keys(EASING_FUNCTIONS);

export function interpolateLayerStates(startLayers: Layer[], endLayers: Layer[], t: number): Layer[] {
  const next = cloneLayers(startLayers);
  const endLayersById = new Map(endLayers.map((layer) => [layer.id, layer]));

  for (const layer of next) {
    const endLayer = endLayersById.get(layer.id);
    if (!endLayer) continue;

    layer.settings = lerpFrameSettings(layer.settings, endLayer.settings, t);
    layer.opacity = layer.opacity + (endLayer.opacity - layer.opacity) * t;
  }

  return next;
}

export function interpolateFrameLayers(startFrame: AnimationFrame, endFrame: AnimationFrame, t: number): AnimationFrame {
  return {
    ...startFrame,
    layers: interpolateLayerStates(startFrame.layers, endFrame.layers, t),
    activeLayerId: t < 0.5 ? startFrame.activeLayerId : endFrame.activeLayerId,
    isKeyframe: false,
    previewDataUrl: undefined,
  };
}

/**
 * Interpolate effect parameters between two keyframe positions.
 *
 * Finds the frames at startIdx and endIdx (which must both be keyframes),
 * then fills every intermediate frame with smoothly interpolated params.
 * Intermediate frames are NOT promoted to keyframes.
 *
 * Returns a new frames array — does not mutate the input.
 */
export function interpolateParams(
  frames: AnimationFrame[],
  startIdx: number,
  endIdx: number,
  easingType: string = "linear",
): AnimationFrame[] {
  if (
    startIdx >= endIdx ||
    startIdx < 0 ||
    endIdx >= frames.length
  ) {
    return frames;
  }

  const ease = EASING_FUNCTIONS[easingType] ?? EASING_FUNCTIONS.linear!;
  const span = endIdx - startIdx;

  const result = [...frames];
  const startFrame = frames[startIdx]!;
  const endFrame = frames[endIdx]!;

  for (let i = startIdx + 1; i < endIdx; i++) {
    const t = ease((i - startIdx) / span);
    result[i] = interpolateFrameLayers(startFrame, endFrame, t);
  }

  return result;
}

export function interpolateFrameRangeByKeyframes(
  frames: AnimationFrame[],
  keyframeIndices: number[],
  easingType: string = "linear",
): AnimationFrame[] {
  if (keyframeIndices.length < 2) return frames;

  const result = [...frames];
  const ordered = [...keyframeIndices].sort((a, b) => a - b);
  const ease = EASING_FUNCTIONS[easingType] ?? EASING_FUNCTIONS.linear!;

  for (let i = 0; i < ordered.length - 1; i += 1) {
    const startIdx = ordered[i]!;
    const endIdx = ordered[i + 1]!;
    if (startIdx < 0 || endIdx >= frames.length || startIdx >= endIdx) continue;

    const span = endIdx - startIdx;
    const startFrame = frames[startIdx]!;
    const endFrame = frames[endIdx]!;

    result[startIdx] = { ...startFrame, isKeyframe: true };
    result[endIdx] = { ...endFrame, isKeyframe: true };

    for (let frameIndex = startIdx + 1; frameIndex < endIdx; frameIndex += 1) {
      const t = ease((frameIndex - startIdx) / span);
      result[frameIndex] = interpolateFrameLayers(startFrame, endFrame, t);
    }
  }

  return result;
}
