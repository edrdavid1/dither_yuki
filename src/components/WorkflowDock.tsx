import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ICONS } from "@/components/ui/IconLibrary";
import { WorkspaceMode } from "@/components/WorkspaceModeSwitcher";
import { type VideoMetadataLike } from "@/lib/mediaWorkflow";

interface WorkflowDockProps {
  mode: WorkspaceMode;
  hasVideoSource: boolean;
  backendConnected: boolean;
  imageSize?: string;
  sourceLabel?: string;
  videoMetadata: VideoMetadataLike | null;
  activeAdjustments: number;
  algorithm: string;
  palette: string;
  isRunningWorkflow: boolean;
  workflowStatus?: string;
  jobProgressText?: string;
  jobOutputPath?: string | null;
  onRunVideoWorkflow: () => void;
  onCancelJob: () => void;
  canRenderVideo: boolean;
  videoRenderBlockedReason?: string;
}

export const WorkflowDock = ({
  mode,
  hasVideoSource,
  backendConnected,
  imageSize,
  sourceLabel,
  videoMetadata,
  activeAdjustments,
  algorithm,
  palette,
  isRunningWorkflow,
  workflowStatus,
  jobProgressText,
  jobOutputPath,
  onRunVideoWorkflow,
  onCancelJob,
  canRenderVideo,
  videoRenderBlockedReason,
}: WorkflowDockProps) => {
  const statusText = workflowStatus ?? jobProgressText ?? "Ready";
  const formatTag = mode === "video" ? "MP4" : "GIF";
  const sourceText = sourceLabel ?? imageSize ?? "No media";

  return (
    <TooltipProvider delayDuration={120}>
      <div className="win95-border-inset bg-card px-2 py-1 min-h-8 flex items-center gap-1 text-[10px] font-mono overflow-hidden">
        <div className="flex items-center gap-1 shrink-0">
          <ICONS.STATUS />
          <span className="uppercase tracking-wide">{mode}</span>
        </div>

        <div className="win98-icon-separator" aria-hidden="true" />

        <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wide">
          <ICONS.FORMAT_DOT />
          {formatTag}
        </span>

        <div className="win98-icon-separator" aria-hidden="true" />

        {mode === "video" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="win95-button win98-icon-button"
                onClick={onRunVideoWorkflow}
                disabled={isRunningWorkflow || !hasVideoSource || !canRenderVideo}
                aria-label="Process video"
                title={!canRenderVideo ? videoRenderBlockedReason : undefined}
              >
                <ICONS.PROCESS_VIDEO />
              </button>
            </TooltipTrigger>
            <TooltipContent>Process video</TooltipContent>
          </Tooltip>
        )}



        {(jobProgressText?.includes("queued") || jobProgressText?.includes("running")) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="win95-button win98-icon-button"
                onClick={onCancelJob}
                aria-label="Cancel active job"
              >
                <ICONS.PIPELINE_REMOVE />
              </button>
            </TooltipTrigger>
            <TooltipContent>Cancel active job</TooltipContent>
          </Tooltip>
        )}

        <div className="ml-auto min-w-0 truncate text-[10px] text-muted-foreground">
          {statusText} · {algorithm} · {palette} · {activeAdjustments} tweaks · {sourceText}
          {videoMetadata && mode === "video" ? ` · ${videoMetadata.width}x${videoMetadata.height} @ ${videoMetadata.fps.toFixed(2)}fps` : ""}
          {jobOutputPath ? ` · ${jobOutputPath}` : ""}
          {!backendConnected ? " · backend offline" : ""}
        </div>
      </div>
    </TooltipProvider>
  );
};
