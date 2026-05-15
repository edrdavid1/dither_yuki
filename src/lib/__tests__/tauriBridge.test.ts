import { describe, expect, it } from "vitest";
import { decodeFramePayload, type BinaryFrameEvent } from "@/lib/tauriBridge";

describe("tauriBridge decodeFramePayload", () => {
  const baseEvent = {
    videoId: "sample-video",
    frameIndex: 12,
    width: 1,
    height: 1,
    cacheHit: false,
    processingMs: 8.5,
    backendUsed: "cpu" as const,
    fallbackUsed: false,
    qualityMode: "fast" as const,
    scale: 0.25,
    transportRequestId: "video-preview-12",
  } satisfies Omit<BinaryFrameEvent, "rgba">;

  it("decodes numeric RGBA arrays", () => {
    const decoded = decodeFramePayload({
      ...baseEvent,
      rgba: [1, 2, 3, 4],
    });

    expect(decoded).not.toBeNull();
    expect(decoded?.rgba).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(decoded?.meta.transportRequestId).toBe(baseEvent.transportRequestId);
  });

  it("decodes base64 RGBA strings", () => {
    const decoded = decodeFramePayload({
      ...baseEvent,
      rgba: "AQIDBA==",
    });

    expect(decoded).not.toBeNull();
    expect(decoded?.rgba).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(decoded?.meta.transportRequestId).toBe(baseEvent.transportRequestId);
  });
});