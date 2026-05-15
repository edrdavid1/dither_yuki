export type FrameIndex = number;

export interface LayerRange {
  startFrame: FrameIndex;
  endFrame: FrameIndex;
  /** If set, overrides payload.enabled for frames inside the range. */
  enabled?: boolean;
  /** If set, overrides payload.opacity (0..1) for frames inside the range. */
  opacity01?: number;
  /** If set, overrides payload.intensity for frames inside the range. */
  intensity?: number;
  /** Source media in-point (frame index). When set together with sourceOutFrame,
   *  the resolved source frame is clamped to [sourceInFrame, sourceOutFrame]. */
  sourceInFrame?: FrameIndex;
  /** Source media out-point (frame index). When set together with sourceInFrame,
   *  the resolved source frame is clamped to [sourceInFrame, sourceOutFrame]. */
  sourceOutFrame?: FrameIndex;
}

export interface LayerKeyframe {
  frame: FrameIndex;
  opacity01?: number;
  intensity?: number;
}

export interface LayerTrack {
  layerId: string;
  /** If true, layer is disabled outside any defined range. Default: true. */
  disableOutsideRanges?: boolean;
  ranges: LayerRange[];
  keyframes: LayerKeyframe[];
}

export function cloneLayerRange(range: LayerRange): LayerRange {
  return { ...range };
}

export function cloneLayerKeyframe(keyframe: LayerKeyframe): LayerKeyframe {
  return { ...keyframe };
}

export function cloneLayerTrack(track: LayerTrack): LayerTrack {
  return {
    ...track,
    ranges: track.ranges.map(cloneLayerRange),
    keyframes: track.keyframes.map(cloneLayerKeyframe),
  };
}

export function cloneLayerTracks(tracks: LayerTrack[]): LayerTrack[] {
  return tracks.map(cloneLayerTrack);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function findActiveRange(ranges: LayerRange[], frame: number): LayerRange | null {
  for (const r of ranges) {
    if (frame >= r.startFrame && frame <= r.endFrame) return r;
  }
  return null;
}

function findKeyframeBounds(keyframes: LayerKeyframe[], frame: number): { prev: LayerKeyframe | null; next: LayerKeyframe | null } {
  let prev: LayerKeyframe | null = null;
  let next: LayerKeyframe | null = null;
  for (const k of keyframes) {
    if (k.frame <= frame && (!prev || k.frame > prev.frame)) prev = k;
    if (k.frame >= frame && (!next || k.frame < next.frame)) next = k;
  }
  return { prev, next };
}

function lerpNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateKeyframes(keyframes: LayerKeyframe[], frame: number): { opacity01?: number; intensity?: number } {
  if (!keyframes.length) return {};
  const { prev, next } = findKeyframeBounds(keyframes, frame);
  if (!prev && !next) return {};
  if (prev && (!next || next.frame === prev.frame)) {
    return { opacity01: prev.opacity01, intensity: prev.intensity };
  }
  if (!prev && next) {
    return { opacity01: next.opacity01, intensity: next.intensity };
  }
  if (!prev || !next) return {};
  const span = Math.max(1, next.frame - prev.frame);
  const t = (frame - prev.frame) / span;
  const out: { opacity01?: number; intensity?: number } = {};
  if (typeof prev.opacity01 === "number" && typeof next.opacity01 === "number") {
    out.opacity01 = clamp01(lerpNumber(prev.opacity01, next.opacity01, t));
  }
  if (typeof prev.intensity === "number" && typeof next.intensity === "number") {
    out.intensity = lerpNumber(prev.intensity, next.intensity, t);
  }
  return out;
}

/**
 * Apply time-based tracks to a backend layer payload array.
 * This operates at the payload level to avoid breaking the canonical Layer->DTO mapping.
 */
export function applyLayerTracksToPayload(
  payload: Array<Record<string, unknown>>,
  tracks: LayerTrack[],
  frameIndex: number,
): Array<Record<string, unknown>> {
  if (!tracks.length) return payload;
  const trackByLayerId = new Map(tracks.map((t) => [t.layerId, t]));

  return payload.map((layer) => {
    const id = String(layer.id ?? "");
    const track = trackByLayerId.get(id);
    if (!track) return layer;

    const activeRange = findActiveRange(track.ranges, frameIndex);
    const disableOutside = track.disableOutsideRanges ?? true;

    const next: Record<string, unknown> = { ...layer };

    if (!activeRange && disableOutside) {
      next.enabled = false;
      return next;
    }

    if (activeRange) {
      if (typeof activeRange.enabled === "boolean") next.enabled = activeRange.enabled;
      if (typeof activeRange.opacity01 === "number") next.opacity = clamp01(activeRange.opacity01);
      if (typeof activeRange.intensity === "number") next.intensity = activeRange.intensity;
    }

    const kf = interpolateKeyframes(track.keyframes, frameIndex);
    if (typeof kf.opacity01 === "number") next.opacity = clamp01(kf.opacity01);
    if (typeof kf.intensity === "number") next.intensity = kf.intensity;

    return next;
  });
}

