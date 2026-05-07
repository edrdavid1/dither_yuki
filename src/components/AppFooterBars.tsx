import { StatusBar } from "@/components/StatusBar";
import { WorkflowDock } from "@/components/WorkflowDock";
import type { WorkspaceMode } from "@/components/WorkspaceModeSwitcher";
import type { VideoMetadataLike } from "@/lib/mediaWorkflow";

interface AppFooterBarsProps {
  focusMode: boolean;
  workspaceMode: WorkspaceMode;
  originalImagePresent: boolean;
  videoSourcePresent: boolean;
  backendConnected: boolean;
  imageSize?: string;
  currentSourceLabel?: string;
  videoMetadata: VideoMetadataLike | null;
  activeAdjustments: number;
  algorithm: string;
  palette: string;
  workflowBusy: boolean;
  workflowStatus?: string;
  jobProgressText?: string;
  jobOutputPath?: string | null;
  canRenderVideo: boolean;
  videoRenderBlockedReason?: string;
  status: string;

  onRunVideoWorkflow: () => void;
  onExportSvg: () => void;
  onCancelActiveJob: () => void;
}

export const AppFooterBars = ({
  focusMode,
  workspaceMode,
  originalImagePresent,
  videoSourcePresent,
  backendConnected,
  imageSize,
  currentSourceLabel,
  videoMetadata,
  activeAdjustments,
  algorithm,
  palette,
  workflowBusy,
  workflowStatus,
  jobProgressText,
  jobOutputPath,
  canRenderVideo,
  videoRenderBlockedReason,
  status,
  onRunVideoWorkflow,
  onExportSvg,
  onCancelActiveJob,
}: AppFooterBarsProps) => {
  if (focusMode) return null;

  return (
    <>
      <WorkflowDock
        mode={workspaceMode}
        hasImage={originalImagePresent}
        hasVideoSource={videoSourcePresent}
        backendConnected={backendConnected}
        imageSize={imageSize}
        sourceLabel={currentSourceLabel}
        videoMetadata={videoMetadata}
        activeAdjustments={activeAdjustments}
        algorithm={algorithm}
        palette={palette}
        isRunningWorkflow={workflowBusy}
        workflowStatus={workflowStatus}
        jobProgressText={jobProgressText}
        jobOutputPath={jobOutputPath}
        onRunVideoWorkflow={onRunVideoWorkflow}
        onExportSvg={onExportSvg}
        onCancelJob={onCancelActiveJob}
        canRenderVideo={canRenderVideo}
        videoRenderBlockedReason={videoRenderBlockedReason}
      />

      <StatusBar
        status={status}
        imageSize={imageSize}
        backendConnected={backendConnected}
        workspaceMode={workspaceMode}
        workflowStatus={workflowStatus}
        jobProgressText={jobProgressText}
      />
    </>
  );
};

