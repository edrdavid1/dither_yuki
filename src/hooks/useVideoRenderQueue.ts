import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  cancelVideoJobV2,
  getVideoJobProgressV2,
  listVideoJobsV2,
  type VideoRenderJobResponseV1,
} from "@/lib/tauriBridge";

export type JobStatus = "queued" | "running" | "completed" | "cancelled" | "failed";

export interface RenderJob extends VideoRenderJobResponseV1 {
  status: JobStatus;
}

interface UseVideoRenderQueueArgs {
  enabled: boolean;
  pollIntervalMs?: number;
}

export function useVideoRenderQueue({ enabled, pollIntervalMs = 2000 }: UseVideoRenderQueueArgs) {
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const pollMissesRef = useRef(0);
  const maxPollMisses = 3;

  const refreshJobs = useCallback(async () => {
    if (!enabled) return;
    try {
      const jobList = await listVideoJobsV2();
      setJobs((jobList ?? []) as RenderJob[]);
      pollMissesRef.current = 0;
    } catch (error) {
      console.error("Failed to fetch video jobs:", error);
      pollMissesRef.current += 1;
      if (pollMissesRef.current >= maxPollMisses) {
        toast.error("Lost connection to render queue backend");
      }
    }
  }, [enabled]);

  const refreshJobProgress = useCallback(async (jobId: string) => {
    if (!enabled) return null;
    try {
      const progress = await getVideoJobProgressV2(jobId);
      if (progress) {
        setJobs((prev) =>
          prev.map((j) => (j.job_id === jobId ? (progress as RenderJob) : j))
        );
      }
      return progress;
    } catch (error) {
      console.error("Failed to fetch job progress:", error);
      return null;
    }
  }, [enabled]);

  const cancelJob = useCallback(async (jobId: string) => {
    try {
      const result = await cancelVideoJobV2(jobId);
      if (result) {
        setJobs((prev) =>
          prev.map((j) => (j.job_id === jobId ? (result as RenderJob) : j))
        );
        toast.success(`Job ${jobId.slice(0, 8)} cancelled`);
      }
      return result;
    } catch (error) {
      console.error("Failed to cancel job:", error);
      toast.error("Failed to cancel job");
      return null;
    }
  }, []);

  const clearCompletedJobs = useCallback(() => {
    setJobs((prev) => prev.filter((j) => !["completed", "cancelled", "failed"].includes(j.status)));
  }, []);

  const activeJob = jobs.find((j) => j.job_id === activeJobId) ?? null;
  const runningJobs = jobs.filter((j) => j.status === "running");
  const queuedJobs = jobs.filter((j) => j.status === "queued");
  const completedJobs = jobs.filter((j) => ["completed", "cancelled", "failed"].includes(j.status));

  // Polling for job list
  useEffect(() => {
    if (!enabled) {
      setJobs([]);
      setActiveJobId(null);
      return;
    }

    void refreshJobs();
    const timer = setInterval(() => {
      void refreshJobs();
    }, pollIntervalMs);

    return () => clearInterval(timer);
  }, [enabled, pollIntervalMs, refreshJobs]);

  // Auto-set active job if there's a running one and no active job selected
  useEffect(() => {
    if (activeJobId) return;
    const running = jobs.find((j) => j.status === "running");
    if (running) {
      setActiveJobId(running.job_id);
    } else if (jobs.length > 0) {
      // Default to most recent job
      setActiveJobId(jobs[jobs.length - 1].job_id);
    }
  }, [jobs, activeJobId]);

  return useMemo(
    () => ({
      jobs,
      activeJob,
      activeJobId,
      setActiveJobId,
      runningJobs,
      queuedJobs,
      completedJobs,
      refreshJobs,
      refreshJobProgress,
      cancelJob,
      clearCompletedJobs,
    }),
    [
      jobs,
      activeJob,
      activeJobId,
      refreshJobs,
      refreshJobProgress,
      cancelJob,
      clearCompletedJobs,
    ],
  );
}
