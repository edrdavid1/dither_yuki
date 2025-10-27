import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Plus, Shuffle, ArrowUpDown } from "lucide-react";

interface PaletteEditorProps {
  onSave: (colors: string[]) => void;
  onClose: () => void;
  initialColors?: string[];
}

export const PaletteEditor = ({ onSave, onClose, initialColors = ["#000000", "#FFFFFF"] }: PaletteEditorProps) => {
  const [colors, setColors] = useState<string[]>(initialColors);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [colorSteps, setColorSteps] = useState<number>(initialColors.length);

  useEffect(() => {
    // When color steps change, adjust the palette
    if (colorSteps !== colors.length) {
      if (colorSteps > colors.length) {
        // Add colors
        const newColors = [...colors];
        while (newColors.length < colorSteps) {
          // Interpolate between last two colors
          const lastColor = newColors[newColors.length - 1];
          newColors.push(lastColor);
        }
        setColors(newColors);
      } else {
        // Remove colors
        setColors(colors.slice(0, colorSteps));
      }
    }
  }, [colorSteps]);

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
    if (colors.length > 2) {
      const newColors = colors.filter((_, i) => i !== index);
      setColors(newColors);
      setColorSteps(newColors.length);
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newColors = [...colors];
    const draggedColor = newColors[draggedIndex];
    newColors.splice(draggedIndex, 1);
    newColors.splice(index, 0, draggedColor);
    
    setColors(newColors);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const hexToRgb = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result 
      ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
      : [0, 0, 0];
  };

  const rgbToHex = (r: number, g: number, b: number): string => {
    return "#" + [r, g, b].map(x => {
      const hex = Math.round(x).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    }).join("");
  };

  const getBrightness = (hex: string): number => {
    const [r, g, b] = hexToRgb(hex);
    return (r * 299 + g * 587 + b * 114) / 1000;
  };

  const handleSortByBrightness = () => {
    const sorted = [...colors].sort((a, b) => getBrightness(a) - getBrightness(b));
    setColors(sorted);
  };

  const handleInterpolate = () => {
    if (colors.length < 2) return;
    
    const newColors = [...colors];
    const first = hexToRgb(colors[0]);
    const last = hexToRgb(colors[colors.length - 1]);
    
    for (let i = 1; i < colors.length - 1; i++) {
      const t = i / (colors.length - 1);
      const r = first[0] + (last[0] - first[0]) * t;
      const g = first[1] + (last[1] - first[1]) * t;
      const b = first[2] + (last[2] - first[2]) * t;
      newColors[i] = rgbToHex(r, g, b);
    }
    
    setColors(newColors);
  };

  const handlePresetSteps = (steps: number) => {
    setColorSteps(steps);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="win95-window w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="win95-titlebar">
          <span className="text-sm">Palette Editor Pro</span>
          <button 
            className="bg-card px-2 text-xs border border-win95-light hover:bg-muted"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          {/* Preset Buttons */}
          <div className="win95-panel p-3 space-y-2">
            <Label className="text-sm font-bold">Color Steps</Label>
            <div className="flex gap-2 flex-wrap">
              {[2, 4, 8, 16].map(step => (
                <button
                  key={step}
                  onClick={() => handlePresetSteps(step)}
                  className={`win95-button text-xs px-3 py-1 ${colorSteps === step ? 'bg-primary text-primary-foreground' : ''}`}
                >
                  {step}
                </button>
              ))}
            </div>
          </div>

          {/* Color Palette */}
          <div className="win95-panel p-3 space-y-3">
            <Label className="text-sm font-bold">Palette Colors</Label>
            
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {colors.map((color, index) => (
                <div
                  key={index}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className="flex gap-2 items-center cursor-move hover:bg-muted p-1 rounded"
                >
                  <span className="text-xs w-6">{index + 1}</span>
                  
                  <div className="relative flex-shrink-0">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => handleColorChange(index, e.target.value)}
                      className="w-12 h-8 cursor-pointer border-2 border-win95-dark"
                    />
                  </div>
                  
                  <Input
                    type="text"
                    value={color.toUpperCase()}
                    onChange={(e) => handleColorChange(index, e.target.value)}
                    className="flex-1 h-8 text-xs font-mono win95-input"
                    maxLength={7}
                  />
                  
                  <div className="text-xs text-muted-foreground w-12 text-right">
                    {Math.round(getBrightness(color))}
                  </div>
                  
                  {colors.length > 2 && (
                    <button
                      onClick={() => handleRemoveColor(index)}
                      className="win95-button p-1 hover:bg-destructive hover:text-destructive-foreground"
                      title="Remove color"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="win95-panel p-3 space-y-2">
            <Label className="text-sm font-bold">Preview</Label>
            <div className="flex h-12 border-2 border-win95-dark overflow-hidden">
              {colors.map((color, index) => (
                <div
                  key={index}
                  style={{ backgroundColor: color, width: `${100 / colors.length}%` }}
                  className="h-full"
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="win95-panel p-3 space-y-2">
            <Label className="text-sm font-bold">Actions</Label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleAddColor}
                className="win95-button text-xs px-3 py-2 flex items-center gap-1"
              >
                <Plus size={14} />
                Add Color
              </button>
              
              <button
                onClick={handleSortByBrightness}
                className="win95-button text-xs px-3 py-2 flex items-center gap-1"
              >
                <ArrowUpDown size={14} />
                Sort by Brightness
              </button>
              
              <button
                onClick={handleInterpolate}
                className="win95-button text-xs px-3 py-2 flex items-center gap-1"
                disabled={colors.length < 2}
              >
                <Shuffle size={14} />
                Auto Interpolate
              </button>
            </div>
          </div>

          {/* Save/Cancel */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="win95-button px-4 py-2"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(colors)}
              className="win95-button px-4 py-2 bg-primary text-primary-foreground"
            >
              Save & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};