import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Camera, ChevronsVertical, Delete, Plus, Repeat } from "pixelarticons/react";

interface ColorStudioDialogProps {
  initialColors?: string[];
  quantizationMethod: string;
  setQuantizationMethod: (value: string) => void;
  quantizationColorCount: number;
  setQuantizationColorCount: (value: number) => void;
  canAutoQuantize: boolean;
  isQuantizing: boolean;
  onExtractFromImage: () => Promise<string[] | null>;
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
  isQuantizing,
  onExtractFromImage,
  onSave,
  onClose,
}: ColorStudioDialogProps) => {
  const [colors, setColors] = useState<string[]>(initialColors);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [colorSteps, setColorSteps] = useState<number>(initialColors.length);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="win95-window win98-scroll max-h-[92vh] w-full max-w-3xl overflow-auto">
        <div className="win95-titlebar">
          <span className="text-sm">Color Studio</span>
          <button className="border border-win95-light bg-card px-2 text-xs hover:bg-muted" onClick={onClose}>
            <Delete className="h-3 w-3" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="win95-panel space-y-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-bold">Palette generation (photo → colors)</Label>
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

            <button
              type="button"
              className="win95-button flex w-full items-center justify-center gap-2"
              onClick={handleExtractPalette}
              disabled={!canAutoQuantize || isQuantizing}
            >
              <Camera className="h-3.5 w-3.5" />
              {isQuantizing ? "Извлечение цветов..." : "Извлечь из текущего кадра"}
            </button>
          </div>

          <div className="win95-panel space-y-3 p-3">
            <Label className="text-sm font-bold">Manual palette editing</Label>

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

            <div className="win98-scroll max-h-[320px] space-y-2 overflow-y-auto">
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
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => handleColorChange(index, e.target.value)}
                    className="h-8 w-12 cursor-pointer border-2 border-win95-dark"
                  />
                  <Input
                    type="text"
                    value={color.toUpperCase()}
                    onChange={(e) => handleColorChange(index, e.target.value)}
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

          <div className="flex justify-end gap-2">
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
