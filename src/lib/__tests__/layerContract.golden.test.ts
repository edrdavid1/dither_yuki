import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { makeLayer, buildBackendLayersPayload } from "@/types/layers";
import { DEFAULT_FRAME_SETTINGS } from "@/types/frameSettings";

const schemaPath = resolve(process.cwd(), "src/validation/contracts/backendEffectLayerPayload.schema.json");
const backendLayerPayloadSchema = JSON.parse(readFileSync(schemaPath, "utf-8"));

describe("Layer Contract Golden", () => {
  it("matches frozen backend payload contract and golden snapshot", () => {
    const layers = [
      makeLayer({
        id: "layer-golden-1",
        name: "Base",
        visible: true,
        settings: {
          ...DEFAULT_FRAME_SETTINGS,
          palette: "GameBoy",
          intensity: 85,
          contrast: 120,
          layerOpacity: 75,
          maskR: true,
          maskG: false,
          maskB: true,
          maskA: true,
        },
      }),
      makeLayer({
        id: "layer-golden-2",
        name: "CustomTone",
        visible: true,
        settings: {
          ...DEFAULT_FRAME_SETTINGS,
          algorithm: "ordered",
          palette: "Custom",
          customPalette: [
            [18, 18, 18],
            [170, 120, 44],
            [255, 240, 200],
          ],
          blur: 2,
          chaos: 55,
          globalSeed: 2026,
        },
      }),
    ];

    const payload = buildBackendLayersPayload(layers, []);

    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(backendLayerPayloadSchema);
    for (const layerPayload of payload) {
      const valid = validate(layerPayload);
      expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
    }

    expect(payload).toMatchSnapshot();
  });
});

