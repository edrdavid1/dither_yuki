import { useState, useEffect } from "react";
import { X, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Preset {
  name: string;
  settings: {
    algorithm: string;
    palette: string;
    intensity: number;
    contrast: number;
    brightness: number;
    saturation: number;
    pixelSize: number;
    blur: number;
    sharpness: number;
    noise: number;
  };
}

interface PresetManagerProps {
  currentSettings: Preset["settings"];
  onClose: () => void;
  onLoadPreset: (preset: Preset) => void;
}

export const PresetManager = ({ currentSettings, onClose, onLoadPreset }: PresetManagerProps) => {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("dithertone-presets");
    if (saved) {
      setPresets(JSON.parse(saved));
    }
  }, []);

  const savePresets = (newPresets: Preset[]) => {
    localStorage.setItem("dithertone-presets", JSON.stringify(newPresets));
    setPresets(newPresets);
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) {
      toast.error("Please enter a preset name");
      return;
    }

    const newPreset: Preset = {
      name: presetName,
      settings: currentSettings,
    };

    const updated = [...presets, newPreset];
    savePresets(updated);
    setPresetName("");
    setShowSaveDialog(false);
    toast.success(`Preset "${presetName}" saved!`);
  };

  const handleDeletePreset = (index: number) => {
    const updated = presets.filter((_, i) => i !== index);
    savePresets(updated);
    toast.success("Preset deleted");
  };

  const handleLoadPreset = (preset: Preset) => {
    onLoadPreset(preset);
    onClose();
    toast.success(`Preset "${preset.name}" loaded!`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="win95-window w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="win95-titlebar">
          <span className="text-sm font-bold">Preset Manager</span>
          <button 
            onClick={onClose}
            className="bg-card px-2 text-xs border border-win95-light hover:bg-muted"
          >
            <X size={12} />
          </button>
        </div>
        
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Save New Preset */}
          <div className="win95-panel p-3 space-y-2">
            <div className="font-bold text-sm border-b-2 border-win95-dark pb-1 mb-2">
              Save Current Settings
            </div>
            {showSaveDialog ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Enter preset name..."
                  className="win95-input bg-input w-full px-2 py-1"
                  onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
                />
                <div className="flex gap-2">
                  <button onClick={handleSavePreset} className="win95-button flex-1 flex items-center justify-center gap-2">
                    <Save size={14} />
                    Save
                  </button>
                  <button onClick={() => setShowSaveDialog(false)} className="win95-button flex-1">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowSaveDialog(true)} className="win95-button w-full">
                Save Current Settings as Preset
              </button>
            )}
          </div>

          {/* Saved Presets */}
          <div className="win95-panel p-3 space-y-2">
            <div className="font-bold text-sm border-b-2 border-win95-dark pb-1 mb-2">
              Saved Presets ({presets.length})
            </div>
            {presets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No presets saved yet
              </p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {presets.map((preset, index) => (
                  <div key={index} className="win95-border-inset p-2 bg-background flex items-center justify-between gap-2">
                    <div className="flex-1">
                      <div className="font-bold text-sm">{preset.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {preset.settings.algorithm} • {preset.settings.palette}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => handleLoadPreset(preset)}
                        className="win95-button px-3 py-1 text-xs"
                      >
                        Load
                      </button>
                      <button 
                        onClick={() => handleDeletePreset(index)}
                        className="win95-button p-1"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t-2 border-win95-dark">
          <button onClick={onClose} className="win95-button w-full">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
