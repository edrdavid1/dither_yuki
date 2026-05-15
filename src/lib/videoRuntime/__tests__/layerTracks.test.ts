import { describe, expect, it } from "vitest";
import { applyLayerTracksToPayload, type LayerTrack } from "@/lib/videoRuntime/layerTracks";

describe("layerTracks", () => {
  it("disables layer outside ranges by default", () => {
    const payload = [{ id: "a", enabled: true, opacity: 1, intensity: 100 }];
    const tracks: LayerTrack[] = [
      { layerId: "a", ranges: [{ startFrame: 10, endFrame: 20 }], keyframes: [] },
    ];
    expect(applyLayerTracksToPayload(payload, tracks, 0)[0]?.enabled).toBe(false);
    expect(applyLayerTracksToPayload(payload, tracks, 15)[0]?.enabled).toBe(true);
  });

  it("applies range overrides", () => {
    const payload = [{ id: "a", enabled: true, opacity: 1, intensity: 100 }];
    const tracks: LayerTrack[] = [
      {
        layerId: "a",
        ranges: [{ startFrame: 0, endFrame: 10, enabled: true, opacity01: 0.25, intensity: 50 }],
        keyframes: [],
      },
    ];
    const out = applyLayerTracksToPayload(payload, tracks, 5)[0]!;
    expect(out.enabled).toBe(true);
    expect(out.opacity).toBe(0.25);
    expect(out.intensity).toBe(50);
  });

  it("interpolates keyframes for opacity and intensity", () => {
    const payload = [{ id: "a", enabled: true, opacity: 1, intensity: 100 }];
    const tracks: LayerTrack[] = [
      {
        layerId: "a",
        ranges: [{ startFrame: 0, endFrame: 100, enabled: true }],
        keyframes: [
          { frame: 0, opacity01: 0, intensity: 0 },
          { frame: 10, opacity01: 1, intensity: 100 },
        ],
      },
    ];
    const out = applyLayerTracksToPayload(payload, tracks, 5)[0]!;
    expect(out.opacity).toBe(0.5);
    expect(out.intensity).toBe(50);
  });
});

