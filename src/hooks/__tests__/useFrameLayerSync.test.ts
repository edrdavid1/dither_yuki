import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFrameLayerSync } from "@/hooks/useFrameLayerSync";
import { makeAnimationFrame, type AnimationFrame } from "@/types/animationFrame";
import { makeLayer, type Layer } from "@/types/layers";
import { DEFAULT_FRAME_SETTINGS } from "@/types/frameSettings";

describe("useFrameLayerSync", () => {
  const mockRenderFramePreview = vi.fn().mockResolvedValue("data:image/png;base64,test");
  const mockMarkProjectDirty = vi.fn();
  const mockSetFrames = vi.fn();

  const createMockRefs = (frames: AnimationFrame[], layers: Layer[], activeId: string) => ({
    framesRef: { current: frames },
    layersRef: { current: layers },
    activeLayerIdRef: { current: activeId },
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("persistCurrentLayersToFrame", () => {
    it("should persist layers to current frame", () => {
      const layer = makeLayer({ name: "Test Layer" });
      const frame = makeAnimationFrame({
        id: "frame-1",
        src: "data:image/png;base64,test",
        width: 100,
        height: 100,
        layers: [layer],
        activeLayerId: layer.id,
        isKeyframe: true,
      });

      const { framesRef, layersRef, activeLayerIdRef } = createMockRefs(
        [frame],
        [layer],
        layer.id
      );

      const { result } = renderHook(() =>
        useFrameLayerSync({
          framesRef,
          layersRef,
          activeLayerIdRef,
          selectedFrameIndex: 0,
          setFrames: mockSetFrames,
          renderFramePreview: mockRenderFramePreview,
          markProjectDirty: mockMarkProjectDirty,
        })
      );

      const newLayer = makeLayer({ name: "New Layer" });

      act(() => {
        result.current.persistCurrentLayersToFrame([newLayer], newLayer.id);
      });

      // Should update refs immediately
      expect(layersRef.current).toEqual([newLayer]);
      expect(activeLayerIdRef.current).toBe(newLayer.id);

      // Should trigger render and dirty flag
      expect(mockRenderFramePreview).toHaveBeenCalledWith("frame-1", [newLayer]);
      expect(mockMarkProjectDirty).toHaveBeenCalled();
    });

    it("should handle empty frames gracefully", () => {
      const layer = makeLayer();
      const { framesRef, layersRef, activeLayerIdRef } = createMockRefs([], [layer], layer.id);

      const { result } = renderHook(() =>
        useFrameLayerSync({
          framesRef,
          layersRef,
          activeLayerIdRef,
          selectedFrameIndex: 0,
          setFrames: mockSetFrames,
          renderFramePreview: mockRenderFramePreview,
          markProjectDirty: mockMarkProjectDirty,
        })
      );

      act(() => {
        result.current.persistCurrentLayersToFrame([layer], layer.id);
      });

      // Should not crash or call render when no frames
      expect(mockRenderFramePreview).not.toHaveBeenCalled();
    });

    it("should clamp selectedFrameIndex to valid range", () => {
      const layer = makeLayer();
      const frame = makeAnimationFrame({
        id: "frame-1",
        src: "data:image/png;base64,test",
        width: 100,
        height: 100,
      });

      const { framesRef, layersRef, activeLayerIdRef } = createMockRefs(
        [frame],
        [layer],
        layer.id
      );

      const { result } = renderHook(() =>
        useFrameLayerSync({
          framesRef,
          layersRef,
          activeLayerIdRef,
          selectedFrameIndex: 999, // Out of bounds
          setFrames: mockSetFrames,
          renderFramePreview: mockRenderFramePreview,
          markProjectDirty: mockMarkProjectDirty,
        })
      );

      act(() => {
        result.current.persistCurrentLayersToFrame([layer], layer.id);
      });

      // Should still work (clamped to index 0)
      expect(mockRenderFramePreview).toHaveBeenCalled();
    });

    it("should snapshot layers by value, not by reference", () => {
      const layer = makeLayer({ name: "Snapshot Layer" });
      const frame = makeAnimationFrame({
        id: "frame-1",
        src: "data:image/png;base64,test",
        width: 100,
        height: 100,
      });
      const { framesRef, layersRef, activeLayerIdRef } = createMockRefs([frame], [layer], layer.id);

      const { result } = renderHook(() =>
        useFrameLayerSync({
          framesRef,
          layersRef,
          activeLayerIdRef,
          selectedFrameIndex: 0,
          setFrames: mockSetFrames,
          renderFramePreview: mockRenderFramePreview,
          markProjectDirty: mockMarkProjectDirty,
        })
      );

      const inputLayers = [makeLayer({ name: "Input Layer" })];
      act(() => {
        result.current.persistCurrentLayersToFrame(inputLayers, inputLayers[0].id);
      });

      inputLayers[0].name = "Mutated After Persist";

      expect(framesRef.current[0]?.layers[0]?.name).toBe("Input Layer");
      expect(layersRef.current[0]?.name).toBe("Input Layer");
    });
  });

  describe("syncLayersFromFrame", () => {
    it("should load layers from frame", () => {
      const layer1 = makeLayer({ name: "Layer 1" });
      const layer2 = makeLayer({ name: "Layer 2" });
      const frame = makeAnimationFrame({
        id: "frame-1",
        src: "data:image/png;base64,test",
        width: 100,
        height: 100,
        layers: [layer1, layer2],
        activeLayerId: layer2.id,
        isKeyframe: true,
      });

      const { framesRef, layersRef, activeLayerIdRef } = createMockRefs(
        [frame],
        [], // Empty current layers
        ""
      );

      const { result } = renderHook(() =>
        useFrameLayerSync({
          framesRef,
          layersRef,
          activeLayerIdRef,
          selectedFrameIndex: 0,
          setFrames: mockSetFrames,
          renderFramePreview: mockRenderFramePreview,
          markProjectDirty: mockMarkProjectDirty,
        })
      );

      const syncedLayers = result.current.syncLayersFromFrame(0);

      expect(syncedLayers).toHaveLength(2);
      expect(layersRef.current).toHaveLength(2);
      expect(activeLayerIdRef.current).toBe(layer2.id);
    });

    it("should return null for invalid frame index", () => {
      const layer = makeLayer();
      const { framesRef, layersRef, activeLayerIdRef } = createMockRefs([], [layer], layer.id);

      const { result } = renderHook(() =>
        useFrameLayerSync({
          framesRef,
          layersRef,
          activeLayerIdRef,
          selectedFrameIndex: 0,
          setFrames: mockSetFrames,
          renderFramePreview: mockRenderFramePreview,
          markProjectDirty: mockMarkProjectDirty,
        })
      );

      const syncedLayers = result.current.syncLayersFromFrame(999);

      expect(syncedLayers).toBeNull();
    });

    it("should create independent layer copies", () => {
      const layer = makeLayer({ name: "Original" });
      const frame = makeAnimationFrame({
        id: "frame-1",
        src: "data:image/png;base64,test",
        width: 100,
        height: 100,
        layers: [layer],
        activeLayerId: layer.id,
      });

      const { framesRef, layersRef, activeLayerIdRef } = createMockRefs(
        [frame],
        [],
        ""
      );

      const { result } = renderHook(() =>
        useFrameLayerSync({
          framesRef,
          layersRef,
          activeLayerIdRef,
          selectedFrameIndex: 0,
          setFrames: mockSetFrames,
          renderFramePreview: mockRenderFramePreview,
          markProjectDirty: mockMarkProjectDirty,
        })
      );

      const syncedLayers = result.current.syncLayersFromFrame(0);

      // Modify synced layer
      if (syncedLayers && syncedLayers[0]) {
        syncedLayers[0].settings.intensity = 50;
      }

      // Original frame layer should be unchanged
      expect(frame.layers[0]?.settings.intensity).toBe(100);
    });

    it("should fallback active layer id when frame active id is missing", () => {
      const layer = makeLayer({ name: "Layer 1" });
      const frame = makeAnimationFrame({
        id: "frame-1",
        src: "data:image/png;base64,test",
        width: 100,
        height: 100,
        layers: [layer],
        activeLayerId: "",
      });

      const { framesRef, layersRef, activeLayerIdRef } = createMockRefs([frame], [], "");

      const { result } = renderHook(() =>
        useFrameLayerSync({
          framesRef,
          layersRef,
          activeLayerIdRef,
          selectedFrameIndex: 0,
          setFrames: mockSetFrames,
          renderFramePreview: mockRenderFramePreview,
          markProjectDirty: mockMarkProjectDirty,
        })
      );

      result.current.syncLayersFromFrame(0);
      expect(activeLayerIdRef.current).toBe(layer.id);
    });
  });
});
