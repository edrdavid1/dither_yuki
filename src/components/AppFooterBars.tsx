import { StatusBar } from "@/components/StatusBar";
import type { WorkspaceMode } from "@/components/WorkspaceModeSwitcher";

interface AppFooterBarsProps {
  focusMode: boolean;
  workspaceMode: WorkspaceMode;
  backendConnected: boolean;
  imageSize?: string;
  workflowStatus?: string;
  jobProgressText?: string;
  status: string;
  previewQualityLabel?: string;
}

export const AppFooterBars = ({
  focusMode,
  workspaceMode,
  backendConnected,
  imageSize,
  workflowStatus,
  jobProgressText,
  status,
  previewQualityLabel,
}: AppFooterBarsProps) => {
  if (focusMode) return null;

  return (
    <>
      <StatusBar
        status={status}
        imageSize={imageSize}
        backendConnected={backendConnected}
        workspaceMode={workspaceMode}
        workflowStatus={workflowStatus}
        jobProgressText={jobProgressText}
        previewQualityLabel={previewQualityLabel}
      />
    </>
  );
};

