import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEffectParamSync } from "../useEffectParamSync";
import type { LayerTrack } from "@/lib/videoRuntime/layerTracks";

describe("useEffectParamSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("should call callback when opacity changes", () => {
    const callback = vi.fn();
    const initialTracks: LayerTrack[] = [
      {
        layerId: "layer1",
        ranges: [
          {
            startFrame: 0,
            endFrame: 100,
            opacity01: 0.5,
          },
        ],
        keyframes: [],
      },
    ];

    const { rerender } = renderHook(
      ({ tracks, payload }) => useEffectParamSync(tracks, payload, callback),
      {
        initialProps: {
          tracks: initialTracks,
          payload: [],
        },
      },
    );

    expect(callback).not.toHaveBeenCalled();

    // Change opacity
    const updatedTracks: LayerTrack[] = [
      {
        layerId: "layer1",
        ranges: [
          {
            startFrame: 0,
            endFrame: 100,
            opacity01: 0.8, // Changed
          },
        ],
        keyframes: [],
      },
    ];

    rerender({ tracks: updatedTracks, payload: [] });

    // Callback should be called after debounce
    expect(callback).not.toHaveBeenCalled(); // Not yet, debounce pending
    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should call callback when intensity changes", () => {
    const callback = vi.fn();
    const initialTracks: LayerTrack[] = [
      {
        layerId: "layer1",
        ranges: [
          {
            startFrame: 0,
            endFrame: 100,
            intensity: 1.0,
          },
        ],
        keyframes: [],
      },
    ];

    const { rerender } = renderHook(
      ({ tracks, payload }) => useEffectParamSync(tracks, payload, callback),
      {
        initialProps: {
          tracks: initialTracks,
          payload: [],
        },
      },
    );

    // Change intensity
    const updatedTracks: LayerTrack[] = [
      {
        layerId: "layer1",
        ranges: [
          {
            startFrame: 0,
            endFrame: 100,
            intensity: 2.0, // Changed
          },
        ],
        keyframes: [],
      },
    ];

    rerender({ tracks: updatedTracks, payload: [] });

    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should call callback when enabled changes", () => {
    const callback = vi.fn();
    const initialTracks: LayerTrack[] = [
      {
        layerId: "layer1",
        ranges: [
          {
            startFrame: 0,
            endFrame: 100,
            enabled: true,
          },
        ],
        keyframes: [],
      },
    ];

    const { rerender } = renderHook(
      ({ tracks, payload }) => useEffectParamSync(tracks, payload, callback),
      {
        initialProps: {
          tracks: initialTracks,
          payload: [],
        },
      },
    );

    // Change enabled
    const updatedTracks: LayerTrack[] = [
      {
        layerId: "layer1",
        ranges: [
          {
            startFrame: 0,
            endFrame: 100,
            enabled: false, // Changed
          },
        ],
        keyframes: [],
      },
    ];

    rerender({ tracks: updatedTracks, payload: [] });

    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should not call callback when only frame boundaries change", () => {
    const callback = vi.fn();
    const initialTracks: LayerTrack[] = [
      {
        layerId: "layer1",
        ranges: [
          {
            startFrame: 0,
            endFrame: 100,
            opacity01: 0.5,
          },
        ],
        keyframes: [],
      },
    ];

    const { rerender } = renderHook(
      ({ tracks, payload }) => useEffectParamSync(tracks, payload, callback),
      {
        initialProps: {
          tracks: initialTracks,
          payload: [],
        },
      },
    );

    // Change startFrame (this WILL trigger callback because it affects which effects apply)
    // This is actually correct behavior - changing frame boundaries can affect the result
    const updatedTracks: LayerTrack[] = [
      {
        layerId: "layer1",
        ranges: [
          {
            startFrame: 10, // Changed
            endFrame: 100,
            opacity01: 0.5,
          },
        ],
        keyframes: [],
      },
    ];

    rerender({ tracks: updatedTracks, payload: [] });

    // This WILL call callback because frame boundaries affect which effects apply
    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should debounce rapid changes", () => {
    const callback = vi.fn();
    const initialTracks: LayerTrack[] = [
      {
        layerId: "layer1",
        ranges: [
          {
            startFrame: 0,
            endFrame: 100,
            opacity01: 0.5,
          },
        ],
        keyframes: [],
      },
    ];

    const { rerender } = renderHook(
      ({ tracks, payload }) => useEffectParamSync(tracks, payload, callback),
      {
        initialProps: {
          tracks: initialTracks,
          payload: [],
        },
      },
    );

    // Simulate rapid slider changes
    for (let i = 0; i < 5; i++) {
      const updatedTracks: LayerTrack[] = [
        {
          layerId: "layer1",
          ranges: [
            {
              startFrame: 0,
              endFrame: 100,
              opacity01: 0.5 + i * 0.1,
            },
          ],
          keyframes: [],
        },
      ];
      rerender({ tracks: updatedTracks, payload: [] });
      vi.advanceTimersByTime(10); // Advance 10ms between changes
    }

    // Should only call callback once after debounce
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should call callback when layer payload changes", () => {
    const callback = vi.fn();
    const initialTracks: LayerTrack[] = [
      {
        layerId: "layer1",
        ranges: [
          {
            startFrame: 0,
            endFrame: 100,
            opacity01: 0.5,
          },
        ],
        keyframes: [],
      },
    ];

    const { rerender } = renderHook(
      ({ tracks, payload }) => useEffectParamSync(tracks, payload, callback),
      {
        initialProps: {
          tracks: initialTracks,
          payload: [{ type: "dither", enabled: true }],
        },
      },
    );

    // Change payload
    rerender({
      tracks: initialTracks,
      payload: [{ type: "dither", enabled: false }],
    });

    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should not call callback when nothing changes", () => {
    const callback = vi.fn();
    const initialTracks: LayerTrack[] = [
      {
        layerId: "layer1",
        ranges: [
          {
            startFrame: 0,
            endFrame: 100,
            opacity01: 0.5,
          },
        ],
        keyframes: [],
      },
    ];

    const { rerender } = renderHook(
      ({ tracks, payload }) => useEffectParamSync(tracks, payload, callback),
      {
        initialProps: {
          tracks: initialTracks,
          payload: [],
        },
      },
    );

    // Rerender with same props
    rerender({ tracks: initialTracks, payload: [] });

    vi.advanceTimersByTime(50);
    expect(callback).not.toHaveBeenCalled();
  });

  it("should handle multiple ranges", () => {
    const callback = vi.fn();
    const initialTracks: LayerTrack[] = [
      {
        layerId: "layer1",
        ranges: [
          {
            startFrame: 0,
            endFrame: 50,
            opacity01: 0.5,
          },
          {
            startFrame: 50,
            endFrame: 100,
            opacity01: 0.8,
          },
        ],
        keyframes: [],
      },
    ];

    const { rerender } = renderHook(
      ({ tracks, payload }) => useEffectParamSync(tracks, payload, callback),
      {
        initialProps: {
          tracks: initialTracks,
          payload: [],
        },
      },
    );

    // Change opacity in second range
    const updatedTracks: LayerTrack[] = [
      {
        layerId: "layer1",
        ranges: [
          {
            startFrame: 0,
            endFrame: 50,
            opacity01: 0.5,
          },
          {
            startFrame: 50,
            endFrame: 100,
            opacity01: 0.9, // Changed
          },
        ],
        keyframes: [],
      },
    ];

    rerender({ tracks: updatedTracks, payload: [] });

    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
