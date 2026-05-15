// Validates a DyprojManifest object before sending it to the Rust backend.
// Uses AJV with strict mode for fast schema enforcement.

import Ajv, { type JSONSchemaType } from "ajv";
import addFormats from "ajv-formats";
import type { DyprojManifest } from "../types/project";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const keyframeSchema = {
  type: "object",
  properties: {
    frame: { type: "integer", minimum: 0 },
    value: {},
    easing: { type: "string" },
  },
  required: ["frame", "value", "easing"],
  additionalProperties: false,
};

const trackSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    layerId: { type: "string" },
    parameter: { type: "string" },
    keyframes: { type: "array", items: keyframeSchema },
  },
  required: ["id", "layerId", "parameter", "keyframes"],
  additionalProperties: false,
};

const animationSchema = {
  type: "object",
  properties: {
    durationFrames: { type: "integer", minimum: 1 },
    fps: { type: "number", exclusiveMinimum: 0 },
    tracks: { type: "array", items: trackSchema },
  },
  required: ["durationFrames", "fps", "tracks"],
  additionalProperties: false,
};

const layerRangeSchema = {
  type: "object",
  properties: {
    startFrame: { type: "integer", minimum: 0 },
    endFrame: { type: "integer", minimum: 0 },
    enabled: { type: "boolean" },
    opacity01: { type: "number", minimum: 0, maximum: 1 },
    intensity: { type: "number" },
  },
  required: ["startFrame", "endFrame"],
  additionalProperties: false,
};

const layerKeyframeSchema = {
  type: "object",
  properties: {
    frame: { type: "integer", minimum: 0 },
    opacity01: { type: "number", minimum: 0, maximum: 1 },
    intensity: { type: "number" },
  },
  required: ["frame"],
  additionalProperties: false,
};

const layerTrackSchema = {
  type: "object",
  properties: {
    layerId: { type: "string" },
    disableOutsideRanges: { type: "boolean" },
    ranges: { type: "array", items: layerRangeSchema },
    keyframes: { type: "array", items: layerKeyframeSchema },
  },
  required: ["layerId", "ranges", "keyframes"],
  additionalProperties: false,
};

const layerSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    enabled: { type: "boolean" },
    algorithm: { type: "string" },
    intensity: { type: "number", minimum: 0, maximum: 1 },
    params: { type: "object" },
    paletteId: { type: ["string", "null"] },
    order: { type: "integer", minimum: 0 },
  },
  required: ["id", "name", "enabled", "algorithm", "intensity", "params", "order"],
  additionalProperties: false,
};

const paletteSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    colors: {
      type: "array",
      items: {
        type: "array",
        items: { type: "integer", minimum: 0, maximum: 255 },
        minItems: 3,
        maxItems: 3,
      },
    },
  },
  required: ["id", "name", "colors"],
  additionalProperties: false,
};

const assetSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    assetType: { type: "string" },
    storage: { type: "string", enum: ["embedded", "external", "auto"] },
    originalPath: { type: ["string", "null"] },
    hash: { type: ["string", "null"] },
    sizeBytes: { type: "integer", minimum: 0 },
    offline: { type: "boolean" },
  },
  required: ["id", "name", "assetType", "storage", "sizeBytes", "offline"],
  additionalProperties: false,
};

const manifestSchema = {
  type: "object",
  properties: {
    version: { type: "string", pattern: "^\\d+\\.\\d+$" },
    id: { type: "string", format: "uuid" },
    createdAt: { type: "string", format: "date-time" },
    modifiedAt: { type: "string", format: "date-time" },
    name: { type: "string", minLength: 1 },
    description: { type: ["string", "null"] },
    layers: { type: "array", items: layerSchema },
    palettes: { type: "array", items: paletteSchema },
    assets: { type: "array", items: assetSchema },
    animation: { oneOf: [animationSchema, { type: "null" }] },
    videoLayerTracks: { type: "array", items: layerTrackSchema },
  },
  required: ["version", "id", "createdAt", "modifiedAt", "name", "layers", "palettes", "assets"],
};

const validate = ajv.compile(manifestSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateManifest(data: unknown): ValidationResult {
  const valid = validate(data) as boolean;
  const errors = validate.errors
    ? validate.errors.map((e) => `${e.instancePath || "/"} ${e.message}`)
    : [];
  return { valid, errors };
}
