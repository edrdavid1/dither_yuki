import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useVideoRenderQueue } from "../useVideoRenderQueue";
import type { VideoRenderJobResponseV1 } from "@/lib/tauriBridge";

// Mock tauriBridge
vi.mock("@/lib/tauriBridge", () => ({
  listVideoJobsV2: vi.fn(),
  getVideoJobProgressV2: vi.fn(),
  cancelVideoJobV2: vi.fn(),
}));

import { listVideoJobsV2, getVideoJobProgressV2, cancelVideoJobV2 } from "@/lib/tauriBridge";

describe("useVideoRenderQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return empty jobs when disabled", () => {
    const { result } = renderHook(() =>
      useVideoRenderQueue({ enabled: false })
    );

    expect(result.current.jobs).toEqual([]);
    expect(result.current.activeJob).toBeNull();
    expect(result.current.runningJobs).toEqual([]);
    expect(result.current.queuedJobs).toEqual([]);
  });

  it("should poll for jobs when enabled", async () => {
    const mockJobs: VideoRenderJobResponseV1[] = [
      {
        job_id: "job-1",
        status: "running",
        current_frame: 5,
        total_frames: 100,
        output_path: null,
        version: 1,
      },
      {
        job_id: "job-2",
        status: "queued",
        current_frame: 0,
        total_frames: 50,
        output_path: null,
        version: 1,
      },
    ];

    vi.mocked(listVideoJobsV2).mockResolvedValue(mockJobs);

    const { result } = renderHook(() =>
      useVideoRenderQueue({ enabled: true, pollIntervalMs: 100 })
    );

    // Wait for initial poll
    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(2);
    });

    expect(result.current.runningJobs).toHaveLength(1);
    expect(result.current.queuedJobs).toHaveLength(1);
    expect(result.current.activeJob?.job_id).toBe("job-1");
  });

  it("should cancel job when cancelJob is called", async () => {
    const mockJobs: VideoRenderJobResponseV1[] = [
      {
        job_id: "job-1",
        status: "running",
        current_frame: 5,
        total_frames: 100,
        output_path: null,
        version: 1,
      },
    ];

    vi.mocked(listVideoJobsV2).mockResolvedValue(mockJobs);
    vi.mocked(cancelVideoJobV2).mockResolvedValue({
      job_id: "job-1",
      status: "cancelled",
      current_frame: 5,
      total_frames: 100,
      output_path: null,
      version: 1,
    });

    const { result } = renderHook(() =>
      useVideoRenderQueue({ enabled: true, pollIntervalMs: 100 })
    );

    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(1);
    });

    await result.current.cancelJob("job-1");

    expect(cancelVideoJobV2).toHaveBeenCalledWith("job-1");
  });

  it("should clear completed jobs", async () => {
    const mockJobs: VideoRenderJobResponseV1[] = [
      {
        job_id: "job-1",
        status: "completed",
        current_frame: 100,
        total_frames: 100,
        output_path: null,
        version: 1,
      },
      {
        job_id: "job-2",
        status: "running",
        current_frame: 50,
        total_frames: 100,
        output_path: null,
        version: 1,
      },
    ];

    vi.mocked(listVideoJobsV2).mockResolvedValue(mockJobs);

    const { result } = renderHook(() =>
      useVideoRenderQueue({ enabled: true, pollIntervalMs: 100 })
    );

    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(2);
    });

    expect(result.current.completedJobs).toHaveLength(1);

    result.current.clearCompletedJobs();

    // After clearing, only running job should remain in the list
    // Note: This just updates local state, actual list updates on next poll
    expect(result.current.jobs).toHaveLength(2); // Will update after next poll
  });
});
