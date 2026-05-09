import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { safeTauriInvoke } from "@/lib/tauriBridge";

export interface VideoJobProgressResponse {
  job_id: string;
  status: "queued" | "running" | "completed" | "cancelled" | "failed";
  current_frame: number;
  total_frames: number;
  cancellation_requested: boolean;
  output_path?: string | null;
  message?: string | null;
}

interface UseVideoJobLifecycleArgs {
  jobId: string | null;
  jobKind: "video" | "animation" | null;
  setJobId: Dispatch<SetStateAction<string | null>>;
  setJobProgress: Dispatch<SetStateAction<VideoJobProgressResponse | null>>;
  setJobOutputPath: Dispatch<SetStateAction<string | null>>;
  setWorkflowBusy: Dispatch<SetStateAction<boolean>>;
  setWorkflowStatus: Dispatch<SetStateAction<string | undefined>>;
  setStatus: (status: string) => void;
}

export function useVideoJobLifecycle({
  jobId,
  jobKind,
  setJobId,
  setJobProgress,
  setJobOutputPath,
  setWorkflowBusy,
  setWorkflowStatus,
  setStatus,
}: UseVideoJobLifecycleArgs) {
  const jobPollMissesRef = useRef(0);

  const handleCancelActiveJob = useCallback(async () => {
    if (!jobId) return;

    const cancelled = await safeTauriInvoke<VideoJobProgressResponse>("cancel_video_processing_job", { jobId });
    if (cancelled) {
      setJobProgress(cancelled);
      setWorkflowStatus(cancelled.message ?? "Cancellation requested");
      toast.success("Cancellation requested");
    }
  }, [jobId, setJobProgress, setWorkflowStatus]);

  useEffect(() => {
    if (!jobId) {
      jobPollMissesRef.current = 0;
      return;
    }

    const poll = async () => {
      const nextProgress = await safeTauriInvoke<VideoJobProgressResponse>("get_video_processing_progress", { jobId });
      if (!nextProgress) {
        jobPollMissesRef.current += 1;
        if (jobPollMissesRef.current >= 10) {
          setWorkflowBusy(false);
          setWorkflowStatus("Lost backend progress channel. Check Tauri process/logs and retry render.");
          setStatus("Backend progress unavailable");
          toast.error("Lost render progress channel (backend unavailable)");
          setJobId(null);
        }
        return;
      }

      jobPollMissesRef.current = 0;

      setJobProgress(nextProgress);
      setWorkflowStatus(nextProgress.message ?? `${nextProgress.status} ${nextProgress.current_frame}/${nextProgress.total_frames}`);

      if (nextProgress.output_path) {
        setJobOutputPath(nextProgress.output_path);
      }

      if (["completed", "failed", "cancelled"].includes(nextProgress.status)) {
        setStatus(
          nextProgress.status === "completed"
            ? `${jobKind === "video" ? "Video" : "Animation"} backend render complete`
            : `${jobKind === "video" ? "Video" : "Animation"} backend render ${nextProgress.status}`,
        );

        if (nextProgress.status === "failed") {
          toast.error(nextProgress.message ?? "Backend render failed");
        }

        setWorkflowBusy(false);
        setJobId(null);
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 1000);

    return () => window.clearInterval(timer);
  }, [jobId, jobKind, setJobId, setJobOutputPath, setJobProgress, setStatus, setWorkflowBusy, setWorkflowStatus]);

  return {
    handleCancelActiveJob,
  };
}
