import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Palette } from "lucide-react";

interface ControlPanelProps {
  algorithm: string;
  setAlgorithm: (value: string) => void;
  palette: string;
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
  onReset: () => void;
  onEditPalette: () => void;
}

const algorithms = [
  "Floyd-Steinberg",
  "Jarvis-Judice-Ninke",
  "Sierra",
  "Atkinson",
  "Ordered",
  "Bayer 2x2",
  "Bayer 4x4",
  "Bayer 8x8",
  "Random",
];

const palettes = [
  "Grayscale",
  "CGA",
  "EGA",
  "Gameboy",
  "C64",
  "ZX Spectrum",
  "Apple II",
  "Custom"
];

export const ControlPanel = ({
  algorithm,
  setAlgorithm,
  palette,
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
  onReset,
  onEditPalette
}: ControlPanelProps) => {
  return (
    <div className="win95-panel space-y-4">
      {/* Algorithm */}
      <div className="space-y-2">
        <label className="text-sm font-bold block">Algorithm</label>
        <Select value={algorithm} onValueChange={setAlgorithm}>
          <SelectTrigger className="win95-input bg-input">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="win95-window">
            {algorithms.map((alg) => (
              <SelectItem key={alg} value={alg}>{alg}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Color Palette */}
      <div className="space-y-2">
        <Label className="text-sm font-bold">Color Palette</Label>
        <div className="flex gap-1">
          <Select value={palette} onValueChange={setPalette}>
            <SelectTrigger className="win95-input bg-input flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="win95-window">
              {palettes.map((pal) => (
                <SelectItem key={pal} value={pal}>{pal}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={onEditPalette}
            className="win95-button p-1 px-2"
            title="Edit Palette"
          >
            <Palette size={16} />
          </button>
        </div>
      </div>

      {/* Adjustments */}
      <div className="space-y-4 pt-2">
        <div className="text-sm font-bold border-b-2 border-win95-dark pb-1">Adjustments</div>
        
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span>Intensity</span>
            <span>{intensity}%</span>
          </div>
          <Slider
            value={[intensity]}
            onValueChange={(v) => setIntensity(v[0])}
            min={0}
            max={100}
            step={1}
            className="cursor-pointer"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span>Contrast</span>
            <span>{contrast}%</span>
          </div>
          <Slider
            value={[contrast]}
            onValueChange={(v) => setContrast(v[0])}
            min={0}
            max={200}
            step={1}
            className="cursor-pointer"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span>Brightness</span>
            <span>{brightness}%</span>
          </div>
          <Slider
            value={[brightness]}
            onValueChange={(v) => setBrightness(v[0])}
            min={0}
            max={200}
            step={1}
            className="cursor-pointer"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span>Saturation</span>
            <span>{saturation}%</span>
          </div>
          <Slider
            value={[saturation]}
            onValueChange={(v) => setSaturation(v[0])}
            min={0}
            max={200}
            step={1}
            className="cursor-pointer"
          />
        </div>
      </div>

      {/* Effects */}
      <div className="space-y-4 pt-2">
        <div className="text-sm font-bold border-b-2 border-win95-dark pb-1">Effects</div>
        
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span>Pixel Size</span>
            <span>{pixelSize}x</span>
          </div>
          <Slider
            value={[pixelSize]}
            onValueChange={(v) => setPixelSize(v[0])}
            min={1}
            max={16}
            step={1}
            className="cursor-pointer"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span>Blur</span>
            <span>{blur}</span>
          </div>
          <Slider
            value={[blur]}
            onValueChange={(v) => setBlur(v[0])}
            min={0}
            max={10}
            step={1}
            className="cursor-pointer"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span>Sharpness</span>
            <span>{sharpness}%</span>
          </div>
          <Slider
            value={[sharpness]}
            onValueChange={(v) => setSharpness(v[0])}
            min={0}
            max={200}
            step={1}
            className="cursor-pointer"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span>Noise</span>
            <span>{noise}</span>
          </div>
          <Slider
            value={[noise]}
            onValueChange={(v) => setNoise(v[0])}
            min={0}
            max={50}
            step={1}
            className="cursor-pointer"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2 pt-4">
        <button onClick={onReset} className="win95-button w-full">
          Reset Image
        </button>
      </div>
    </div>
  );
};
