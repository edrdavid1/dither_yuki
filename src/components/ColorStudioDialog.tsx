import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { X } from "lucide-react";
import { Camera, ChevronsVertical, Delete, Download, Plus, Repeat, Upload } from "pixelarticons/react";
import { PaletteColorPopover } from "@/components/PaletteColorPopover";

interface ColorStudioDialogProps {
  initialColors?: string[];
  quantizationMethod: string;
  setQuantizationMethod: (value: string) => void;
  quantizationColorCount: number;
  setQuantizationColorCount: (value: number) => void;
  canAutoQuantize: boolean;
  canExtractFromOriginal: boolean;
  isQuantizing: boolean;
  onExtractFromImage: () => Promise<string[] | null>;
  onExtractFromOriginal: () => Promise<string[] | null>;
  onImportPalette: () => Promise<string[] | null>;
  onExportPalette: () => Promise<void>;
  onSave: (colors: string[]) => void;
  onClose: () => void;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
};

const rgbToHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b]
    .map((x) => {
      const hex = Math.round(x).toString(16);
      return hex.length === 1 ? `0${hex}` : hex;
    })
    .join("")}`;

const getBrightness = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000;
};

export const ColorStudioDialog = ({
  initialColors = ["#000000", "#FFFFFF"],
  quantizationMethod,
  setQuantizationMethod,
  quantizationColorCount,
  setQuantizationColorCount,
  canAutoQuantize,
  canExtractFromOriginal,
  isQuantizing,
  onExtractFromImage,
  onExtractFromOriginal,
  onImportPalette,
  onExportPalette,
  onSave,
  onClose,
}: ColorStudioDialogProps) => {
  const [colors, setColors] = useState<string[]>(initialColors);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [colorSteps, setColorSteps] = useState<number>(initialColors.length);
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);
  const [editingColorValue, setEditingColorValue] = useState<string>("#000000");

  useEffect(() => {
    const incoming = initialColors.length >= 2 ? initialColors : ["#000000", "#FFFFFF"];
    setColors(incoming);
    setColorSteps(incoming.length);
    setEditingColorIndex(null);
  }, [initialColors]);

  useEffect(() => {
    if (colorSteps === colors.length) {
      return;
    }

    if (colorSteps > colors.length) {
      const newColors = [...colors];
      while (newColors.length < colorSteps) {
        newColors.push(newColors[newColors.length - 1] ?? "#808080");
      }
      setColors(newColors);
      return;
    }

    setColors(colors.slice(0, colorSteps));
  }, [colorSteps, colors]);

  const previewTitle = useMemo(
    () => `${colors.length} colors • ${quantizationMethod} • target ${quantizationColorCount}`,
    [colors.length, quantizationMethod, quantizationColorCount],
  );

  const handleColorChange = (index: number, color: string) => {
    const newColors = [...colors];
    newColors[index] = color;
    setColors(newColors);
  };

  const normalizeHex = (value: string): string | null => {
    const trimmed = value.trim();
    const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toUpperCase() : null;
  };

  const handleAddColor = () => {
    setColors([...colors, "#808080"]);
    setColorSteps(colors.length + 1);
  };

  const handleRemoveColor = (index: number) => {
    if (colors.length <= 2) {
      return;
    }

    const newColors = colors.filter((_, i) => i !== index);
    setColors(newColors);
    setColorSteps(newColors.length);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (event: React.DragEvent, index: number) => {
    event.preventDefault();
    if (draggedIndex === null || draggedIndex === index) {
      return;
    }

    const newColors = [...colors];
    const draggedColor = newColors[draggedIndex];
    newColors.splice(draggedIndex, 1);
    if (draggedColor) {
      newColors.splice(index, 0, draggedColor);
    }
    setColors(newColors);
    setDraggedIndex(index);
  };

  const handleSortByBrightness = () => {
    setColors([...colors].sort((a, b) => getBrightness(a) - getBrightness(b)));
  };

  const handleInterpolate = () => {
    if (colors.length < 2) {
      return;
    }

    const newColors = [...colors];
    const first = hexToRgb(colors[0] ?? "#000000");
    const last = hexToRgb(colors[colors.length - 1] ?? "#ffffff");

    for (let i = 1; i < colors.length - 1; i += 1) {
      const t = i / (colors.length - 1);
      const r = first[0] + (last[0] - first[0]) * t;
      const g = first[1] + (last[1] - first[1]) * t;
      const b = first[2] + (last[2] - first[2]) * t;
      newColors[i] = rgbToHex(r, g, b);
    }

    setColors(newColors);
  };

  const handleExtractPalette = async () => {
    const extracted = await onExtractFromImage();
    if (!extracted?.length) {
      return;
    }

    setColors(extracted);
    setColorSteps(extracted.length);
  };

  const handleExtractOriginalPalette = async () => {
    const extracted = await onExtractFromOriginal();
    if (!extracted?.length) {
      return;
    }
    setColors(extracted);
    setColorSteps(extracted.length);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="win95-window max-h-[92vh] w-full max-w-3xl flex flex-col overflow-hidden">
        <div className="win95-titlebar">
          <span className="text-sm font-bold">Color Studio</span>
          <button className="border border-win95-light bg-card px-2 text-xs hover:bg-muted" onClick={onClose}>
            <X className="h-3 w-3" />
          </button>
        </div>

        <div className="flex flex-col space-y-4 p-4 flex-1 min-h-0 overflow-hidden">
          <div className="win95-panel space-y-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Auto-extract</Label>
              <span className="win95-border-inset px-2 py-0.5 text-[10px] text-muted-foreground">{previewTitle}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Quantization method</Label>
                <Select value={quantizationMethod} onValueChange={setQuantizationMethod}>
                  <SelectTrigger className="win95-input bg-input h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="win95-window">
                    <SelectItem value="median-cut">Median Cut</SelectItem>
                    <SelectItem value="kmeans">K-Means</SelectItem>
                    <SelectItem value="octree">Octree</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span>Color count</span>
                  <span>{quantizationColorCount}</span>
                </div>
                <Slider
                  value={[quantizationColorCount]}
                  onValueChange={(value) => setQuantizationColorCount(value[0] ?? 8)}
                  min={2}
                  max={64}
                  step={1}
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="win95-button flex w-full items-center justify-center gap-2"
                onClick={handleExtractPalette}
                disabled={!canAutoQuantize || isQuantizing}
              >
                <Camera className="h-3.5 w-3.5" />
                {isQuantizing ? "Extracting..." : "Extract from frame"}
              </button>

              <button
                type="button"
                className="win95-button flex w-full items-center justify-center gap-2"
                onClick={handleExtractOriginalPalette}
                disabled={!canExtractFromOriginal || isQuantizing}
              >
                <Camera className="h-3.5 w-3.5" />
                {isQuantizing ? "Extracting..." : "Import from original"}
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="win95-button flex w-full items-center justify-center gap-2"
                onClick={async () => {
                  const imported = await onImportPalette();
                  if (!imported?.length) return;
                  setColors(imported);
                  setColorSteps(imported.length);
                }}
                disabled={isQuantizing}
              >
                <Upload className="h-3.5 w-3.5" />
                Import palette file
              </button>

              <button
                type="button"
                className="win95-button flex w-full items-center justify-center gap-2"
                onClick={() => { void onExportPalette(); }}
                disabled={colors.length === 0 || isQuantizing}
              >
                <Download className="h-3.5 w-3.5" />
                Export palette file
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Supported palette formats: ASE, GPL, HEX/TXT, JSON.
            </p>
          </div>

          <div className="win95-panel flex flex-col space-y-3 p-3 min-h-0">
            <Label className="text-xs font-bold uppercase tracking-wider">Manual edit</Label>

            <div className="flex flex-wrap gap-2">
              {[2, 4, 8, 16, 32].map((step) => (
                <button
                  key={step}
                  onClick={() => setColorSteps(step)}
                  className={`win95-button px-3 py-1 text-xs ${colorSteps === step ? "bg-primary text-primary-foreground" : ""}`}
                >
                  {step}
                </button>
              ))}
            </div>

            <div className="win98-scroll flex-1 min-h-0 space-y-2 overflow-y-auto">
              {colors.map((color, index) => (
                <div
                  key={`${color}-${index}`}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={() => setDraggedIndex(null)}
                  className="flex cursor-move items-center gap-2 rounded p-1 hover:bg-muted"
                >
                  <span className="w-6 text-xs">{index + 1}</span>
                  <button
                    type="button"
                    className="h-8 w-12 cursor-pointer border-2 border-win95-dark"
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      setEditingColorIndex(index);
                      setEditingColorValue(color.toUpperCase());
                    }}
                    title={`Edit color ${index + 1}`}
                  />
                  <Input
                    type="text"
                    value={color.toUpperCase()}
                    readOnly
                    className="win95-input h-8 flex-1 bg-input text-xs font-mono"
                    maxLength={7}
                  />
                  <div className="w-12 text-right text-xs text-muted-foreground">{Math.round(getBrightness(color))}</div>
                  {colors.length > 2 && (
                    <button
                      onClick={() => handleRemoveColor(index)}
                      className="win95-button p-1 hover:bg-destructive hover:text-destructive-foreground"
                      title="Remove color"
                    >
                      <Delete className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {editingColorIndex === index && (
                    <PaletteColorPopover
                      title={`Edit color #${index + 1}`}
                      value={editingColorValue}
                      onChange={setEditingColorValue}
                      onCancel={() => setEditingColorIndex(null)}
                      onApply={() => {
                        const normalized = normalizeHex(editingColorValue);
                        if (normalized) {
                          handleColorChange(index, normalized);
                        }
                        setEditingColorIndex(null);
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="h-12 overflow-hidden border-2 border-win95-dark">
              <div className="flex h-full w-full">
                {colors.map((color, index) => (
                  <div key={`${color}-preview-${index}`} style={{ backgroundColor: color, width: `${100 / colors.length}%` }} />
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={handleAddColor} className="win95-button flex items-center gap-1 px-3 py-2 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add color
              </button>
              <button onClick={handleSortByBrightness} className="win95-button flex items-center gap-1 px-3 py-2 text-xs">
                <ChevronsVertical className="h-3.5 w-3.5" /> Sort by brightness
              </button>
              <button
                onClick={handleInterpolate}
                className="win95-button flex items-center gap-1 px-3 py-2 text-xs"
                disabled={colors.length < 2}
              >
                <Repeat className="h-3.5 w-3.5" /> Auto interpolate
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t-2 border-win95-dark">
            <button onClick={onClose} className="win95-button px-4 py-2">Cancel</button>
            <button onClick={() => onSave(colors)} className="win95-button bg-primary px-4 py-2 text-primary-foreground">
              Save & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
