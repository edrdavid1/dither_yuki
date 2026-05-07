import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ColorPalette, DitheringAlgorithm } from "@/types/layers";
import type { FrameSettings } from "@/types/frameSettings";

export interface EditorControlSyncValues {
  algorithm: DitheringAlgorithm;
  palette: ColorPalette;
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
}

export interface EditorControlSyncSetters {
  setAlgorithm: Dispatch<SetStateAction<DitheringAlgorithm>>;
  setPalette: Dispatch<SetStateAction<ColorPalette>>;
  setIntensity: Dispatch<SetStateAction<number>>;
  setContrast: Dispatch<SetStateAction<number>>;
  setBrightness: Dispatch<SetStateAction<number>>;
  setSaturation: Dispatch<SetStateAction<number>>;
  setPixelSize: Dispatch<SetStateAction<number>>;
  setBlur: Dispatch<SetStateAction<number>>;
  setSharpness: Dispatch<SetStateAction<number>>;
  setNoise: Dispatch<SetStateAction<number>>;
  setBlendMode: Dispatch<SetStateAction<string>>;
  setLayerOpacity: Dispatch<SetStateAction<number>>;
  setGlitchType: Dispatch<SetStateAction<string>>;
  setPixelSortMetric: Dispatch<SetStateAction<string>>;
  setPixelSortMask: Dispatch<SetStateAction<string>>;
  setThresholdMin: Dispatch<SetStateAction<number>>;
  setThresholdMax: Dispatch<SetStateAction<number>>;
  setAngle: Dispatch<SetStateAction<number>>;
  setSortLength: Dispatch<SetStateAction<number>>;
  setBlockSize: Dispatch<SetStateAction<number>>;
  setChaos: Dispatch<SetStateAction<number>>;
  setQuantization: Dispatch<SetStateAction<number>>;
  setRedShiftX: Dispatch<SetStateAction<number>>;
  setRedShiftY: Dispatch<SetStateAction<number>>;
  setGreenShiftX: Dispatch<SetStateAction<number>>;
  setGreenShiftY: Dispatch<SetStateAction<number>>;
  setBlueShiftX: Dispatch<SetStateAction<number>>;
  setBlueShiftY: Dispatch<SetStateAction<number>>;
  setGlobalRgbShiftIntensity: Dispatch<SetStateAction<number>>;
  setSliceCount: Dispatch<SetStateAction<number>>;
  setMaxOffset: Dispatch<SetStateAction<number>>;
  setRandomness: Dispatch<SetStateAction<number>>;
  setScanlineThickness: Dispatch<SetStateAction<number>>;
  setScanlineGap: Dispatch<SetStateAction<number>>;
  setFlicker: Dispatch<SetStateAction<number>>;
  setCurvature: Dispatch<SetStateAction<number>>;
  setSnapGlitchToPalette: Dispatch<SetStateAction<boolean>>;
  setGlobalSeed: Dispatch<SetStateAction<number>>;
  setPaletteMix: Dispatch<SetStateAction<number>>;
  setMaskTarget: Dispatch<SetStateAction<string>>;
  setMaskFeather: Dispatch<SetStateAction<number>>;
}

export interface UseEditorControlSyncArgs {
  values: EditorControlSyncValues;
  setters: EditorControlSyncSetters;
}

export function useEditorControlSync({ values, setters }: UseEditorControlSyncArgs) {
  const editHistoryRef = useRef<FrameSettings[]>([]);
  const historyIndexRef = useRef(-1);
  const isApplyingHistoryRef = useRef(false);
  const pendingSnapshotRef = useRef<FrameSettings | null>(null);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommittedHashRef = useRef("");
  const prevAlgorithmRef = useRef(values.algorithm);
  const prevPaletteRef = useRef(values.palette);

  const pushHistorySnapshot = useCallback((snapshot: FrameSettings) => {
    const hash = JSON.stringify(snapshot);
    if (hash === lastCommittedHashRef.current) return;
    lastCommittedHashRef.current = hash;
    editHistoryRef.current = editHistoryRef.current.slice(0, historyIndexRef.current + 1);
    editHistoryRef.current.push(snapshot);
    if (editHistoryRef.current.length > 50) {
      editHistoryRef.current.shift();
    } else {
      historyIndexRef.current += 1;
    }
  }, []);

  const captureEffectParams = useCallback((): FrameSettings => ({
    algorithm: values.algorithm,
    palette: values.palette,
    intensity: values.intensity,
    contrast: values.contrast,
    brightness: values.brightness,
    saturation: values.saturation,
    pixelSize: values.pixelSize,
    blur: values.blur,
    sharpness: values.sharpness,
    noise: values.noise,
    blendMode: values.blendMode,
    layerOpacity: values.layerOpacity,
    glitchType: values.glitchType,
    pixelSortMetric: values.pixelSortMetric,
    pixelSortMask: values.pixelSortMask,
    thresholdMin: values.thresholdMin,
    thresholdMax: values.thresholdMax,
    angle: values.angle,
    sortLength: values.sortLength,
    blockSize: values.blockSize,
    chaos: values.chaos,
    quantization: values.quantization,
    redShiftX: values.redShiftX,
    redShiftY: values.redShiftY,
    greenShiftX: values.greenShiftX,
    greenShiftY: values.greenShiftY,
    blueShiftX: values.blueShiftX,
    blueShiftY: values.blueShiftY,
    globalRgbShiftIntensity: values.globalRgbShiftIntensity,
    sliceCount: values.sliceCount,
    maxOffset: values.maxOffset,
    randomness: values.randomness,
    scanlineThickness: values.scanlineThickness,
    scanlineGap: values.scanlineGap,
    flicker: values.flicker,
    curvature: values.curvature,
    snapGlitchToPalette: values.snapGlitchToPalette,
    globalSeed: values.globalSeed,
    paletteMix: values.paletteMix,
    maskTarget: values.maskTarget,
    maskFeather: values.maskFeather,
  }), [values]);

  const applyEffectParams = useCallback((params: Partial<FrameSettings>) => {
    setters.setAlgorithm(String(params.algorithm ?? "Floyd-Steinberg") as DitheringAlgorithm);
    setters.setPalette(String(params.palette ?? "Grayscale") as ColorPalette);
    setters.setIntensity(Number(params.intensity ?? 100));
    setters.setContrast(Number(params.contrast ?? 100));
    setters.setBrightness(Number(params.brightness ?? 100));
    setters.setSaturation(Number(params.saturation ?? 100));
    setters.setPixelSize(Number(params.pixelSize ?? 1));
    setters.setBlur(Number(params.blur ?? 0));
    setters.setSharpness(Number(params.sharpness ?? 0));
    setters.setNoise(Number(params.noise ?? 0));
    setters.setBlendMode(String(params.blendMode ?? "normal"));
    setters.setLayerOpacity(Number(params.layerOpacity ?? 100));
    setters.setGlitchType(String(params.glitchType ?? "None"));
    setters.setPixelSortMetric(String(params.pixelSortMetric ?? "luma"));
    setters.setPixelSortMask(String(params.pixelSortMask ?? "all"));
    setters.setThresholdMin(Number(params.thresholdMin ?? 20));
    setters.setThresholdMax(Number(params.thresholdMax ?? 80));
    setters.setAngle(Number(params.angle ?? 0));
    setters.setSortLength(Number(params.sortLength ?? 64));
    setters.setBlockSize(Number(params.blockSize ?? 16));
    setters.setChaos(Number(params.chaos ?? 40));
    setters.setQuantization(Number(params.quantization ?? 45));
    setters.setRedShiftX(Number(params.redShiftX ?? 4));
    setters.setRedShiftY(Number(params.redShiftY ?? 0));
    setters.setGreenShiftX(Number(params.greenShiftX ?? 0));
    setters.setGreenShiftY(Number(params.greenShiftY ?? 0));
    setters.setBlueShiftX(Number(params.blueShiftX ?? -4));
    setters.setBlueShiftY(Number(params.blueShiftY ?? 0));
    setters.setGlobalRgbShiftIntensity(Number(params.globalRgbShiftIntensity ?? 70));
    setters.setSliceCount(Number(params.sliceCount ?? 14));
    setters.setMaxOffset(Number(params.maxOffset ?? 48));
    setters.setRandomness(Number(params.randomness ?? 50));
    setters.setScanlineThickness(Number(params.scanlineThickness ?? 1));
    setters.setScanlineGap(Number(params.scanlineGap ?? 2));
    setters.setFlicker(Number(params.flicker ?? 16));
    setters.setCurvature(Number(params.curvature ?? 12));
    setters.setSnapGlitchToPalette(Boolean(params.snapGlitchToPalette ?? false));
    setters.setGlobalSeed(Number(params.globalSeed ?? 1337));
    setters.setPaletteMix(Number(params.paletteMix ?? 100));
    setters.setMaskTarget(String(params.maskTarget ?? "all"));
    setters.setMaskFeather(Number(params.maskFeather ?? 0.2));
  }, [setters]);

  useEffect(() => {
    if (historyIndexRef.current >= 0) return;
    pushHistorySnapshot(captureEffectParams());
  }, [captureEffectParams, pushHistorySnapshot]);

  useEffect(() => {
    if (isApplyingHistoryRef.current) {
      isApplyingHistoryRef.current = false;
      return;
    }

    const isDiscreteChange = prevAlgorithmRef.current !== values.algorithm || prevPaletteRef.current !== values.palette;
    prevAlgorithmRef.current = values.algorithm;
    prevPaletteRef.current = values.palette;

    pendingSnapshotRef.current = captureEffectParams();

    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);

    if (isDiscreteChange) {
      historyTimerRef.current = null;
      pushHistorySnapshot(pendingSnapshotRef.current);
    } else {
      historyTimerRef.current = setTimeout(() => {
        historyTimerRef.current = null;
        if (pendingSnapshotRef.current) pushHistorySnapshot(pendingSnapshotRef.current);
      }, 600);
    }
  }, [
    values,
    captureEffectParams,
    pushHistorySnapshot,
  ]);

  useEffect(() => () => {
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }
  }, []);

  const handleUndo = useCallback(() => {
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
      if (pendingSnapshotRef.current) pushHistorySnapshot(pendingSnapshotRef.current);
    }

    if (historyIndexRef.current <= 0) {
      return false;
    }

    isApplyingHistoryRef.current = true;
    historyIndexRef.current -= 1;
    const prev = editHistoryRef.current[historyIndexRef.current];
    if (prev) applyEffectParams(prev);
    return true;
  }, [applyEffectParams, pushHistorySnapshot]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= editHistoryRef.current.length - 1) {
      return false;
    }

    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }

    isApplyingHistoryRef.current = true;
    historyIndexRef.current += 1;
    const next = editHistoryRef.current[historyIndexRef.current];
    if (next) applyEffectParams(next);
    return true;
  }, [applyEffectParams]);

  return { captureEffectParams, applyEffectParams, handleUndo, handleRedo };
}
