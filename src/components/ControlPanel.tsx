import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MessageText, SettingsCog } from "pixelarticons/react";
import { ICONS } from "@/components/ui/IconLibrary";
import { PaletteColorPopover } from "@/components/PaletteColorPopover";

interface ControlPanelProps {
  isReadOnly?: boolean;
  algorithm: string;
  algorithmOptions: string[];
  setAlgorithm: (value: string) => void;
  palette: string;
  paletteOptions: string[];
  setPalette: (value: string) => void;
  intensity: number;
  setIntensity: (value: number) => void;
  contrast: number;
  setContrast: (value: number) => void;
  brightness: number;
  setBrightness: (value: number) => void;
  saturation: number;
  setSaturation: (value: number) => void;
  pixelSize: number;
  setPixelSize: (value: number) => void;
  blur: number;
  setBlur: (value: number) => void;
  sharpness: number;
  setSharpness: (value: number) => void;
  noise: number;
  setNoise: (value: number) => void;
  blendMode: string;
  setBlendMode: (value: string) => void;
  layerOpacity: number;
  setLayerOpacity: (value: number) => void;
  paletteSwatches: string[];
  onPaletteReorder: (fromIndex: number, toIndex: number) => void;
  onPaletteColorEdit: (index: number, hex: string) => void;
  snapGlitchToPalette: boolean;
  setSnapGlitchToPalette: (value: boolean) => void;
  globalSeed: number;
  setGlobalSeed: (value: number) => void;
  glitchType: "None" | "Pixel Sort" | "Block Noise" | "RGB Shift" | "Slice" | "Analog";
  setGlitchType: (value: "None" | "Pixel Sort" | "Block Noise" | "RGB Shift" | "Slice" | "Analog") => void;
  pixelSortMetric: "luma" | "saturation" | "hue" | "rgb-sum";
  setPixelSortMetric: (value: "luma" | "saturation" | "hue" | "rgb-sum") => void;
  pixelSortMask: "all" | "dark" | "light";
  setPixelSortMask: (value: "all" | "dark" | "light") => void;
  thresholdMin: number;
  setThresholdMin: (value: number) => void;
  thresholdMax: number;
  setThresholdMax: (value: number) => void;
  angle: number;
  setAngle: (value: number) => void;
  sortLength: number;
  setSortLength: (value: number) => void;
  blockSize: number;
  setBlockSize: (value: number) => void;
  chaos: number;
  setChaos: (value: number) => void;
  quantization: number;
  setQuantization: (value: number) => void;
  redShiftX: number;
  setRedShiftX: (value: number) => void;
  redShiftY: number;
  setRedShiftY: (value: number) => void;
  greenShiftX: number;
  setGreenShiftX: (value: number) => void;
  greenShiftY: number;
  setGreenShiftY: (value: number) => void;
  blueShiftX: number;
  setBlueShiftX: (value: number) => void;
  blueShiftY: number;
  setBlueShiftY: (value: number) => void;
  globalRgbShiftIntensity: number;
  setGlobalRgbShiftIntensity: (value: number) => void;
  sliceCount: number;
  setSliceCount: (value: number) => void;
  maxOffset: number;
  setMaxOffset: (value: number) => void;
  randomness: number;
  setRandomness: (value: number) => void;
  scanlineThickness: number;
  setScanlineThickness: (value: number) => void;
  scanlineGap: number;
  setScanlineGap: (value: number) => void;
  flicker: number;
  setFlicker: (value: number) => void;
  curvature: number;
  setCurvature: (value: number) => void;
  paletteMix: number;
  setPaletteMix: (value: number) => void;
  maskTarget: "all" | "edges" | "highlights" | "midtones" | "shadows";
  setMaskTarget: (value: "all" | "edges" | "highlights" | "midtones" | "shadows") => void;
  maskFeather: number;
  setMaskFeather: (value: number) => void;
  cmykSoftProof: boolean;
  setCmykSoftProof: (value: boolean) => void;
  maskR: boolean;
  setMaskR: (value: boolean) => void;
  maskG: boolean;
  setMaskG: (value: boolean) => void;
  maskB: boolean;
  setMaskB: (value: boolean) => void;
  maskA: boolean;
  setMaskA: (value: boolean) => void;
}

type ModuleId = "dither" | "glitch" | "mask" | "channels";

const MODULES: Array<{ id: ModuleId; title: string; subtitle: string; icon: (props: { className?: string; size?: 16 | 18 }) => JSX.Element }> = [
  { id: "dither", title: "Dither", subtitle: "Quantization + palette", icon: ICONS.DITHER },
  { id: "glitch", title: "Glitch", subtitle: "Sort/channel/corruption", icon: ICONS.GLITCH },
  { id: "mask", title: "Masking", subtitle: "Target + feather", icon: ICONS.MASK },
  { id: "channels", title: "Channels", subtitle: "RGBA toggles", icon: ICONS.PROPERTIES },
];

export const ControlPanel = ({
  isReadOnly = false,
  algorithm,
  algorithmOptions,
  setAlgorithm,
  palette,
  paletteOptions,
  setPalette,
  intensity,
  setIntensity,
  contrast,
  setContrast,
  brightness,
  setBrightness,
  saturation,
  setSaturation,
  pixelSize,
  setPixelSize,
  blur,
  setBlur,
  sharpness,
  setSharpness,
  noise,
  setNoise,
  blendMode,
  setBlendMode,
  layerOpacity,
  setLayerOpacity,
  paletteSwatches,
  onPaletteReorder,
  onPaletteColorEdit,
  snapGlitchToPalette,
  setSnapGlitchToPalette,
  globalSeed,
  setGlobalSeed,
  glitchType,
  setGlitchType,
  pixelSortMetric,
  setPixelSortMetric,
  pixelSortMask,
  setPixelSortMask,
  thresholdMin,
  setThresholdMin,
  thresholdMax,
  setThresholdMax,
  angle,
  setAngle,
  sortLength,
  setSortLength,
  blockSize,
  setBlockSize,
  chaos,
  setChaos,
  quantization,
  setQuantization,
  redShiftX,
  setRedShiftX,
  redShiftY,
  setRedShiftY,
  greenShiftX,
  setGreenShiftX,
  greenShiftY,
  setGreenShiftY,
  blueShiftX,
  setBlueShiftX,
  blueShiftY,
  setBlueShiftY,
  globalRgbShiftIntensity,
  setGlobalRgbShiftIntensity,
  sliceCount,
  setSliceCount,
  maxOffset,
  setMaxOffset,
  randomness,
  setRandomness,
  scanlineThickness,
  setScanlineThickness,
  scanlineGap,
  setScanlineGap,
  flicker,
  setFlicker,
  curvature,
  setCurvature,
  paletteMix,
  setPaletteMix,
  maskTarget,
  setMaskTarget,
  maskFeather,
  setMaskFeather,
  cmykSoftProof,
  setCmykSoftProof,
  maskR,
  setMaskR,
  maskG,
  setMaskG,
  maskB,
  setMaskB,
  maskA,
  setMaskA,
}: ControlPanelProps) => {
  const isDitheringDisabled = algorithm === "None";
  const [activeModuleId, setActiveModuleId] = useState<ModuleId>("dither");
  const [draggedModuleId, setDraggedModuleId] = useState<string | null>(null);
  const [draggedPaletteIndex, setDraggedPaletteIndex] = useState<number | null>(null);
  const [editingPaletteIndex, setEditingPaletteIndex] = useState<number | null>(null);
  const [editingPaletteColor, setEditingPaletteColor] = useState<string>("#000000");
  const [blueNoiseEnabled, setBlueNoiseEnabled] = useState(false);

  const [stack, setStack] = useState(MODULES);

  const activeTweaks = [contrast !== 100, brightness !== 100, saturation !== 100, pixelSize !== 1, blur !== 0, sharpness !== 0, noise !== 0].filter(Boolean).length;
  const activeModule = useMemo(() => stack.find((item) => item.id === activeModuleId), [activeModuleId, stack]);

  const Hint = ({ text }: { text: string }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="win95-button win98-icon-button" aria-label="Show hint">
          <MessageText className="h-[11px] w-[11px]" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-relaxed">{text}</TooltipContent>
    </Tooltip>
  );

  const normalizeHex = (value: string): string | null => {
    const trimmed = value.trim();
    const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toUpperCase() : null;
  };

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex flex-col space-y-1">
        {isReadOnly && (
          <div className="win95-border-inset px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-300 bg-amber-900/30 border border-amber-700">
            Layer locked: read-only
          </div>
        )}
        <fieldset disabled={isReadOnly} className="space-y-1 disabled:opacity-80">
        <div className="win98-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="win98-section-title">Controls</div>
              <div className="text-sm font-bold">Dithering & Glitching</div>
            </div>
            <div className="win98-badge">{activeTweaks} tweaks</div>
          </div>
        </div>

        <div className="win98-card space-y-1">
          <div className="win98-section-title flex items-center justify-between gap-2">
            <span>Global & Colors</span>
            <Hint text="Palette, glitch snap-to-palette, and global seed for random parameters." />
          </div>

          <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span>Glitch effect</span>
            <span className="win95-border-inset px-2 py-0.5 text-[10px] text-foreground">
              {glitchType}
            </span>
          </div>

          <div>
            <div className="text-xs font-bold mb-1">Active Palette</div>
            <div className="relative flex flex-wrap gap-1.5">
              {paletteSwatches.map((hex, index) => (
                <div key={`${hex}-${index}`} className="relative h-6 w-6">
                  <button
                    type="button"
                    draggable
                    onDragStart={() => setDraggedPaletteIndex(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggedPaletteIndex === null || draggedPaletteIndex === index) return;
                      onPaletteReorder(draggedPaletteIndex, index);
                      setDraggedPaletteIndex(null);
                    }}
                    onClick={() => {
                      setEditingPaletteIndex(index);
                      setEditingPaletteColor((hex || "#000000").toUpperCase());
                    }}
                    className="h-6 w-6 border border-black/30"
                    title={`${hex} (drag to reorder, click to edit)`}
                    style={{ backgroundColor: hex }}
                  />
                </div>
              ))}

              {editingPaletteIndex !== null && (
                <PaletteColorPopover
                  title={`Edit color #${editingPaletteIndex + 1}`}
                  value={editingPaletteColor}
                  onChange={setEditingPaletteColor}
                  onCancel={() => setEditingPaletteIndex(null)}
                  onApply={() => {
                    const normalized = normalizeHex(editingPaletteColor);
                    if (normalized && editingPaletteIndex !== null) {
                      onPaletteColorEdit(editingPaletteIndex, normalized);
                      setEditingPaletteColor(normalized);
                    }
                    setEditingPaletteIndex(null);
                  }}
                />
              )}
            </div>
          </div>

          <label className="flex items-center justify-between gap-2 text-xs">
            <span>Snap Glitch to Palette</span>
            <input type="checkbox" checked={snapGlitchToPalette} onChange={(event) => setSnapGlitchToPalette(event.target.checked)} />
          </label>

          <label className="flex items-center justify-between gap-2 text-xs">
            <span>CMYK Soft Proof</span>
            <input type="checkbox" checked={cmykSoftProof} onChange={(event) => setCmykSoftProof(event.target.checked)} />
          </label>

          <div className="space-y-2"><div className="flex justify-between text-xs"><span>Palette Mix</span><span>{paletteMix}%</span></div><Slider value={[paletteMix]} onValueChange={(v) => setPaletteMix(v[0])} min={0} max={100} step={1} className="cursor-pointer" /></div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs font-bold">Global Seed</Label>
              <input className="win95-input w-full" type="number" value={globalSeed} onChange={(event) => setGlobalSeed(Number(event.target.value) || 0)} />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="win95-button win98-icon-button" onClick={() => setGlobalSeed(Math.floor(Math.random() * 1_000_000))} aria-label="Randomize seed">
                  <ICONS.RANDOMIZE />
                </button>
              </TooltipTrigger>
              <TooltipContent>Randomize seed</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="win98-card space-y-1">
          <div className="win98-section-title">Processing Stack</div>
          <div className="flex items-center gap-1">
            {stack.map((item, idx) => {
              const ItemIcon = item.icon;
              return (
                <div key={item.id} className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        draggable
                        onDragStart={() => setDraggedModuleId(item.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (!draggedModuleId || draggedModuleId === item.id) return;
                          setStack((prev) => {
                            const from = prev.findIndex((entry) => entry.id === draggedModuleId);
                            const to = prev.findIndex((entry) => entry.id === item.id);
                            if (from < 0 || to < 0) return prev;
                            const next = [...prev];
                            const [moved] = next.splice(from, 1);
                            next.splice(to, 0, moved);
                            return next;
                          });
                          setDraggedModuleId(null);
                        }}
                        onClick={() => setActiveModuleId(item.id)}
                        className={`win95-button win98-icon-button ${activeModuleId === item.id ? "bg-primary text-primary-foreground" : ""}`}
                        aria-label={item.title}
                      >
                        <ItemIcon />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{item.title} · {item.subtitle}</TooltipContent>
                  </Tooltip>
                  {idx < stack.length - 1 && <div className="win98-icon-separator" aria-hidden="true" />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="win98-card space-y-1">
          <div className="win98-section-title flex items-center justify-between gap-2">
            <span className="flex items-center gap-2"><SettingsCog className="h-3 w-3" /> Detailed Settings</span>
            <div className="win98-badge">{activeModule?.title ?? "Module"}</div>
          </div>

          {activeModuleId === "dither" && (
            <>
              <label className="text-sm font-bold block">Algorithm Type</label>
              <Select value={algorithm} onValueChange={setAlgorithm}>
                <SelectTrigger className="win95-input bg-input"><SelectValue /></SelectTrigger>
                <SelectContent className="win95-window">
                  {algorithmOptions.map((alg) => (<SelectItem key={alg} value={alg}>{alg}</SelectItem>))}
                </SelectContent>
              </Select>

              <Label className="text-sm font-bold">Color Palette</Label>
              <Select value={palette} onValueChange={setPalette}>
                <SelectTrigger className="win95-input bg-input"><SelectValue /></SelectTrigger>
                <SelectContent className="win95-window">
                  {paletteOptions.map((pal) => (<SelectItem key={pal} value={pal}>{pal}</SelectItem>))}
                </SelectContent>
              </Select>

              {isDitheringDisabled ? (
                <div className="text-[11px] text-muted-foreground win95-border p-2 space-y-1">
                  <div>
                    Dithering is disabled. Preview and final render will keep source colors, while adjustments,
                    pixel scaling, blur, sharpness, and noise still apply.
                  </div>
                  <div>
                    Palette selection is preserved (including Custom) and will apply as soon as dithering is enabled.
                  </div>
                </div>
              ) : null}

              <div className="space-y-2"><div className="flex justify-between text-xs"><span>Scale / Resolution</span><span>{pixelSize}x</span></div><Slider value={[pixelSize]} onValueChange={(v) => setPixelSize(v[0])} min={1} max={16} step={1} className="cursor-pointer" /></div>
              {!isDitheringDisabled && (
                <label className="flex items-center justify-between gap-2 text-xs"><span>Use Blue Noise Texture</span><input type="checkbox" checked={blueNoiseEnabled} onChange={(event) => setBlueNoiseEnabled(event.target.checked)} /></label>
              )}

              {!isDitheringDisabled && (
                <div className="space-y-2"><div className="flex justify-between text-xs"><span>Intensity</span><span>{intensity}%</span></div><Slider value={[intensity]} onValueChange={(v) => setIntensity(v[0])} min={0} max={100} step={1} className="cursor-pointer" /></div>
              )}
              <div className="space-y-2"><div className="flex justify-between text-xs"><span>Contrast</span><span>{contrast}%</span></div><Slider value={[contrast]} onValueChange={(v) => setContrast(v[0])} min={0} max={200} step={1} className="cursor-pointer" /></div>
              <div className="space-y-2"><div className="flex justify-between text-xs"><span>Brightness</span><span>{brightness}%</span></div><Slider value={[brightness]} onValueChange={(v) => setBrightness(v[0])} min={0} max={200} step={1} className="cursor-pointer" /></div>
              <div className="space-y-2"><div className="flex justify-between text-xs"><span>Saturation</span><span>{saturation}%</span></div><Slider value={[saturation]} onValueChange={(v) => setSaturation(v[0])} min={0} max={200} step={1} className="cursor-pointer" /></div>
            </>
          )}

          {activeModuleId === "glitch" && (
            <>
              <Label className="text-sm font-bold">Glitch Type</Label>
              <Select value={glitchType} onValueChange={(value: "None" | "Pixel Sort" | "Block Noise" | "RGB Shift" | "Slice" | "Analog") => setGlitchType(value)}>
                <SelectTrigger className="win95-input bg-input"><SelectValue /></SelectTrigger>
                <SelectContent className="win95-window">
                  <SelectItem value="None">None</SelectItem>
                  <SelectItem value="Pixel Sort">Pixel Sort</SelectItem>
                  <SelectItem value="Block Noise">Block Noise</SelectItem>
                  <SelectItem value="RGB Shift">RGB Shift</SelectItem>
                  <SelectItem value="Slice">Slice</SelectItem>
                  <SelectItem value="Analog">Analog</SelectItem>
                </SelectContent>
              </Select>

              {glitchType === "Pixel Sort" && (
                <>
                  <Label className="text-xs font-bold">Sort By</Label>
                  <Select value={pixelSortMetric} onValueChange={(value: "luma" | "saturation" | "hue" | "rgb-sum") => setPixelSortMetric(value)}>
                    <SelectTrigger className="win95-input bg-input"><SelectValue /></SelectTrigger>
                    <SelectContent className="win95-window">
                      <SelectItem value="luma">Luma</SelectItem>
                      <SelectItem value="saturation">Saturation</SelectItem>
                      <SelectItem value="hue">Hue</SelectItem>
                      <SelectItem value="rgb-sum">RGB Sum</SelectItem>
                    </SelectContent>
                  </Select>

                  <Label className="text-xs font-bold">Masking</Label>
                  <Select value={pixelSortMask} onValueChange={(value: "all" | "dark" | "light") => setPixelSortMask(value)}>
                    <SelectTrigger className="win95-input bg-input"><SelectValue /></SelectTrigger>
                    <SelectContent className="win95-window">
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="dark">Dark only</SelectItem>
                      <SelectItem value="light">Light only</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Threshold Min</span><span>{thresholdMin}%</span></div><Slider value={[thresholdMin]} onValueChange={(v) => setThresholdMin(Math.min(v[0], thresholdMax))} min={0} max={100} step={1} className="cursor-pointer" /></div>
                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Threshold Max</span><span>{thresholdMax}%</span></div><Slider value={[thresholdMax]} onValueChange={(v) => setThresholdMax(Math.max(v[0], thresholdMin))} min={0} max={100} step={1} className="cursor-pointer" /></div>
                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Direction Angle</span><span>{angle}°</span></div><Slider value={[angle]} onValueChange={(v) => setAngle(v[0])} min={0} max={360} step={1} className="cursor-pointer" /></div>
                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Sort Length</span><span>{sortLength}px</span></div><Slider value={[sortLength]} onValueChange={(v) => setSortLength(v[0])} min={2} max={256} step={1} className="cursor-pointer" /></div>
                </>
              )}

              {glitchType === "Block Noise" && (
                <>
                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Block Size</span><span>{blockSize}px</span></div><Slider value={[blockSize]} onValueChange={(v) => setBlockSize(v[0])} min={2} max={64} step={1} className="cursor-pointer" /></div>
                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Chaos</span><span>{chaos}%</span></div><Slider value={[chaos]} onValueChange={(v) => setChaos(v[0])} min={0} max={100} step={1} className="cursor-pointer" /></div>
                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Quantization</span><span>{quantization}%</span></div><Slider value={[quantization]} onValueChange={(v) => setQuantization(v[0])} min={0} max={100} step={1} className="cursor-pointer" /></div>
                </>
              )}

              {glitchType === "RGB Shift" && (
                <>
                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Global Intensity</span><span>{globalRgbShiftIntensity}%</span></div><Slider value={[globalRgbShiftIntensity]} onValueChange={(v) => setGlobalRgbShiftIntensity(v[0])} min={0} max={100} step={1} className="cursor-pointer" /></div>
                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Red X/Y</span><span>{redShiftX}, {redShiftY}</span></div><Slider value={[redShiftX]} onValueChange={(v) => setRedShiftX(v[0])} min={-50} max={50} step={1} className="cursor-pointer" /><Slider value={[redShiftY]} onValueChange={(v) => setRedShiftY(v[0])} min={-50} max={50} step={1} className="cursor-pointer" /></div>
                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Green X/Y</span><span>{greenShiftX}, {greenShiftY}</span></div><Slider value={[greenShiftX]} onValueChange={(v) => setGreenShiftX(v[0])} min={-50} max={50} step={1} className="cursor-pointer" /><Slider value={[greenShiftY]} onValueChange={(v) => setGreenShiftY(v[0])} min={-50} max={50} step={1} className="cursor-pointer" /></div>
                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Blue X/Y</span><span>{blueShiftX}, {blueShiftY}</span></div><Slider value={[blueShiftX]} onValueChange={(v) => setBlueShiftX(v[0])} min={-50} max={50} step={1} className="cursor-pointer" /><Slider value={[blueShiftY]} onValueChange={(v) => setBlueShiftY(v[0])} min={-50} max={50} step={1} className="cursor-pointer" /></div>
                </>
              )}

              {glitchType === "Slice" && (
                <>
                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Count</span><span>{sliceCount}</span></div><Slider value={[sliceCount]} onValueChange={(v) => setSliceCount(v[0])} min={1} max={120} step={1} className="cursor-pointer" /></div>
                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Max Offset</span><span>{maxOffset}px</span></div><Slider value={[maxOffset]} onValueChange={(v) => setMaxOffset(v[0])} min={0} max={200} step={1} className="cursor-pointer" /></div>
                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Randomness</span><span>{randomness}%</span></div><Slider value={[randomness]} onValueChange={(v) => setRandomness(v[0])} min={0} max={100} step={1} className="cursor-pointer" /></div>
                </>
              )}

              {glitchType === "Analog" && (
                <>
                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Line Thickness</span><span>{scanlineThickness}px</span></div><Slider value={[scanlineThickness]} onValueChange={(v) => setScanlineThickness(v[0])} min={1} max={8} step={1} className="cursor-pointer" /></div>
                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Gap Size</span><span>{scanlineGap}px</span></div><Slider value={[scanlineGap]} onValueChange={(v) => setScanlineGap(v[0])} min={1} max={12} step={1} className="cursor-pointer" /></div>
                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Flicker</span><span>{flicker}%</span></div><Slider value={[flicker]} onValueChange={(v) => setFlicker(v[0])} min={0} max={100} step={1} className="cursor-pointer" /></div>
                  <div className="space-y-2"><div className="flex justify-between text-xs"><span>Curvature</span><span>{curvature}%</span></div><Slider value={[curvature]} onValueChange={(v) => setCurvature(v[0])} min={0} max={100} step={1} className="cursor-pointer" /></div>
                </>
              )}

              <div className="space-y-2"><div className="flex justify-between text-xs"><span>Blur</span><span>{blur}</span></div><Slider value={[blur]} onValueChange={(v) => setBlur(v[0])} min={0} max={10} step={1} className="cursor-pointer" /></div>
              <div className="space-y-2"><div className="flex justify-between text-xs"><span>Sharpness</span><span>{sharpness}%</span></div><Slider value={[sharpness]} onValueChange={(v) => setSharpness(v[0])} min={0} max={200} step={1} className="cursor-pointer" /></div>
              <div className="space-y-2"><div className="flex justify-between text-xs"><span>Noise</span><span>{noise}</span></div><Slider value={[noise]} onValueChange={(v) => setNoise(v[0])} min={0} max={50} step={1} className="cursor-pointer" /></div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs"><span>Blend Mode</span><span>{blendMode}</span></div>
                <Select value={blendMode} onValueChange={setBlendMode}>
                  <SelectTrigger className="win95-input bg-input"><SelectValue /></SelectTrigger>
                  <SelectContent className="win95-window">
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="multiply">Multiply</SelectItem>
                    <SelectItem value="screen">Screen</SelectItem>
                    <SelectItem value="overlay">Overlay</SelectItem>
                    <SelectItem value="add">Add</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2"><div className="flex justify-between text-xs"><span>Layer Opacity</span><span>{layerOpacity}%</span></div><Slider value={[layerOpacity]} onValueChange={(v) => setLayerOpacity(v[0])} min={0} max={100} step={1} className="cursor-pointer" /></div>
            </>
          )}

          {activeModuleId === "mask" && (
            <>
              <div className="space-y-2">
                <div className="flex justify-between text-xs"><span>Target</span><span>{maskTarget}</span></div>
                <Select value={maskTarget} onValueChange={(value: "all" | "edges" | "highlights" | "midtones" | "shadows") => setMaskTarget(value)}>
                  <SelectTrigger className="win95-input bg-input"><SelectValue /></SelectTrigger>
                  <SelectContent className="win95-window">
                    <SelectItem value="all">All (no mask)</SelectItem>
                    <SelectItem value="edges">Edges</SelectItem>
                    <SelectItem value="highlights">Highlights</SelectItem>
                    <SelectItem value="midtones">Midtones</SelectItem>
                    <SelectItem value="shadows">Shadows</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><div className="flex justify-between text-xs"><span>Feather</span><span>{maskFeather.toFixed(2)}</span></div><Slider value={[maskFeather]} onValueChange={(v) => setMaskFeather(v[0])} min={0} max={1} step={0.01} className="cursor-pointer" /></div>
            </>
          )}

          {activeModuleId === "channels" && (
            <>
              <div className="text-[11px] text-muted-foreground win95-border p-2">
                Toggle RGBA channels for inspection, stylization, and print-safe previews. This affects rendering, not the source file.
              </div>

              <div className="win95-border-inset p-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">RGBA</span>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {([
                    { key: "R", on: maskR, set: setMaskR, onBg: "bg-red-600", onText: "text-white" },
                    { key: "G", on: maskG, set: setMaskG, onBg: "bg-green-600", onText: "text-white" },
                    { key: "B", on: maskB, set: setMaskB, onBg: "bg-blue-600", onText: "text-white" },
                    { key: "A", on: maskA, set: setMaskA, onBg: "bg-slate-700", onText: "text-white" },
                  ] as const).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => item.set(!item.on)}
                      className={[
                        "win95-border-inset",
                        "h-12 w-full",
                        "flex items-center justify-center",
                        "font-bold text-sm select-none",
                        "transition-colors",
                        item.on ? `${item.onBg} ${item.onText}` : "bg-muted text-muted-foreground",
                      ].join(" ")}
                      aria-pressed={item.on}
                      aria-label={`Toggle ${item.key} channel`}
                      title={item.on ? `${item.key} channel enabled` : `${item.key} channel disabled`}
                    >
                      {item.key}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        </fieldset>
      </div>
    </TooltipProvider>
  );
};
