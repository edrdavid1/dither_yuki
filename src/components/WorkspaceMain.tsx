import { AnimationTimelinePanel } from "@/components/AnimationTimelinePanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import type { AnimationFrame } from "@/types/animationFrame";
import type { WorkspaceMode } from "@/components/WorkspaceModeSwitcher";

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
  showOriginal: boolean;
  setShowOriginal: (value: boolean) => void;

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
  workflowBusy: boolean;
  videoSource: unknown | null;
  canRenderVideo: boolean;
  videoRenderBlockedReason?: string;
  videoPreviewBusy: boolean;
  videoMetadata: { fps: number; duration_seconds: number } | null;
  onRunVideoWorkflow: () => void;
}

export const WorkspaceMain = ({
  focusMode,
  workspaceMode,
  originalImage,
  processedImage,
  showOriginal,
  setShowOriginal,
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
  workflowBusy,
  videoSource,
  canRenderVideo,
  videoRenderBlockedReason,
  videoPreviewBusy,
  videoMetadata,
  onRunVideoWorkflow,
}: WorkspaceMainProps) => {
  return (
    <main className="min-h-0 overflow-hidden flex flex-col gap-2">
      <PreviewPanel
        originalImage={originalImage}
        processedImage={processedImage}
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
        <div className="win98-card flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="win98-badge font-mono text-[11px]">{videoPreviewFrames.length} samples</span>
            <button
              type="button"
              className="win95-button px-2 py-0.5 text-xs"
              onClick={onRunVideoWorkflow}
              disabled={workflowBusy || !videoSource || !canRenderVideo}
              title={!canRenderVideo ? videoRenderBlockedReason : undefined}
            >
              {workflowBusy ? "Rendering..." : "Render Video"}
            </button>
            <span className="win95-border-inset px-2 py-0.5 text-[10px] text-muted-foreground">
              {videoPreviewBusy
                ? "Building preview timeline..."
                : videoMetadata
                  ? `${videoMetadata.fps.toFixed(2)} FPS • ${videoMetadata.duration_seconds.toFixed(1)}s`
                  : "Preview timeline"}
            </span>
          </div>
          {videoPreviewFrames.length > 0 ? (
            <div className="flex gap-1 overflow-x-auto win98-scroll pb-1">
              {videoPreviewFrames.map((frame, index) => (
                <button
                  key={frame.id}
                  type="button"
                  onClick={() => setSelectedVideoPreviewFrame(index)}
                  className={`relative flex-shrink-0 win95-border p-0.5 ${selectedVideoPreviewFrame === index ? "bg-primary/20 ring-2 ring-primary" : "bg-card"}`}
                  title={`Frame sample ${index + 1} • ${frame.label}`}
                >
                  <img src={frame.src} alt={`Video sample ${index + 1}`} className="h-10 w-14 object-cover" />
                  <div className={`mt-0.5 px-1 text-[9px] font-bold leading-none ${selectedVideoPreviewFrame === index ? "text-primary" : "text-muted-foreground"}`}>
                    {frame.label}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="win95-border-inset px-2 py-2 text-[11px] text-muted-foreground">
              {videoPreviewBusy
                ? "Sampling video frames for preview..."
                : videoSource
                  ? "No video preview frames yet"
                  : "Open a video to populate the timeline strip"}
            </div>
          )}
        </div>
      )}
    </main>
  );
};

