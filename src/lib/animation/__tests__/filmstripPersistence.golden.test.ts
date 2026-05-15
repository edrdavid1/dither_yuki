import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { encodeFilmstripProjectData, decodeFilmstripProjectData } from "@/lib/animation/filmstripPersistence";
import { makeAnimationFrame } from "@/types/animationFrame";
import { makeLayer } from "@/types/layers";
import { DEFAULT_FRAME_SETTINGS } from "@/types/frameSettings";

const domainLayerSchemaPath = resolve(process.cwd(), "src/validation/contracts/domainLayer.schema.json");
const domainLayerSchema = JSON.parse(readFileSync(domainLayerSchemaPath, "utf-8"));

describe("filmstripPersistence golden", () => {
  it("round-trips project layer snapshots with stable contract", () => {
    const frameLayerA = makeLayer({
      id: "layer-frame-a",
      name: "Frame A",
      settings: {
        ...DEFAULT_FRAME_SETTINGS,
        algorithm: "Floyd-Steinberg",
        palette: "GameBoy",
      },
    });
    const frameLayerB = makeLayer({
      id: "layer-frame-b",
      name: "Frame B",
      locked: true,
      settings: {
        ...DEFAULT_FRAME_SETTINGS,
        algorithm: "Ordered",
        palette: "Custom",
        customPalette: [
          [16, 24, 32],
          [72, 96, 128],
          [220, 220, 220],
        ],
      },
    });

    const rootLayer = makeLayer({
      id: "layer-root",
      name: "Root",
      settings: {
        ...DEFAULT_FRAME_SETTINGS,
        algorithm: "None",
      },
    });

    const filmstripPayload = {
      version: 1 as const,
      frames: [
        makeAnimationFrame({
          id: "frame-1",
          src: "data:image/png;base64,AAA",
          width: 320,
          height: 240,
          layers: [frameLayerA, frameLayerB],
          activeLayerId: frameLayerB.id,
          isKeyframe: true,
          easing: "linear",
        }),
      ],
      selectedFrameIndex: 0,
      selectedFrameIds: ["frame-1"],
      rootLayers: [rootLayer],
      rootActiveLayerId: rootLayer.id,
    };

    const encoded = encodeFilmstripProjectData(filmstripPayload);
    const decoded = decodeFilmstripProjectData(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded?.version).toBe(1);
    expect(decoded?.frames).toHaveLength(1);
    expect(decoded?.rootLayers).toHaveLength(1);

    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validateLayer = ajv.compile(domainLayerSchema);
    const allLayers = [
      ...(decoded?.frames[0]?.layers ?? []),
      ...(decoded?.rootLayers ?? []),
    ];
    for (const layer of allLayers) {
      const valid = validateLayer(layer);
      expect(valid, JSON.stringify(validateLayer.errors, null, 2)).toBe(true);
    }

    expect(decoded).toMatchSnapshot();
  });
});

