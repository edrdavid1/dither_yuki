import type { RenderJob } from "@/hooks/useVideoRenderQueue";
import { ICONS } from "@/components/ui/IconLibrary";

interface VideoRenderQueuePanelProps {
  jobs: RenderJob[];
  activeJobId: string | null;
  onSelectJob: (jobId: string) => void;
  onCancelJob: (jobId: string) => void;
  onClearCompleted: () => void;
  disabled?: boolean;
}

function formatDuration(totalFrames: number, fps = 30): string {
  const seconds = totalFrames / fps;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "running":
      return "text-blue-600";
    case "queued":
      return "text-yellow-600";
    case "completed":
      return "text-green-600";
    case "cancelled":
      return "text-orange-600";
    case "failed":
      return "text-red-600";
    default:
      return "text-gray-600";
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case "running":
      return "bg-blue-50";
    case "queued":
      return "bg-yellow-50";
    case "completed":
      return "bg-green-50";
    case "cancelled":
      return "bg-orange-50";
    case "failed":
      return "bg-red-50";
    default:
      return "bg-gray-50";
  }
}

export const VideoRenderQueuePanel = ({
  jobs,
  activeJobId,
  onSelectJob,
  onCancelJob,
  onClearCompleted,
  disabled = false,
}: VideoRenderQueuePanelProps) => {
  const runningCount = jobs.filter((j) => j.status === "running").length;
  const queuedCount = jobs.filter((j) => j.status === "queued").length;
  const completedCount = jobs.filter((j) =>
    ["completed", "cancelled", "failed"].includes(j.status)
  ).length;

  if (jobs.length === 0) {
    return (
      <div className="win95-border-inset px-3 py-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <ICONS.RENDER_QUEUE className="h-3.5 w-3.5 opacity-50" />
          <span>Render queue empty</span>
        </div>
      </div>
    );
  }

  return (
    <div className="win98-card flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <ICONS.RENDER_QUEUE className="h-3.5 w-3.5" />
          <span className="text-[11px] font-bold">Render Queue</span>
          <span className="win98-badge text-[10px]">
            {runningCount > 0 && `${runningCount} running`}
            {runningCount > 0 && queuedCount > 0 && ", "}
            {queuedCount > 0 && `${queuedCount} queued`}
            {runningCount === 0 && queuedCount === 0 && `${completedCount} completed`}
          </span>
        </div>
        {completedCount > 0 && (
          <button
            type="button"
            className="win95-button px-2 py-0.5 text-[10px]"
            onClick={onClearCompleted}
            disabled={disabled}
          >
            Clear completed
          </button>
        )}
      </div>

      <div className="win95-border-inset flex max-h-[120px] flex-col gap-0.5 overflow-y-auto bg-background p-1">
        {jobs.map((job) => {
          const isActive = job.job_id === activeJobId;
          const percent = job.total_frames > 0
            ? Math.round((job.current_frame / job.total_frames) * 100)
            : 0;

          return (
            <button
              key={job.job_id}
              type="button"
              onClick={() => onSelectJob(job.job_id)}
              disabled={disabled}
              className={`flex flex-col gap-0.5 rounded px-1.5 py-1 text-left text-[10px] transition-colors ${
                isActive
                  ? "bg-primary/10 ring-1 ring-primary"
                  : getStatusBg(job.status)
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`font-mono font-bold ${getStatusColor(job.status)}`}>
                    {job.status}
                  </span>
                  <span className="text-muted-foreground">
                    {job.job_id.slice(0, 8)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono">
                    {job.current_frame}/{job.total_frames}
                  </span>
                  {job.status === "running" && (
                    <span className="text-muted-foreground">({percent}%)</span>
                  )}
                </div>
              </div>

              {/* Progress bar for running/queued jobs */}
              {(job.status === "running" || job.status === "queued") && (
                <div className="win95-border-inset h-2 bg-input p-[1px]">
                  <div
                    className={`h-full transition-[width] duration-300 ${
                      job.status === "running" ? "bg-primary" : "bg-yellow-400"
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}

              <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                <span>~{formatDuration(job.total_frames)} @ {job.total_frames} frames</span>
                {job.output_path && (
                  <span className="truncate max-w-[120px]" title={job.output_path}>
                    {job.output_path.split("/").pop()?.split("\\").pop()}
                  </span>
                )}
              </div>

              {/* Cancel button for running/queued jobs */}
              {(job.status === "running" || job.status === "queued") && (
                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    className="win95-button px-2 py-0.5 text-[9px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCancelJob(job.job_id);
                    }}
                    disabled={disabled}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
