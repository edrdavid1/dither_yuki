// Per-frame settings for the animation editor.
// Stored in a Map<frameId, FrameSettings> inside a React ref —
// this avoids re-rendering on every settings mutation while keeping
// all frame configurations in memory.

export interface FrameSettings {
  algorithm: string;
  palette: string;
  customPalette?: [number, number, number][];
  intensity: number;
  contrast: number;
  brightness: number;
  saturation: number;
  pixelSize: number;
  blur: number;
  sharpness: number;
  noise: number;
  blendMode: string;
  layerOpacity: number;
  glitchType: string;
  pixelSortMetric: string;
  pixelSortMask: string;
  thresholdMin: number;
  thresholdMax: number;
  angle: number;
  sortLength: number;
  blockSize: number;
  chaos: number;
  quantization: number;
  redShiftX: number;
  redShiftY: number;
  greenShiftX: number;
  greenShiftY: number;
  blueShiftX: number;
  blueShiftY: number;
  globalRgbShiftIntensity: number;
  sliceCount: number;
  maxOffset: number;
  randomness: number;
  scanlineThickness: number;
  scanlineGap: number;
  flicker: number;
  curvature: number;
  snapGlitchToPalette: boolean;
  globalSeed: number;
  paletteMix: number;
  maskTarget: string;
  maskFeather: number;
  // Channel Mask parameters
  maskR: boolean;
  maskG: boolean;
  maskB: boolean;
  maskA: boolean;
}

export const DEFAULT_FRAME_SETTINGS: FrameSettings = {
  algorithm: "Floyd-Steinberg",
  palette: "Grayscale",
  customPalette: undefined,
  intensity: 100,
  contrast: 100,
  brightness: 100,
  saturation: 100,
  pixelSize: 1,
  blur: 0,
  sharpness: 0,
  noise: 0,
  blendMode: "normal",
  layerOpacity: 100,
  glitchType: "None",
  pixelSortMetric: "luma",
  pixelSortMask: "all",
  thresholdMin: 20,
  thresholdMax: 80,
  angle: 0,
  sortLength: 64,
  blockSize: 16,
  chaos: 40,
  quantization: 45,
  redShiftX: 4,
  redShiftY: 0,
  greenShiftX: 0,
  greenShiftY: 0,
  blueShiftX: -4,
  blueShiftY: 0,
  globalRgbShiftIntensity: 70,
  sliceCount: 14,
  maxOffset: 48,
  randomness: 50,
  scanlineThickness: 1,
  scanlineGap: 2,
  flicker: 16,
  curvature: 12,
  snapGlitchToPalette: false,
  globalSeed: 1337,
  paletteMix: 100,
  maskTarget: "all",
  maskFeather: 0.2,
  maskR: true,
  maskG: true,
  maskB: true,
  maskA: true,
};

/** Linear interpolation between two FrameSettings for a given t ∈ [0, 1]. */
export function lerpFrameSettings(a: FrameSettings, b: FrameSettings, t: number): FrameSettings {
  const lerp = (va: number, vb: number) => va + (vb - va) * t;
  // Strings: snap at t = 0.5
  const pick = <T>(va: T, vb: T) => (t < 0.5 ? va : vb);
  return {
    algorithm: pick(a.algorithm, b.algorithm),
    palette: pick(a.palette, b.palette),
    customPalette: pick(a.customPalette, b.customPalette),
    intensity: lerp(a.intensity, b.intensity),
    contrast: lerp(a.contrast, b.contrast),
    brightness: lerp(a.brightness, b.brightness),
    saturation: lerp(a.saturation, b.saturation),
    pixelSize: Math.round(lerp(a.pixelSize, b.pixelSize)),
    blur: lerp(a.blur, b.blur),
    sharpness: lerp(a.sharpness, b.sharpness),
    noise: lerp(a.noise, b.noise),
    blendMode: pick(a.blendMode, b.blendMode),
    layerOpacity: lerp(a.layerOpacity, b.layerOpacity),
    glitchType: pick(a.glitchType, b.glitchType),
    pixelSortMetric: pick(a.pixelSortMetric, b.pixelSortMetric),
    pixelSortMask: pick(a.pixelSortMask, b.pixelSortMask),
    thresholdMin: lerp(a.thresholdMin, b.thresholdMin),
    thresholdMax: lerp(a.thresholdMax, b.thresholdMax),
    angle: lerp(a.angle, b.angle),
    sortLength: Math.round(lerp(a.sortLength, b.sortLength)),
    blockSize: Math.round(lerp(a.blockSize, b.blockSize)),
    chaos: lerp(a.chaos, b.chaos),
    quantization: lerp(a.quantization, b.quantization),
    redShiftX: Math.round(lerp(a.redShiftX, b.redShiftX)),
    redShiftY: Math.round(lerp(a.redShiftY, b.redShiftY)),
    greenShiftX: Math.round(lerp(a.greenShiftX, b.greenShiftX)),
    greenShiftY: Math.round(lerp(a.greenShiftY, b.greenShiftY)),
    blueShiftX: Math.round(lerp(a.blueShiftX, b.blueShiftX)),
    blueShiftY: Math.round(lerp(a.blueShiftY, b.blueShiftY)),
    globalRgbShiftIntensity: lerp(a.globalRgbShiftIntensity, b.globalRgbShiftIntensity),
    sliceCount: Math.round(lerp(a.sliceCount, b.sliceCount)),
    maxOffset: Math.round(lerp(a.maxOffset, b.maxOffset)),
    randomness: lerp(a.randomness, b.randomness),
    scanlineThickness: Math.round(lerp(a.scanlineThickness, b.scanlineThickness)),
    scanlineGap: Math.round(lerp(a.scanlineGap, b.scanlineGap)),
    flicker: lerp(a.flicker, b.flicker),
    curvature: lerp(a.curvature, b.curvature),
    snapGlitchToPalette: pick(a.snapGlitchToPalette, b.snapGlitchToPalette),
    globalSeed: pick(a.globalSeed, b.globalSeed),
    paletteMix: lerp(a.paletteMix, b.paletteMix),
    maskTarget: pick(a.maskTarget, b.maskTarget),
    maskFeather: lerp(a.maskFeather, b.maskFeather),
    maskR: pick(a.maskR, b.maskR),
    maskG: pick(a.maskG, b.maskG),
    maskB: pick(a.maskB, b.maskB),
    maskA: pick(a.maskA, b.maskA),
  };
}
