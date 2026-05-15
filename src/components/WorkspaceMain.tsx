import { AnimationTimelinePanel } from "@/components/AnimationTimelinePanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import { VideoPreviewCanvas } from "@/components/VideoPreviewCanvas";
import { VideoRenderQueuePanel } from "@/components/VideoRenderQueuePanel";
import { VideoTimelineTracks } from "./VideoTimelineTracks";
import { TrackBlockInspector } from "./TrackBlockInspector";
import type { AnimationFrame } from "@/types/animationFrame";
import type { WorkspaceMode } from "@/components/WorkspaceModeSwitcher";
import type { RenderJob } from "@/hooks/useVideoRenderQueue";
import type { Layer } from "@/types/layers";
import type { LayerRange, LayerTrack } from "@/lib/videoRuntime/layerTracks";
import { useVideoPlaybackStore } from "@/store/videoPlaybackStore";
import { useGhostFrame } from "@/hooks/useGhostFrame";
import { useCallback, useRef, useState } from "react";
import React from "react";
import { useShallow } from "zustand/react/shallow";

interface VideoPreviewFrame {
  id: string;
  src: string;
  label: string;
}

interface WorkspaceMainProps {
  focusMode: boolean;
  workspaceMode: WorkspaceMode;

  originalImage: HTMLImageElement | null;
  processedImage: HTMLImageElement | null;
  originalRgba?: { width: number; height: number; rgba: Uint8ClampedArray } | null;
  processedRgba?: { width: number; height: number; rgba: Uint8ClampedArray } | null;
  processingMs?: number | null;
  showOriginal: boolean;
  setShowOriginal: (value: boolean) => void;

  layers: Layer[];
  activeLayerId: string | null;
  videoLayerTracks: LayerTrack[];
  onUpdateVideoLayerTrack: (track: LayerTrack) => void;

  frames: AnimationFrame[];
  selectedFrameIndex: number;
  selectedFrameIds: Set<string>;
  isPlaying: boolean;
  workflowStatus?: string;
  animationPreviewFps: number;
  setAnimationPreviewFps: (value: number) => void;
  animationPreviewSpeed: number;
  setAnimationPreviewSpeed: (value: number) => void;

  onFileDrop: (file: File) => void;
  onSelectFrame: (index: number) => void;
  onMultiSelectFrame: (frameId: string, addToSelection: boolean) => void;
  onToggleAnimationPlayback: () => void;
  onAddFrame: () => void;
  onImportFrame: () => void;
  onDeleteSelectedFrame: () => void;
  onApplyToSelected?: () => void;
  onRenderAnimation: () => Promise<void>;

  videoPreviewFrames: VideoPreviewFrame[];
  selectedVideoPreviewFrame: number;
  setSelectedVideoPreviewFrame: (index: number) => void;
  videoPlayheadFrameIndex: number;
  setVideoPlayheadFrameIndex: (value: number) => void;
  videoTotalFrames: number;
  videoFps: number;
  videoPlaying: boolean;
  onToggleVideoPlayback: () => void;
  videoLoopEnabled: boolean;
  setVideoLoopEnabled: (value: boolean) => void;
  videoInFrame: number;
  setVideoInFrame: (value: number | null) => void;
  videoOutFrame: number;
  setVideoOutFrame: (value: number | null) => void;
  workflowBusy: boolean;
  videoSource: unknown | null;
  canRenderVideo: boolean;
  videoRenderBlockedReason?: string;
  videoPreviewBusy: boolean;
  videoMetadata: { fps: number; duration_seconds: number; width?: number; height?: number } | null;
  onRunVideoWorkflow: () => void;
  onTrackActiveLayerForVideo?: () => void;
  onSelectVideoTrackLayer?: (layerId: string) => void;
  activeLayerLabel?: string;
  onSelectBlock?: (layerId: string, rangeIndex: number) => void;
  selectedBlockLayerId?: string | null;
  selectedBlockRangeIndex?: number | null;
  // Render queue props
  renderJobs?: RenderJob[];
  activeRenderJobId?: string | null;
  onSelectRenderJob?: (jobId: string) => void;
  onCancelRenderJob?: (jobId: string) => void;
  onClearCompletedRenderJobs?: () => void;
  // Ghost frame context
  videoId?: string | null;
  videoInputPath?: string | null;
  videoWidth?: number;
  videoHeight?: number;
  layerPayload?: unknown[];
  layerTracks?: unknown[];
  // Video preview canvas props
  videoProcessingBackend?: "cpu" | "gpu";
}

export const WorkspaceMain = ({
  focusMode,
  workspaceMode,
  originalImage,
  processedImage,
  originalRgba = null,
  processedRgba = null,
  processingMs = null,
  showOriginal,
  setShowOriginal,
  layers,
  activeLayerId,
  videoLayerTracks,
  onUpdateVideoLayerTrack,
  frames,
  selectedFrameIndex,
  selectedFrameIds,
  isPlaying,
  workflowStatus,
  animationPreviewFps,
  setAnimationPreviewFps,
  animationPreviewSpeed,
  setAnimationPreviewSpeed,
  onFileDrop,
  onSelectFrame,
  onMultiSelectFrame,
  onToggleAnimationPlayback,
  onAddFrame,
  onImportFrame,
  onDeleteSelectedFrame,
  onApplyToSelected,
  onRenderAnimation,
  videoPreviewFrames,
  selectedVideoPreviewFrame,
  setSelectedVideoPreviewFrame,
  videoPlayheadFrameIndex,
  setVideoPlayheadFrameIndex,
  videoTotalFrames,
  videoFps,
  videoPlaying,
  onToggleVideoPlayback,
  videoLoopEnabled,
  setVideoLoopEnabled,
  videoInFrame,
  setVideoInFrame,
  videoOutFrame,
  setVideoOutFrame,
  workflowBusy,
  videoSource,
  canRenderVideo,
  videoRenderBlockedReason,
  videoPreviewBusy,
  videoMetadata,
  onRunVideoWorkflow,
  onTrackActiveLayerForVideo,
  onSelectVideoTrackLayer,
  activeLayerLabel,
  onSelectBlock,
  // Render queue
  renderJobs = [],
  activeRenderJobId,
  onSelectRenderJob,
  onCancelRenderJob,
  onClearCompletedRenderJobs,
  // Ghost frame context
  videoId = null,
  videoInputPath = null,
  videoWidth = 0,
  videoHeight = 0,
  layerPayload = [],
  layerTracks = [],
  videoProcessingBackend = "cpu",
}: WorkspaceMainProps) => {
  const videoTimeSeconds = videoPlayheadFrameIndex / Math.max(1, videoFps);
  const { selectedBlockLayerId, selectedBlockRangeIndex, setSelectedBlock, ghostFrameEnabled } = useVideoPlaybackStore(
    useShallow((state) => ({
      selectedBlockLayerId: state.selectedBlockLayerId,
      selectedBlockRangeIndex: state.selectedBlockRangeIndex,
      setSelectedBlock: state.setSelectedBlock,
      ghostFrameEnabled: state.ghostFrameEnabled,
    })),
  );

  const handleSelectBlock = (layerId: string, rangeIndex: number) => {
    setSelectedBlock(layerId, rangeIndex);
    onSelectBlock?.(layerId, rangeIndex);
  };

  // Ghost frame cursor tracking
  const [ghostFrameX, setGhostFrameX] = useState<number>(0);
  const [ghostFrameY, setGhostFrameY] = useState<number>(0);
  const ghostFrameContainerRef = useRef<HTMLDivElement>(null);

  const { ghostFrameUrl, requestGhostFrame, clearGhostFrame } = useGhostFrame({
    enabled: ghostFrameEnabled && workspaceMode === "video",
    videoId,
    inputPath: videoInputPath,
    fps: videoFps,
    width: videoWidth,
    height: videoHeight,
    layerPayload,
    layerTracks,
  });

  const handleDragStart = useCallback(
    (_layerId: string, _rangeIndex: number, startFrame: number, _mode: "move" | "trim-start" | "trim-end") => {
      requestGhostFrame(startFrame);
    },
    [requestGhostFrame],
  );

  const handleDragMove = useCallback(
    (currentRange: LayerRange, mode: "move" | "trim-start" | "trim-end", cursorX: number, cursorY: number) => {
      const frameIndex = mode === "trim-end" ? currentRange.endFrame : currentRange.startFrame;
      requestGhostFrame(frameIndex);

      // Convert cursor position to be relative to the container
      if (ghostFrameContainerRef.current) {
        const rect = ghostFrameContainerRef.current.getBoundingClientRect();
        setGhostFrameX(cursorX - rect.left);
        setGhostFrameY(cursorY - rect.top);
      }
    },
    [requestGhostFrame],
  );

  const handleDragEnd = useCallback(() => {
    clearGhostFrame();
  }, [clearGhostFrame]);

  return (
    <main className="min-h-0 overflow-hidden flex flex-col gap-2">
      {workspaceMode === "video" ? (
        <VideoPreviewCanvas
          enabled={workspaceMode === "video" && Boolean(videoSource)}
          videoSource={videoSource as File | null}
          videoId={videoId}
          videoMetadata={videoMetadata}
          videoPlayheadFrameIndex={videoPlayheadFrameIndex}
          videoPlaying={videoPlaying}
          videoFps={videoFps}
          layerPayload={layerPayload}
          layerTracks={videoLayerTracks}
          processingBackend={videoProcessingBackend}
          showOriginal={showOriginal}
          originalRgba={originalRgba ?? undefined}
        />
      ) : (
        <PreviewPanel
          originalImage={originalImage}
          processedImage={processedImage}
          originalRgba={originalRgba}
          processedRgba={processedRgba}
          processingMs={processingMs}
          showOriginal={showOriginal}
          setShowOriginal={setShowOriginal}
          isAnimationMode={workspaceMode === "animation"}
          canAnimate={frames.length > 1}
          animationPlaying={isPlaying}
          onToggleAnimationPlayback={onToggleAnimationPlayback}
          animationFps={animationPreviewFps}
          onAnimationFpsChange={setAnimationPreviewFps}
          animationSpeed={animationPreviewSpeed}
          onAnimationSpeedChange={setAnimationPreviewSpeed}
          onFileDrop={onFileDrop}
        />
      )}

      {!focusMode && workspaceMode === "animation" && (
        <div className="shrink-0">
          <AnimationTimelinePanel
            frames={frames}
            selectedFrameIndex={selectedFrameIndex}
            onSelectFrame={onSelectFrame}
            isPlaying={isPlaying}
            onTogglePlayback={onToggleAnimationPlayback}
            workflowStatus={workflowStatus}
            onAddFrame={onAddFrame}
            onImportFrame={onImportFrame}
            onDeleteFrame={onDeleteSelectedFrame}
            onRender={onRenderAnimation}
            canDeleteFrame={frames.length > 1}
            canRunFrameActions={frames.length > 0}
            selectedFrameIds={selectedFrameIds}
            onMultiSelect={onMultiSelectFrame}
            onApplyToSelected={onApplyToSelected}
          />
        </div>
      )}

      {!focusMode && workspaceMode === "video" && (
        <VideoWorkspacePanel
          videoSource={videoSource}
          videoMetadata={videoMetadata}
          videoPlaying={videoPlaying}
          videoLoopEnabled={videoLoopEnabled}
          setVideoLoopEnabled={setVideoLoopEnabled}
          videoPlayheadFrameIndex={videoPlayheadFrameIndex}
          setVideoPlayheadFrameIndex={setVideoPlayheadFrameIndex}
          videoTotalFrames={videoTotalFrames}
          videoFps={videoFps}
          videoInFrame={videoInFrame}
          setVideoInFrame={setVideoInFrame}
          videoOutFrame={videoOutFrame}
          setVideoOutFrame={setVideoOutFrame}
          videoPreviewBusy={videoPreviewBusy}
          videoPreviewFrames={videoPreviewFrames}
          selectedVideoPreviewFrame={selectedVideoPreviewFrame}
          setSelectedVideoPreviewFrame={setSelectedVideoPreviewFrame}
          workflowBusy={workflowBusy}
          canRenderVideo={canRenderVideo}
          videoRenderBlockedReason={videoRenderBlockedReason}
          onToggleVideoPlayback={onToggleVideoPlayback}
          onRunVideoWorkflow={onRunVideoWorkflow}
          onTrackActiveLayerForVideo={onTrackActiveLayerForVideo}
          activeLayerLabel={activeLayerLabel}
          layers={layers}
          activeLayerId={activeLayerId}
          videoLayerTracks={videoLayerTracks}
          onUpdateVideoLayerTrack={onUpdateVideoLayerTrack}
          onSelectVideoTrackLayer={onSelectVideoTrackLayer}
          selectedBlockLayerId={selectedBlockLayerId}
          selectedBlockRangeIndex={selectedBlockRangeIndex}
          handleSelectBlock={handleSelectBlock}
          ghostFrameUrl={ghostFrameUrl}
          ghostFrameX={ghostFrameX}
          ghostFrameY={ghostFrameY}
          ghostFrameContainerRef={ghostFrameContainerRef}
          handleDragStart={handleDragStart}
          handleDragMove={handleDragMove}
          handleDragEnd={handleDragEnd}
          renderJobs={renderJobs}
          activeRenderJobId={activeRenderJobId}
          onSelectRenderJob={onSelectRenderJob}
          onCancelRenderJob={onCancelRenderJob}
          onClearCompletedRenderJobs={onClearCompletedRenderJobs}
        />
      )}
    </main>
  );
};


// ─── VideoWorkspacePanel ──────────────────────────────────────────────────────
// NLE-style video editor panel: transport bar + timeline + inspector.
// Retains the win95/win98 border aesthetic while adopting modern editor UX.

interface VideoWorkspacePanelProps {
  videoSource: unknown | null;
  videoMetadata: { fps: number; duration_seconds: number; width?: number; height?: number } | null;
  videoPlaying: boolean;
  videoLoopEnabled: boolean;
  setVideoLoopEnabled: (v: boolean) => void;
  videoPlayheadFrameIndex: number;
  setVideoPlayheadFrameIndex: (v: number) => void;
  videoTotalFrames: number;
  videoFps: number;
  videoInFrame: number | null;
  setVideoInFrame: (v: number | null) => void;
  videoOutFrame: number | null;
  setVideoOutFrame: (v: number | null) => void;
  videoPreviewBusy: boolean;
  videoPreviewFrames: { id: string; src: string; label: string }[];
  selectedVideoPreviewFrame: number;
  setSelectedVideoPreviewFrame: (v: number) => void;
  workflowBusy: boolean;
  canRenderVideo: boolean;
  videoRenderBlockedReason?: string;
  onToggleVideoPlayback: () => void;
  onRunVideoWorkflow: () => void;
  onTrackActiveLayerForVideo?: () => void;
  activeLayerLabel?: string;
  layers: Layer[];
  activeLayerId: string | null;
  videoLayerTracks: LayerTrack[];
  onUpdateVideoLayerTrack: (track: LayerTrack) => void;
  onSelectVideoTrackLayer?: (layerId: string) => void;
  selectedBlockLayerId: string | null;
  selectedBlockRangeIndex: number | null;
  handleSelectBlock: (layerId: string, rangeIndex: number) => void;
  ghostFrameUrl: string | null;
  ghostFrameX: number;
  ghostFrameY: number;
  ghostFrameContainerRef: React.RefObject<HTMLDivElement>;
  handleDragStart: (layerId: string, rangeIndex: number, startFrame: number, mode: "move" | "trim-start" | "trim-end") => void;
  handleDragMove: (currentRange: LayerRange, mode: "move" | "trim-start" | "trim-end", cursorX: number, cursorY: number) => void;
  handleDragEnd: () => void;
  renderJobs?: RenderJob[];
  activeRenderJobId?: string | null;
  onSelectRenderJob?: (jobId: string) => void;
  onCancelRenderJob?: (jobId: string) => void;
  onClearCompletedRenderJobs?: () => void;
}

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

const VideoWorkspacePanel = ({
  videoSource,
  videoMetadata,
  videoPlaying,
  videoLoopEnabled,
  setVideoLoopEnabled,
  videoPlayheadFrameIndex,
  setVideoPlayheadFrameIndex,
  videoTotalFrames,
  videoFps,
  videoInFrame,
  setVideoInFrame,
  videoOutFrame,
  setVideoOutFrame,
  videoPreviewBusy,
  videoPreviewFrames,
  selectedVideoPreviewFrame,
  setSelectedVideoPreviewFrame,
  workflowBusy,
  canRenderVideo,
  videoRenderBlockedReason,
  onToggleVideoPlayback,
  onRunVideoWorkflow,
  onTrackActiveLayerForVideo,
  activeLayerLabel,
  layers,
  activeLayerId,
  videoLayerTracks,
  onUpdateVideoLayerTrack,
  onSelectVideoTrackLayer,
  selectedBlockLayerId,
  selectedBlockRangeIndex,
  handleSelectBlock,
  ghostFrameUrl,
  ghostFrameX,
  ghostFrameY,
  ghostFrameContainerRef,
  handleDragStart,
  handleDragMove,
  handleDragEnd,
  renderJobs = [],
  activeRenderJobId,
  onSelectRenderJob,
  onCancelRenderJob,
  onClearCompletedRenderJobs,
}: VideoWorkspacePanelProps) => {
  const safeFps = Math.max(1, videoFps);
  const safeTotal = Math.max(1, videoTotalFrames);
  const timecode = frameToTimecode(videoPlayheadFrameIndex, safeFps);
  const totalTimecode = frameToTimecode(safeTotal - 1, safeFps);
  const [showSamples, setShowSamples] = React.useState(false);
  const [showRenderQueue, setShowRenderQueue] = React.useState(false);

  return (
    <div
      className="flex min-h-0 flex-col overflow-hidden"
      style={{
        background: "#111",
        border: "1px solid #000",
        fontFamily: "var(--app-font-mono)",
      }}
    >
      {/* ── Transport bar ── */}
      <div
        className="flex items-center gap-0 shrink-0"
        style={{ background: "#1a1a1a", borderBottom: "1px solid #2a2a2a", height: 36 }}
      >
        {/* Play/Pause */}
        <TransportButton
          onClick={onToggleVideoPlayback}
          disabled={!videoSource}
          title={videoPlaying ? "Pause (Space)" : "Play (Space)"}
          active={videoPlaying}
        >
          {videoPlaying ? (
            // Pause icon
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="2" y="1" width="3" height="10" rx="1" />
              <rect x="7" y="1" width="3" height="10" rx="1" />
            </svg>
          ) : (
            // Play icon
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <polygon points="2,1 11,6 2,11" />
            </svg>
          )}
        </TransportButton>

        {/* Go to start */}
        <TransportButton
          onClick={() => setVideoPlayheadFrameIndex(videoInFrame ?? 0)}
          disabled={!videoSource}
          title="Go to start"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="1" y="1" width="2" height="10" rx="0.5" />
            <polygon points="11,1 4,6 11,11" />
          </svg>
        </TransportButton>

        {/* Go to end */}
        <TransportButton
          onClick={() => setVideoPlayheadFrameIndex(videoOutFrame ?? safeTotal - 1)}
          disabled={!videoSource}
          title="Go to end"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="9" y="1" width="2" height="10" rx="0.5" />
            <polygon points="1,1 8,6 1,11" />
          </svg>
        </TransportButton>

        {/* Loop toggle */}
        <TransportButton
          onClick={() => setVideoLoopEnabled(!videoLoopEnabled)}
          disabled={!videoSource}
          title="Loop"
          active={videoLoopEnabled}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 4h8M8 2l2 2-2 2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 8H2M4 6l-2 2 2 2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </TransportButton>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: "#2a2a2a", margin: "0 4px" }} />

        {/* Timecode display */}
        <div
          className="flex items-center gap-1 px-3"
          style={{ background: "#0a0a0a", border: "1px solid #222", margin: "4px 0", height: 26 }}
        >
          <span style={{ color: "#e8e800", fontSize: 13, letterSpacing: "0.1em", fontVariantNumeric: "tabular-nums" }}>
            {timecode}
          </span>
          <span style={{ color: "#333", fontSize: 10 }}>/</span>
          <span style={{ color: "#555", fontSize: 10, letterSpacing: "0.05em" }}>
            {totalTimecode}
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: "#2a2a2a", margin: "0 4px" }} />

        {/* In/Out markers */}
        <TransportButton
          onClick={() => setVideoInFrame(videoPlayheadFrameIndex)}
          disabled={!videoSource}
          title={`Set In point (current: ${videoInFrame ?? "—"})`}
        >
          <span style={{ fontSize: 9, letterSpacing: "0.05em" }}>
            I{videoInFrame !== null ? ` ${videoInFrame}` : ""}
          </span>
        </TransportButton>

        <TransportButton
          onClick={() => setVideoOutFrame(videoPlayheadFrameIndex)}
          disabled={!videoSource}
          title={`Set Out point (current: ${videoOutFrame ?? "—"})`}
        >
          <span style={{ fontSize: 9, letterSpacing: "0.05em" }}>
            O{videoOutFrame !== null ? ` ${videoOutFrame}` : ""}
          </span>
        </TransportButton>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: "#2a2a2a", margin: "0 4px" }} />

        {/* Track layer */}
        <TransportButton
          onClick={onTrackActiveLayerForVideo}
          disabled={!videoSource || !onTrackActiveLayerForVideo}
          title="Create/update layer track from In/Out range"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="4" width="10" height="4" rx="1" />
            <line x1="6" y1="1" x2="6" y2="3" />
            <line x1="6" y1="9" x2="6" y2="11" />
          </svg>
          {activeLayerLabel && (
            <span style={{ fontSize: 9, marginLeft: 2 }}>{activeLayerLabel}</span>
          )}
        </TransportButton>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Metadata */}
        {videoMetadata && (
          <span style={{ color: "#555", fontSize: 9, paddingRight: 8 }}>
            {videoMetadata.fps.toFixed(2)} fps
            {videoMetadata.width ? ` · ${videoMetadata.width}×${videoMetadata.height}` : ""}
            {` · ${videoMetadata.duration_seconds.toFixed(1)}s`}
          </span>
        )}
        {videoPreviewBusy && (
          <span style={{ color: "#4a90d9", fontSize: 9, paddingRight: 8 }}>
            ⟳ building preview…
          </span>
        )}

        {/* Render */}
        <button
          type="button"
          onClick={onRunVideoWorkflow}
          disabled={workflowBusy || !videoSource || !canRenderVideo}
          title={!canRenderVideo ? videoRenderBlockedReason : "Render video"}
          style={{
            height: "100%",
            padding: "0 14px",
            background: workflowBusy ? "#1a2a1a" : "#1a3a1a",
            border: "none",
            borderLeft: "1px solid #2a2a2a",
            color: workflowBusy ? "#4a8a4a" : "#6abf6a",
            fontSize: 10,
            cursor: workflowBusy || !videoSource || !canRenderVideo ? "not-allowed" : "pointer",
            opacity: !videoSource || !canRenderVideo ? 0.4 : 1,
            fontFamily: "var(--app-font-mono)",
            letterSpacing: "0.05em",
          }}
        >
          {workflowBusy ? "⟳ Rendering…" : "▶ Render"}
        </button>
      </div>

      {/* ── Scrubber ── */}
      <div
        className="flex items-center gap-2 shrink-0 px-3"
        style={{ background: "#161616", borderBottom: "1px solid #222", height: 28 }}
      >
        <input
          type="range"
          min={0}
          max={Math.max(0, safeTotal - 1)}
          value={Math.min(Math.max(0, videoPlayheadFrameIndex), Math.max(0, safeTotal - 1))}
          onChange={(e) => setVideoPlayheadFrameIndex(Number(e.target.value) || 0)}
          style={{ flex: 1, accentColor: "#e8e800", height: 2 }}
        />
        <span style={{ color: "#555", fontSize: 9, minWidth: 60, textAlign: "right" }}>
          {videoPlayheadFrameIndex} / {safeTotal - 1}
        </span>
      </div>

      {/* ── Samples strip (collapsible) ── */}
      {videoPreviewFrames.length > 0 && (
        <div className="shrink-0" style={{ borderBottom: "1px solid #1e1e1e" }}>
          <button
            type="button"
            className="flex items-center gap-2 w-full px-3 py-1 text-left"
            style={{ background: "#161616", color: "#555", fontSize: 9 }}
            onClick={() => setShowSamples((v) => !v)}
          >
            <span style={{ color: "#333" }}>{showSamples ? "▾" : "▸"}</span>
            <span className="uppercase tracking-widest">Samples</span>
            <span style={{ color: "#333" }}>({videoPreviewFrames.length})</span>
          </button>
          {showSamples && (
            <div
              className="flex gap-1 overflow-x-auto win98-scroll px-2 pb-1 pt-0.5"
              style={{ background: "#111" }}
            >
              {videoPreviewFrames.map((frame, index) => (
                <button
                  key={frame.id}
                  type="button"
                  onClick={() => setSelectedVideoPreviewFrame(index)}
                  style={{
                    flexShrink: 0,
                    padding: 2,
                    background: selectedVideoPreviewFrame === index ? "#1e3a5f" : "#1a1a1a",
                    border: `1px solid ${selectedVideoPreviewFrame === index ? "#4a90d9" : "#2a2a2a"}`,
                    cursor: "pointer",
                  }}
                  title={`${frame.label}`}
                >
                  <img src={frame.src} alt="" style={{ width: 56, height: 36, objectFit: "cover", display: "block" }} />
                  <div style={{ fontSize: 8, color: "#666", textAlign: "center", marginTop: 1 }}>{frame.label}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Render queue (collapsible) ── */}
      {onSelectRenderJob && onCancelRenderJob && renderJobs.length > 0 && (
        <div className="shrink-0" style={{ borderBottom: "1px solid #1e1e1e" }}>
          <button
            type="button"
            className="flex items-center gap-2 w-full px-3 py-1 text-left"
            style={{ background: "#161616", color: "#555", fontSize: 9 }}
            onClick={() => setShowRenderQueue((v) => !v)}
          >
            <span style={{ color: "#333" }}>{showRenderQueue ? "▾" : "▸"}</span>
            <span className="uppercase tracking-widest">Render Queue</span>
            <span style={{ color: "#333" }}>({renderJobs.length})</span>
          </button>
          {showRenderQueue && (
            <div style={{ background: "#111", padding: "4px 8px" }}>
              <VideoRenderQueuePanel
                jobs={renderJobs}
                activeJobId={activeRenderJobId}
                onSelectJob={onSelectRenderJob}
                onCancelJob={onCancelRenderJob}
                onClearCompleted={onClearCompletedRenderJobs ?? (() => {})}
                disabled={workflowBusy}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Timeline + Inspector (side by side) ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Timeline */}
        <div className="flex-1 min-w-0 overflow-hidden" ref={ghostFrameContainerRef} style={{ position: "relative" }}>
          <VideoTimelineTracks
            layers={layers}
            tracks={videoLayerTracks}
            totalFrames={videoTotalFrames}
            videoFps={videoFps}
            playheadFrame={videoPlayheadFrameIndex}
            videoInFrame={videoInFrame}
            videoOutFrame={videoOutFrame}
            onSetPlayhead={setVideoPlayheadFrameIndex}
            onUpdateTrack={onUpdateVideoLayerTrack}
            onSelectTrackLayer={onSelectVideoTrackLayer}
            activeLayerId={activeLayerId}
            onSelectBlock={handleSelectBlock}
            selectedBlockLayerId={selectedBlockLayerId}
            selectedBlockRangeIndex={selectedBlockRangeIndex}
            ghostFrameUrl={ghostFrameUrl}
            ghostFrameX={ghostFrameX}
            ghostFrameY={ghostFrameY}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          />
        </div>

        {/* Inspector sidebar */}
        <div style={{ width: 220, borderLeft: "1px solid #1e1e1e", flexShrink: 0 }}>
          <TrackBlockInspector
            selectedLayerId={selectedBlockLayerId ?? null}
            selectedRangeIndex={selectedBlockRangeIndex ?? null}
            layers={layers}
            tracks={videoLayerTracks}
            onUpdateTrack={onUpdateVideoLayerTrack}
          />
        </div>
      </div>
    </div>
  );
};

// ─── TransportButton ──────────────────────────────────────────────────────────

function TransportButton({
  children,
  onClick,
  disabled,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        height: "100%",
        minWidth: 32,
        padding: "0 8px",
        background: active ? "#1e3a5f" : "transparent",
        border: "none",
        borderRight: "1px solid #1e1e1e",
        color: disabled ? "#333" : active ? "#a8d4ff" : "#888",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        transition: "background 0.1s, color 0.1s",
        fontFamily: "var(--app-font-mono)",
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = active ? "#254a7a" : "#222";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = active ? "#1e3a5f" : "transparent";
      }}
    >
      {children}
    </button>
  );
}
