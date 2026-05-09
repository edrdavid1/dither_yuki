import { describe, it, expect } from "vitest";
import {
  mapLayerToBackendPayload,
  mapLayersToBackendPayload,
  validateBackendPayload,
  validateLayer,
  type LayerToBackendOptions,
} from "@/lib/layerMapping";
import { makeLayer, cloneLayer, type Layer } from "@/types/layers";
import { buildBackendLayersPayload } from "@/types/layers";
import { DEFAULT_FRAME_SETTINGS } from "@/types/frameSettings";

describe("Layer Mapping", () => {
  const defaultOptions: LayerToBackendOptions = { customPalette: [] };

  describe("mapLayerToBackendPayload", () => {
    it("should map basic layer correctly", () => {
      const layer = makeLayer({ name: "Test Layer" });
      const payload = mapLayerToBackendPayload(layer, defaultOptions);

      expect(payload.id).toBe(layer.id);
      expect(payload.algorithm).toBe("Floyd-Steinberg");
      expect(payload.enabled).toBe(true);
      expect(payload.intensity).toBe(100);
      expect(payload.blend_mode).toBe("normal");
      expect(payload.opacity).toBe(1); // 100 / 100
    });

    it("should scale opacity correctly", () => {
      const layer = makeLayer({
        opacity: 50,
        settings: { ...DEFAULT_FRAME_SETTINGS, layerOpacity: 50 },
      });
      const payload = mapLayerToBackendPayload(layer, defaultOptions);

      expect(payload.opacity).toBe(0.5);
    });

    it("should handle zero opacity", () => {
      const layer = makeLayer({
        opacity: 0,
        settings: { ...DEFAULT_FRAME_SETTINGS, layerOpacity: 0 },
      });
      const payload = mapLayerToBackendPayload(layer, defaultOptions);

      expect(payload.opacity).toBe(0);
    });

    it("should use custom palette when palette is Custom", () => {
      const layer = makeLayer({
        settings: {
          ...DEFAULT_FRAME_SETTINGS,
          palette: "Custom",
          customPalette: [
            [255, 0, 0],
            [0, 255, 0],
            [0, 0, 255],
          ],
        },
      });

      const payload = mapLayerToBackendPayload(layer, defaultOptions);

      expect(payload.palette).toHaveLength(3);
      expect(payload.palette_name).toBeUndefined();
      expect(payload.palette?.[0]).toEqual([255, 0, 0]);
    });

    it("should fallback to default palette when custom palette is empty", () => {
      const layer = makeLayer({
        settings: {
          ...DEFAULT_FRAME_SETTINGS,
          palette: "Custom",
          customPalette: [],
        },
      });

      const fallbackPalette: [number, number, number][] = [[128, 128, 128]];
      const payload = mapLayerToBackendPayload(layer, { customPalette: fallbackPalette });

      expect(payload.palette).toEqual(fallbackPalette);
    });

    it("should use palette_name for named palettes", () => {
      const layer = makeLayer({
        settings: {
          ...DEFAULT_FRAME_SETTINGS,
          palette: "GameBoy",
        },
      });

      const payload = mapLayerToBackendPayload(layer, defaultOptions);

      expect(payload.palette_name).toBe("GameBoy");
      expect(payload.palette).toBeUndefined();
    });

    it("should map all effect parameters", () => {
      const layer = makeLayer({
        settings: {
          ...DEFAULT_FRAME_SETTINGS,
          contrast: 150,
          brightness: 80,
          saturation: 120,
          blur: 10,
          glitchType: "Pixel Sort",
        },
      });

      const payload = mapLayerToBackendPayload(layer, defaultOptions);

      expect(payload.contrast).toBe(150);
      expect(payload.brightness).toBe(80);
      expect(payload.saturation).toBe(120);
      expect(payload.blur).toBe(10);
      expect(payload.glitch_type).toBe("Pixel Sort");
    });

    it("should normalize algorithm names", () => {
      const layer = makeLayer({
        settings: {
          ...DEFAULT_FRAME_SETTINGS,
          algorithm: "ordered",
        },
      });

      const payload = mapLayerToBackendPayload(layer, defaultOptions);

      expect(payload.algorithm).toBe("Bayer 4x4");
    });
  });

  describe("mapLayersToBackendPayload", () => {
    it("should map multiple layers", () => {
      const layers = [
        makeLayer({ name: "Layer 1" }),
        makeLayer({ name: "Layer 2" }),
      ];

      const payload = mapLayersToBackendPayload(layers, defaultOptions);

      expect(payload).toHaveLength(2);
      expect(payload[0]?.id).toBe(layers[0]?.id);
      expect(payload[1]?.id).toBe(layers[1]?.id);
    });

    it("should filter out invisible layers", () => {
      const layers: Layer[] = [
        { ...makeLayer({ name: "Visible" }), visible: true },
        { ...makeLayer({ name: "Hidden" }), visible: false },
      ];

      const payload = mapLayersToBackendPayload(layers, defaultOptions);

      expect(payload).toHaveLength(1);
      expect(payload[0]?.id).toBe(layers[0]?.id);
    });

    it("should handle empty array", () => {
      const payload = mapLayersToBackendPayload([], defaultOptions);
      expect(payload).toHaveLength(0);
    });

    it("should return empty array when all layers are hidden", () => {
      const layers: Layer[] = [
        { ...makeLayer(), visible: false },
        { ...makeLayer(), visible: false },
      ];

      const payload = mapLayersToBackendPayload(layers, defaultOptions);
      expect(payload).toHaveLength(0);
    });

    it("should keep locked layers renderable when visible", () => {
      const lockedVisibleLayer = makeLayer({ visible: true, locked: true });

      const payload = mapLayersToBackendPayload([lockedVisibleLayer], defaultOptions);

      expect(payload).toHaveLength(1);
      expect(payload[0]?.enabled).toBe(true);
    });

    it("should match canonical backend payload builder contract", () => {
      const layers = [
        makeLayer({ name: "A" }),
        makeLayer({
          name: "B",
          settings: {
            ...DEFAULT_FRAME_SETTINGS,
            algorithm: "ordered",
            palette: "GameBoy",
          },
        }),
      ];

      const mapperPayload = mapLayersToBackendPayload(layers, defaultOptions);
      const canonicalPayload = buildBackendLayersPayload(layers, []);

      expect(canonicalPayload).toEqual(mapperPayload);
    });
  });

  describe("Validation", () => {
    it("should validate correct payload", () => {
      const layer = makeLayer();
      const payload = mapLayerToBackendPayload(layer, defaultOptions);
      const validated = validateBackendPayload(payload);

      expect(validated).not.toBeNull();
      expect(validated?.id).toBe(layer.id);
    });

    it("should reject invalid payload", () => {
      const invalidPayload = { id: 123, enabled: "yes" }; // Wrong types
      const validated = validateBackendPayload(invalidPayload);

      expect(validated).toBeNull();
    });

    it("should validate layer", () => {
      const layer = makeLayer();
      const validated = validateLayer(layer);

      expect(validated).not.toBeNull();
      expect(validated?.id).toBe(layer.id);
    });

    it("should reject invalid layer", () => {
      const invalidLayer = { id: "" }; // Empty ID
      const validated = validateLayer(invalidLayer);

      expect(validated).toBeNull();
    });
  });
});
