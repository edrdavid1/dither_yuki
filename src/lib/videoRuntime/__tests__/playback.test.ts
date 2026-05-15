import { describe, expect, it } from "vitest";
import { resolveVideoPlaybackFrameCount } from "@/lib/videoRuntime/playback";

describe("resolveVideoPlaybackFrameCount", () => {
  it("keeps playback alive when metadata is missing", () => {
    expect(resolveVideoPlaybackFrameCount(null, 0, 30)).toBe(2);
    expect(resolveVideoPlaybackFrameCount(null, 12, 30)).toBe(12);
  });

  it("uses metadata when it provides a higher frame count", () => {
    expect(
      resolveVideoPlaybackFrameCount(
        {
          width: 1920,
          height: 1080,
          duration_seconds: 10,
          fps: 30,
          estimated_frame_count: 300,
        },
        12,
        30,
      ),
    ).toBe(300);
  });

  it("derives frames from duration when estimated_frame_count is missing", () => {
    expect(
      resolveVideoPlaybackFrameCount(
        {
          width: 1920,
          height: 1080,
          duration_seconds: 2.5,
          fps: 24,
          estimated_frame_count: 0,
        },
        2,
        24,
      ),
    ).toBe(60);
  });
});