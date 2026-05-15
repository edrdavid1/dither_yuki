import React, { useEffect, useMemo, useRef, useState } from "react";
import type { LayerKeyframe, LayerRange, LayerTrack } from "@/lib/videoRuntime/layerTracks";
import type { Layer } from "@/types/layers";

// ─── Constants ────────────────────────────────────────────────────────────────

const PX_PER_SEC = 120;
const LABEL_WIDTH_PX = 120;
const TRACK_HEIGHT_PX = 28;
const RULER_HEIGHT_PX = 24;

type DragMode = "move" | "trim-start" | "trim-end";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DragSession {
  layerId: string;
  rangeIndex: number;
  mode: DragMode;
  startClientX: number;
  originRange: LayerRange;
  currentRange: LayerRange;
}

interface VideoTimelineTracksProps {
  layers: Layer[];
  tracks: LayerTrack[];
  totalFrames: number;
  videoFps: number;
  playheadFrame: number;
  videoInFrame: number | null;
  videoOutFrame: number | null;
  onSetPlayhead: (frame: number) => void;
  onUpdateTrack: (track: LayerTrack) => void;
  onSelectTrackLayer?: (layerId: string) => void;
  activeLayerId: string | null;
  onSelectBlock?: (layerId: string, rangeIndex: number) => void;
  selectedBlockLayerId?: string | null;
  selectedBlockRangeIndex?: number | null;
  ghostFrameUrl?: string | null;
  ghostFrameX?: number;
  ghostFrameY?: number;
  onDragStart?: (layerId: string, rangeIndex: number, startFrame: number, mode: DragMode) => void;
  onDragMove?: (currentRange: LayerRange, mode: DragMode, cursorX: number, cursorY: number) => void;
  onDragEnd?: () => void;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function cloneRange(range: LayerRange): LayerRange {
  return { ...range };
}

function frameToPx(frame: number, fps: number): number {
  return (frame / Math.max(1, fps)) * PX_PER_SEC;
}

function pxDeltaToFrames(deltaPx: number, fps: number): number {
  return Math.round((deltaPx / PX_PER_SEC) * Math.max(1, fps));
}

function clampRangeToTimeline(range: LayerRange, totalFrames: number): LayerRange {
  const lastFrame = Math.max(0, totalFrames - 1);
  let startFrame = clamp(Math.round(range.startFrame), 0, lastFrame);
  let endFrame = clamp(Math.round(range.endFrame), 0, lastFrame);
  if (endFrame < startFrame) [startFrame, endFrame] = [endFrame, startFrame];
  return { ...range, startFrame, endFrame };
}

export function moveRange(range: LayerRange, deltaFrames: number, totalFrames: number): LayerRange {
  const lastFrame = Math.max(0, totalFrames - 1);
  const span = Math.max(0, range.endFrame - range.startFrame);
  let startFrame = range.startFrame + deltaFrames;
  let endFrame = startFrame + span;
  if (startFrame < 0) { endFrame -= startFrame; startFrame = 0; }
  if (endFrame > lastFrame) { const ov = endFrame - lastFrame; startFrame = Math.max(0, startFrame - ov); endFrame = lastFrame; }
  return clampRangeToTimeline({ ...range, startFrame, endFrame }, totalFrames);
}

export function trimStart(range: LayerRange, deltaFrames: number, totalFrames: number): LayerRange {
  const lastFrame = Math.max(0, totalFrames - 1);
  const startFrame = clamp(range.startFrame + deltaFrames, 0, range.endFrame);
  return clampRangeToTimeline({ ...range, startFrame: clamp(startFrame, 0, lastFrame) }, totalFrames);
}

export function trimEnd(range: LayerRange, deltaFrames: number, totalFrames: number): LayerRange {
  const lastFrame = Math.max(0, totalFrames - 1);
  const endFrame = clamp(range.endFrame + deltaFrames, range.startFrame, lastFrame);
  return clampRangeToTimeline({ ...range, endFrame }, totalFrames);
}

function buildKeyframeFromLayer(layer: Layer, frame: number): LayerKeyframe {
  return { frame, opacity01: layer.opacity / 100, intensity: layer.settings.intensity };
}

/** Format frame count as SMPTE-style timecode HH:MM:SS:FF */
function frameToTimecode(frame: number, fps: number): string {
  const f = Math.max(0, Math.round(frame));
  const safeFps = Math.max(1, Math.round(fps));
  const totalSecs = Math.floor(f / safeFps);
  const ff = f % safeFps;
  const ss = totalSecs % 60;
  const mm = Math.floor(totalSecs / 60) % 60;
  const hh = Math.floor(totalSecs / 3600);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}:${String(ff).padStart(2, "0")}`;
}

// ─── Ruler tick marks ─────────────────────────────────────────────────────────

function buildRulerTicks(totalFrames: number, fps: number, widthPx: number) {
  const safeFps = Math.max(1, fps);
  const ticks: { x: number; label: string; major: boolean }[] = [];

  // Choose tick interval based on zoom level
  const secondsVisible = widthPx / PX_PER_SEC;
  let tickIntervalSecs = 1;
  if (secondsVisible > 60) tickIntervalSecs = 10;
  else if (secondsVisible > 30) tickIntervalSecs = 5;
  else if (secondsVisible > 10) tickIntervalSecs = 2;

  const totalSecs = totalFrames / safeFps;
  for (let s = 0; s <= totalSecs; s += tickIntervalSecs) {
    const x = s * PX_PER_SEC;
    const major = s % (tickIntervalSecs * 5) === 0;
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    const label = mm > 0 ? `${mm}:${String(ss).padStart(2, "0")}` : `${ss}s`;
    ticks.push({ x, label, major });
  }
  return ticks;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const VideoTimelineTracks = ({
  layers,
  tracks,
  totalFrames,
  videoFps,
  playheadFrame,
  videoInFrame,
  videoOutFrame,
  onSetPlayhead,
  onUpdateTrack,
  onSelectTrackLayer,
  activeLayerId,
  onSelectBlock,
  selectedBlockLayerId,
  selectedBlockRangeIndex,
  ghostFrameUrl,
  ghostFrameX,
  ghostFrameY,
  onDragStart,
  onDragMove,
  onDragEnd,
}: VideoTimelineTracksProps) => {
  const safeTotalFrames = Math.max(1, totalFrames);
  const safeFps = Math.max(1, videoFps);
  const lastFrame = safeTotalFrames - 1;
  const timelineWidthPx = Math.max(PX_PER_SEC * 4, frameToPx(safeTotalFrames, safeFps));

  const trackMap = useMemo(() => new Map(tracks.map((t) => [t.layerId, t])), [tracks]);
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragSessionRef = useRef<DragSession | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { dragSessionRef.current = dragSession; }, [dragSession]);

  const previewTracks = useMemo(() => {
    if (!dragSession) return tracks;
    return tracks.map((track) => {
      if (track.layerId !== dragSession.layerId) return track;
      return {
        ...track,
        ranges: track.ranges.map((range, index) =>
          index === dragSession.rangeIndex ? cloneRange(dragSession.currentRange) : cloneRange(range),
        ),
      };
    });
  }, [dragSession, tracks]);

  const previewTrackMap = useMemo(
    () => new Map(previewTracks.map((t) => [t.layerId, t])),
    [previewTracks],
  );

  const rulerTicks = useMemo(
    () => buildRulerTicks(safeTotalFrames, safeFps, timelineWidthPx),
    [safeTotalFrames, safeFps, timelineWidthPx],
  );

  // ── Drag logic ──────────────────────────────────────────────────────────────

  const beginDrag = (
    layerId: string,
    rangeIndex: number,
    mode: DragMode,
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const track = trackMap.get(layerId);
    const originRange = track?.ranges[rangeIndex];
    if (!originRange) return;

    onSelectBlock?.(layerId, rangeIndex);
    onSelectTrackLayer?.(layerId);

    const nextSession: DragSession = {
      layerId, rangeIndex, mode,
      startClientX: event.clientX,
      originRange: clampRangeToTimeline(originRange, safeTotalFrames),
      currentRange: clampRangeToTimeline(originRange, safeTotalFrames),
    };
    dragSessionRef.current = nextSession;
    setDragSession(nextSession);
    setIsDragging(true);
    onDragStart?.(layerId, rangeIndex, clampRangeToTimeline(originRange, safeTotalFrames).startFrame, mode);
  };

  // ── Rail click → set playhead ───────────────────────────────────────────────

  const handleRulerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const targetFrame = clamp(pxDeltaToFrames(event.clientX - rect.left, safeFps), 0, lastFrame);
    onSetPlayhead(targetFrame);
  };

  const handleRailClick = (layerId: string, event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const targetFrame = clamp(pxDeltaToFrames(event.clientX - rect.left, safeFps), 0, lastFrame);

    if (event.shiftKey) {
      const track = previewTrackMap.get(layerId) ?? { layerId, ranges: [], keyframes: [] };
      if (track.keyframes.some((kf) => kf.frame === targetFrame)) return;
      const targetLayer = layers.find((l) => l.id === layerId);
      if (!targetLayer) return;
      onUpdateTrack({
        ...track,
        keyframes: [...track.keyframes, buildKeyframeFromLayer(targetLayer, targetFrame)].sort((a, b) => a.frame - b.frame),
      });
      return;
    }
    onSetPlayhead(targetFrame);
  };

  const removeKeyframe = (layerId: string, frame: number, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const track = previewTrackMap.get(layerId);
    if (!track) return;
    onUpdateTrack({ ...track, keyframes: track.keyframes.filter((kf) => kf.frame !== frame) });
  };

  // ── Mouse/keyboard handlers ─────────────────────────────────────────────────

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      const current = dragSessionRef.current;
      if (!current) return;
      const deltaFrames = pxDeltaToFrames(event.clientX - current.startClientX, safeFps);
      let nextRange: LayerRange;
      switch (current.mode) {
        case "move": nextRange = moveRange(current.originRange, deltaFrames, safeTotalFrames); break;
        case "trim-start":
          nextRange = trimStart(current.originRange, deltaFrames, safeTotalFrames);
          onSetPlayhead(nextRange.startFrame);
          break;
        default:
          nextRange = trimEnd(current.originRange, deltaFrames, safeTotalFrames);
          onSetPlayhead(nextRange.endFrame);
      }
      dragSessionRef.current = { ...current, currentRange: nextRange };
      setDragSession((prev) => prev ? { ...prev, currentRange: nextRange } : prev);
      onDragMove?.(nextRange, current.mode, event.clientX, event.clientY);
    };

    const handleMouseUp = () => {
      const current = dragSessionRef.current;
      if (current) {
        const track = trackMap.get(current.layerId);
        if (track) {
          onUpdateTrack({
            ...track,
            ranges: track.ranges.map((r, i) =>
              i === current.rangeIndex ? cloneRange(current.currentRange) : cloneRange(r),
            ),
          });
        }
      }
      dragSessionRef.current = null;
      setDragSession(null);
      setIsDragging(false);
      onDragEnd?.();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const current = dragSessionRef.current;
      if (!current) return;
      dragSessionRef.current = { ...current, currentRange: cloneRange(current.originRange) };
      setDragSession(null);
      setIsDragging(false);
      onDragEnd?.();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDragging, onSetPlayhead, onUpdateTrack, safeFps, safeTotalFrames, trackMap, onDragMove, onDragEnd]);

  // ── Playhead x position ─────────────────────────────────────────────────────
  const playheadX = frameToPx(clamp(playheadFrame, 0, lastFrame), safeFps);
  const inX = videoInFrame !== null ? frameToPx(videoInFrame, safeFps) : null;
  const outX = videoOutFrame !== null ? frameToPx(videoOutFrame, safeFps) : null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col bg-[#1a1a1a] border border-black select-none"
      style={{ fontFamily: "var(--app-font-mono)", fontSize: 10 }}
    >
      {/* ── Scrollable area ── */}
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-auto win98-scroll"
        style={{ maxHeight: 260 }}
      >
        <div style={{ minWidth: LABEL_WIDTH_PX + timelineWidthPx, position: "relative" }}>

          {/* ── Ruler row ── */}
          <div className="flex sticky top-0 z-20" style={{ height: RULER_HEIGHT_PX }}>
            {/* Label gutter */}
            <div
              className="shrink-0 flex items-end pb-1 px-2 bg-[#111] border-r border-[#333]"
              style={{ width: LABEL_WIDTH_PX }}
            >
              <span className="text-[#888] uppercase tracking-widest" style={{ fontSize: 9 }}>Tracks</span>
            </div>

            {/* Ruler */}
            <div
              className="relative flex-1 bg-[#111] border-b border-[#333] cursor-pointer"
              style={{ minWidth: timelineWidthPx }}
              onClick={handleRulerClick}
            >
              {rulerTicks.map((tick) => (
                <div
                  key={tick.x}
                  className="absolute top-0 bottom-0 flex flex-col justify-end"
                  style={{ left: tick.x }}
                >
                  <div
                    className={tick.major ? "bg-[#555]" : "bg-[#333]"}
                    style={{ width: 1, height: tick.major ? 10 : 5 }}
                  />
                  {tick.major && (
                    <span
                      className="absolute text-[#666]"
                      style={{ fontSize: 9, top: 2, left: 3, whiteSpace: "nowrap" }}
                    >
                      {tick.label}
                    </span>
                  )}
                </div>
              ))}

              {/* In/Out region highlight */}
              {inX !== null && outX !== null && (
                <div
                  className="absolute top-0 bottom-0 bg-[#1a3a5c]/60 border-x border-[#4a90d9]/50"
                  style={{ left: inX, width: Math.max(0, outX - inX) }}
                />
              )}
              {inX !== null && (
                <div className="absolute top-0 bottom-0 w-px bg-[#4a90d9]" style={{ left: inX }}>
                  <span className="absolute top-1 left-1 text-[#4a90d9]" style={{ fontSize: 8 }}>I</span>
                </div>
              )}
              {outX !== null && (
                <div className="absolute top-0 bottom-0 w-px bg-[#4a90d9]" style={{ left: outX }}>
                  <span className="absolute top-1 left-1 text-[#4a90d9]" style={{ fontSize: 8 }}>O</span>
                </div>
              )}

              {/* Playhead on ruler */}
              <div
                className="absolute top-0 bottom-0 z-30 pointer-events-none"
                style={{ left: playheadX }}
              >
                {/* Triangle head */}
                <div
                  className="absolute"
                  style={{
                    top: 0,
                    left: -5,
                    width: 0,
                    height: 0,
                    borderLeft: "5px solid transparent",
                    borderRight: "5px solid transparent",
                    borderTop: "8px solid #e8e800",
                  }}
                />
                <div className="absolute top-0 bottom-0 w-px bg-[#e8e800]" style={{ left: 4 }} />
              </div>
            </div>
          </div>

          {/* ── Track rows ── */}
          {layers.map((layer, layerIndex) => {
            const track = previewTrackMap.get(layer.id);
            const isActive = layer.id === activeLayerId;

            return (
              <div
                key={layer.id}
                className="flex"
                style={{ height: TRACK_HEIGHT_PX }}
              >
                {/* Label */}
                <div
                  className={`shrink-0 flex items-center px-2 gap-1 border-r border-b cursor-pointer transition-colors ${
                    isActive
                      ? "bg-[#1e3a5f] border-[#4a90d9]/40 text-[#a8d4ff]"
                      : "bg-[#1a1a1a] border-[#2a2a2a] text-[#888] hover:bg-[#222] hover:text-[#aaa]"
                  }`}
                  style={{ width: LABEL_WIDTH_PX }}
                  onClick={() => onSelectTrackLayer?.(layer.id)}
                  title={layer.name}
                >
                  {/* Color swatch */}
                  <div
                    className="shrink-0 rounded-sm"
                    style={{
                      width: 8,
                      height: 8,
                      background: TRACK_COLORS[layerIndex % TRACK_COLORS.length],
                    }}
                  />
                  <span className="truncate" style={{ fontSize: 10 }}>
                    {layer.name}
                  </span>
                </div>

                {/* Rail */}
                <div
                  className="relative flex-1 border-b border-[#2a2a2a] cursor-crosshair"
                  style={{
                    minWidth: timelineWidthPx,
                    background: isActive ? "#1a2535" : "#161616",
                  }}
                  onClick={(e) => handleRailClick(layer.id, e)}
                >
                  {/* Subtle grid lines */}
                  {rulerTicks.filter((t) => t.major).map((tick) => (
                    <div
                      key={tick.x}
                      className="absolute top-0 bottom-0 pointer-events-none"
                      style={{ left: tick.x, width: 1, background: "#222" }}
                    />
                  ))}

                  {/* In/Out region tint */}
                  {inX !== null && outX !== null && (
                    <div
                      className="absolute top-0 bottom-0 pointer-events-none"
                      style={{ left: inX, width: Math.max(0, outX - inX), background: "rgba(74,144,217,0.04)" }}
                    />
                  )}

                  {/* Blocks */}
                  {track?.ranges.map((range, index) => {
                    const isDraggingRange = dragSession?.layerId === layer.id && dragSession.rangeIndex === index;
                    const isSelected = selectedBlockLayerId === layer.id && selectedBlockRangeIndex === index;
                    const currentRange = isDraggingRange ? dragSession.currentRange : range;
                    const blockX = frameToPx(currentRange.startFrame, safeFps);
                    const blockW = Math.max(4, frameToPx(currentRange.endFrame - currentRange.startFrame + 1, safeFps));
                    const color = TRACK_COLORS[layerIndex % TRACK_COLORS.length];
                    const isDisabled = currentRange.enabled === false;

                    return (
                      <div
                        key={`${layer.id}-${index}`}
                        className="absolute top-[3px] bottom-[3px] rounded-sm cursor-grab active:cursor-grabbing"
                        style={{
                          left: blockX,
                          width: blockW,
                          background: isDisabled
                            ? "#333"
                            : isDraggingRange
                              ? `${color}cc`
                              : `${color}99`,
                          border: isSelected
                            ? `1px solid ${color}`
                            : isDraggingRange
                              ? `1px solid ${color}dd`
                              : `1px solid ${color}55`,
                          boxShadow: isSelected ? `0 0 0 1px ${color}88` : undefined,
                          opacity: isDisabled ? 0.4 : 1,
                        }}
                        onMouseDown={(e) => beginDrag(layer.id, index, "move", e)}
                        title={`${layer.name} • ${currentRange.startFrame}–${currentRange.endFrame}`}
                      >
                        {/* Block label */}
                        {blockW > 40 && (
                          <span
                            className="absolute inset-0 flex items-center px-2 pointer-events-none truncate text-white/70"
                            style={{ fontSize: 9 }}
                          >
                            {currentRange.startFrame}–{currentRange.endFrame}
                          </span>
                        )}

                        {/* Trim handles */}
                        <div
                          className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/20 rounded-l-sm"
                          onMouseDown={(e) => beginDrag(layer.id, index, "trim-start", e)}
                          title="Trim start"
                        >
                          <div className="absolute left-[3px] top-[4px] bottom-[4px] w-px bg-white/40" />
                        </div>
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/20 rounded-r-sm"
                          onMouseDown={(e) => beginDrag(layer.id, index, "trim-end", e)}
                          title="Trim end"
                        >
                          <div className="absolute right-[3px] top-[4px] bottom-[4px] w-px bg-white/40" />
                        </div>
                      </div>
                    );
                  })}

                  {/* Keyframe diamonds */}
                  {track?.keyframes.map((kf) => (
                    <div
                      key={`${layer.id}-kf-${kf.frame}`}
                      className="absolute z-10 cursor-pointer hover:scale-125 transition-transform"
                      style={{
                        left: frameToPx(kf.frame, safeFps) - 4,
                        top: "50%",
                        transform: "translateY(-50%) rotate(45deg)",
                        width: 8,
                        height: 8,
                        background: "#f0c040",
                        border: "1px solid #a08020",
                      }}
                      title={`Keyframe @ ${kf.frame} (right-click to remove)`}
                      onContextMenu={(e) => removeKeyframe(layer.id, kf.frame, e)}
                    />
                  ))}

                  {/* Playhead line through track */}
                  <div
                    className="absolute top-0 bottom-0 w-px pointer-events-none z-10"
                    style={{ left: playheadX, background: "rgba(232,232,0,0.4)" }}
                  />
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {layers.length === 0 && (
            <div
              className="flex items-center justify-center text-[#444]"
              style={{ height: TRACK_HEIGHT_PX * 2, fontSize: 11 }}
            >
              No layers — add a layer to create tracks
            </div>
          )}

          {/* Ghost frame overlay */}
          {ghostFrameUrl && (
            <img
              src={ghostFrameUrl}
              alt=""
              style={{
                opacity: 0.55,
                pointerEvents: "none",
                position: "absolute",
                left: ghostFrameX,
                top: ghostFrameY,
                border: "1px solid rgba(232,232,0,0.6)",
                borderRadius: 2,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Track colour palette (editor-style) ─────────────────────────────────────

const TRACK_COLORS = [
  "#4a90d9", // blue
  "#7ed321", // green
  "#f5a623", // orange
  "#d0021b", // red
  "#9b59b6", // purple
  "#1abc9c", // teal
  "#e91e63", // pink
  "#ff9800", // amber
  "#00bcd4", // cyan
  "#8bc34a", // light green
];
