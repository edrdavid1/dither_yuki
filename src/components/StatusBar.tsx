interface StatusBarProps {
  status: string;
  imageSize?: string;
  backendConnected: boolean;
  workspaceMode: string;
  workflowStatus?: string;
  jobProgressText?: string;
  previewQualityLabel?: string;
}

export const StatusBar = ({ status, imageSize, backendConnected, workspaceMode, workflowStatus, jobProgressText, previewQualityLabel }: StatusBarProps) => {
  const previewBadgeClass = previewQualityLabel === "Accurate"
    ? "bg-emerald-900/30 text-emerald-300 border border-emerald-700"
    : "bg-amber-900/30 text-amber-300 border border-amber-700";

  return (
    <div className="bg-card border-t border-win95-light px-1 py-0.5 flex flex-wrap items-center gap-1 text-[10px] min-h-0 h-6">
      <div className="win95-border-inset px-1 py-0.5 flex-1 min-w-[100px] truncate">
        {status}
      </div>
      <div className="win95-border-inset px-1 py-0.5">{backendConnected ? "Backend" : "Local"}</div>
      <div className="win95-border-inset px-1 py-0.5">{workspaceMode}</div>
      {imageSize && (
        <div className="win95-border-inset px-1 py-0.5">
          {imageSize}
        </div>
      )}
      {workflowStatus && <div className="win95-border-inset px-1 py-0.5">{workflowStatus}</div>}
      {jobProgressText && <div className="win95-border-inset px-1 py-0.5">{jobProgressText}</div>}
      {previewQualityLabel && (
        <div className={`win95-border-inset px-1 py-0.5 ${previewBadgeClass}`}>
          Preview: {previewQualityLabel}
        </div>
      )}
    </div>
  );
};
