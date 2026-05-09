import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLayerSession } from "@/hooks/useLayerSession";
import { makeLayer, type Layer } from "@/types/layers";
import { DEFAULT_FRAME_SETTINGS } from "@/types/frameSettings";

describe("useLayerSession", () => {
  const createMockRefs = (layers: Layer[], activeId: string) => ({
    layersRef: { current: layers },
    activeLayerIdRef: { current: activeId },
  });

  const mockCallbacks = {
    setLayers: vi.fn(),
    setActiveLayerId: vi.fn(),
    commitControlsToActiveEffect: vi.fn().mockReturnValue(null),
    applyLayerSnapshotToControls: vi.fn(),
    persistCurrentLayersToFrame: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("add layer", () => {
    it("should add layer and set it active", () => {
      const initialLayer = makeLayer({ name: "Layer 1" });
      const { layersRef, activeLayerIdRef } = createMockRefs([initialLayer], initialLayer.id);

      const { result } = renderHook(() =>
        useLayerSession({
          layersRef,
          activeLayerIdRef,
          ...mockCallbacks,
        })
      );

      act(() => {
        result.current.handleAddLayer();
      });

      // Should call commit first
      expect(mockCallbacks.commitControlsToActiveEffect).toHaveBeenCalled();
      // Should update layers
      expect(mockCallbacks.setLayers).toHaveBeenCalled();
      // Should set new layer as active
      expect(mockCallbacks.setActiveLayerId).toHaveBeenCalled();
    });
  });

  describe("select layer", () => {
    it("should commit current before switching", () => {
      const layer1 = makeLayer({ name: "Layer 1" });
      const layer2 = makeLayer({ name: "Layer 2" });
      const { layersRef, activeLayerIdRef } = createMockRefs([layer1, layer2], layer1.id);

      const { result } = renderHook(() =>
        useLayerSession({
          layersRef,
          activeLayerIdRef,
          ...mockCallbacks,
        })
      );

      act(() => {
        result.current.handleSelectLayer(layer2.id);
      });

      expect(mockCallbacks.commitControlsToActiveEffect).toHaveBeenCalled();
      expect(mockCallbacks.applyLayerSnapshotToControls).toHaveBeenCalledWith(
        expect.objectContaining({ id: layer2.id })
      );
    });

    it("should not switch to non-existent layer", () => {
      const layer1 = makeLayer({ name: "Layer 1" });
      const { layersRef, activeLayerIdRef } = createMockRefs([layer1], layer1.id);

      const { result } = renderHook(() =>
        useLayerSession({
          layersRef,
          activeLayerIdRef,
          ...mockCallbacks,
        })
      );

      act(() => {
        result.current.handleSelectLayer("non-existent-id");
      });

      expect(mockCallbacks.setActiveLayerId).not.toHaveBeenCalled();
    });
  });

  describe("remove layer", () => {
    it("should not remove last layer", () => {
      const layer = makeLayer({ name: "Only Layer" });
      const { layersRef, activeLayerIdRef } = createMockRefs([layer], layer.id);

      const { result } = renderHook(() =>
        useLayerSession({
          layersRef,
          activeLayerIdRef,
          ...mockCallbacks,
        })
      );

      act(() => {
        result.current.handleRemoveLayer(layer.id);
      });

      expect(mockCallbacks.setLayers).not.toHaveBeenCalled();
    });

    it("should remove layer and switch to fallback", () => {
      const layer1 = makeLayer({ name: "Layer 1" });
      const layer2 = makeLayer({ name: "Layer 2" });
      const { layersRef, activeLayerIdRef } = createMockRefs([layer1, layer2], layer1.id);

      const { result } = renderHook(() =>
        useLayerSession({
          layersRef,
          activeLayerIdRef,
          ...mockCallbacks,
        })
      );

      act(() => {
        result.current.handleRemoveLayer(layer1.id);
      });

      expect(mockCallbacks.setLayers).toHaveBeenCalled();
      expect(mockCallbacks.setActiveLayerId).toHaveBeenCalled();
    });
  });

  describe("toggle visibility", () => {
    it("should persist after toggle", () => {
      const layer = makeLayer({ name: "Test Layer", visible: true });
      const { layersRef, activeLayerIdRef } = createMockRefs([layer], layer.id);

      const { result } = renderHook(() =>
        useLayerSession({
          layersRef,
          activeLayerIdRef,
          ...mockCallbacks,
        })
      );

      act(() => {
        result.current.handleToggleLayerVisibility(layer.id);
      });

      expect(mockCallbacks.setLayers).toHaveBeenCalled();
      expect(mockCallbacks.persistCurrentLayersToFrame).toHaveBeenCalled();
    });

    it("should ignore visibility toggle on locked layer", () => {
      const layer = makeLayer({ name: "Locked Layer", visible: true, locked: true });
      const { layersRef, activeLayerIdRef } = createMockRefs([layer], layer.id);

      const { result } = renderHook(() =>
        useLayerSession({
          layersRef,
          activeLayerIdRef,
          ...mockCallbacks,
        })
      );

      act(() => {
        result.current.handleToggleLayerVisibility(layer.id);
      });

      expect(mockCallbacks.setLayers).not.toHaveBeenCalled();
      expect(mockCallbacks.persistCurrentLayersToFrame).not.toHaveBeenCalled();
    });
  });

  describe("toggle lock", () => {
    it("should persist after toggle", () => {
      const layer = makeLayer({ name: "Test Layer", locked: false });
      const { layersRef, activeLayerIdRef } = createMockRefs([layer], layer.id);

      const { result } = renderHook(() =>
        useLayerSession({
          layersRef,
          activeLayerIdRef,
          ...mockCallbacks,
        })
      );

      act(() => {
        result.current.handleToggleLayerLock(layer.id);
      });

      expect(mockCallbacks.setLayers).toHaveBeenCalled();
      expect(mockCallbacks.persistCurrentLayersToFrame).toHaveBeenCalled();
    });
  });

  describe("duplicate layer", () => {
    it("should duplicate layer with unique id and persist as active", () => {
      const source = makeLayer({ name: "Source" });
      const { layersRef, activeLayerIdRef } = createMockRefs([source], source.id);

      const { result } = renderHook(() =>
        useLayerSession({
          layersRef,
          activeLayerIdRef,
          ...mockCallbacks,
        })
      );

      act(() => {
        result.current.handleDuplicateLayer(source.id);
      });

      const setLayersCall = mockCallbacks.setLayers.mock.calls[0]?.[0];
      expect(Array.isArray(setLayersCall)).toBe(true);
      expect(setLayersCall).toHaveLength(2);
      expect(setLayersCall?.[1]?.name).toBe("Source copy");
      expect(setLayersCall?.[1]?.id).not.toBe(source.id);
      expect(mockCallbacks.setActiveLayerId).toHaveBeenCalledWith(setLayersCall?.[1]?.id);
      expect(mockCallbacks.persistCurrentLayersToFrame).toHaveBeenCalledWith(
        setLayersCall,
        setLayersCall?.[1]?.id
      );
    });

    it("should ignore duplicate for locked layer", () => {
      const source = makeLayer({ name: "Source", locked: true });
      const { layersRef, activeLayerIdRef } = createMockRefs([source], source.id);

      const { result } = renderHook(() =>
        useLayerSession({
          layersRef,
          activeLayerIdRef,
          ...mockCallbacks,
        })
      );

      act(() => {
        result.current.handleDuplicateLayer(source.id);
      });

      expect(mockCallbacks.setLayers).not.toHaveBeenCalled();
      expect(mockCallbacks.setActiveLayerId).not.toHaveBeenCalled();
      expect(mockCallbacks.persistCurrentLayersToFrame).not.toHaveBeenCalled();
    });
  });

  describe("move layer", () => {
    it("should reorder layers and persist new order", () => {
      const layer1 = makeLayer({ name: "Layer 1" });
      const layer2 = makeLayer({ name: "Layer 2" });
      const layer3 = makeLayer({ name: "Layer 3" });
      const { layersRef, activeLayerIdRef } = createMockRefs([layer1, layer2, layer3], layer2.id);

      const { result } = renderHook(() =>
        useLayerSession({
          layersRef,
          activeLayerIdRef,
          ...mockCallbacks,
        })
      );

      act(() => {
        result.current.handleMoveLayer(layer2.id, -1);
      });

      const nextLayers = mockCallbacks.setLayers.mock.calls[0]?.[0] as Layer[] | undefined;
      expect(nextLayers?.map((layer) => layer.id)).toEqual([layer2.id, layer1.id, layer3.id]);
      expect(mockCallbacks.persistCurrentLayersToFrame).toHaveBeenCalledWith(nextLayers);
    });

    it("should ignore out-of-bounds move without persisting", () => {
      const layer1 = makeLayer({ name: "Layer 1" });
      const layer2 = makeLayer({ name: "Layer 2" });
      const { layersRef, activeLayerIdRef } = createMockRefs([layer1, layer2], layer1.id);

      const { result } = renderHook(() =>
        useLayerSession({
          layersRef,
          activeLayerIdRef,
          ...mockCallbacks,
        })
      );

      act(() => {
        result.current.handleMoveLayer(layer1.id, -1);
      });

      expect(mockCallbacks.setLayers).not.toHaveBeenCalled();
      expect(mockCallbacks.persistCurrentLayersToFrame).not.toHaveBeenCalled();
    });

    it("should ignore move for locked layer", () => {
      const layer1 = makeLayer({ name: "Layer 1", locked: true });
      const layer2 = makeLayer({ name: "Layer 2" });
      const { layersRef, activeLayerIdRef } = createMockRefs([layer1, layer2], layer1.id);

      const { result } = renderHook(() =>
        useLayerSession({
          layersRef,
          activeLayerIdRef,
          ...mockCallbacks,
        })
      );

      act(() => {
        result.current.handleMoveLayer(layer1.id, 1);
      });

      expect(mockCallbacks.setLayers).not.toHaveBeenCalled();
      expect(mockCallbacks.persistCurrentLayersToFrame).not.toHaveBeenCalled();
    });
  });
});
