import { AboutDialog } from "@/components/AboutDialog";
import { ColorStudioDialog } from "@/components/ColorStudioDialog";
import { ExitWarningDialog } from "@/components/ExitWarningDialog";
import { PresetManager } from "@/components/PresetManager";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";

interface PresetSettings {
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
}

interface AppOverlaysProps {
  showColorStudio: boolean;
  onCloseColorStudio: () => void;
  activePaletteColors: string[];
  quantizationMethod: string;
  setQuantizationMethod: (value: string) => void;
  quantizationColorCount: number;
  setQuantizationColorCount: (value: number) => void;
  canAutoQuantize: boolean;
  canExtractFromOriginal: boolean;
  quantizingPalette: boolean;
  onExtractFromImage: () => Promise<string[] | null>;
  onExtractFromOriginal: () => Promise<string[] | null>;
  onImportPalette: () => Promise<string[] | null>;
  onExportPalette: () => Promise<void>;
  onSavePalette: (colors: string[]) => void;

  showAbout: boolean;
  onCloseAbout: () => void;

  showShortcuts: boolean;
  onCloseShortcuts: () => void;

  showPresetManager: boolean;
  onClosePresetManager: () => void;
  presetSettings: PresetSettings;
  onLoadPreset: (preset: any) => void;

  showExitWarning: boolean;
  isSavingExitWarning: boolean;
  onSaveAndExit: () => void;
  onDiscardAndExit: () => void;
  onCancelExitWarning: () => void;

  workflowBusy: boolean;
  jobId: string | null;
  jobKind: string | null;
  workflowStatus?: string;
  jobProgressPercent: number;
  jobProgress: { current_frame?: number; total_frames?: number } | null;
  onCancelActiveJob: () => void;
}

export const AppOverlays = ({
  showColorStudio,
  onCloseColorStudio,
  activePaletteColors,
  quantizationMethod,
  setQuantizationMethod,
  quantizationColorCount,
  setQuantizationColorCount,
  canAutoQuantize,
  canExtractFromOriginal,
  quantizingPalette,
  onExtractFromImage,
  onExtractFromOriginal,
  onImportPalette,
  onExportPalette,
  onSavePalette,
  showAbout,
  onCloseAbout,
  showShortcuts,
  onCloseShortcuts,
  showPresetManager,
  onClosePresetManager,
  presetSettings,
  onLoadPreset,
  showExitWarning,
  isSavingExitWarning,
  onSaveAndExit,
  onDiscardAndExit,
  onCancelExitWarning,
  workflowBusy,
  jobId,
  jobKind,
  workflowStatus,
  jobProgressPercent,
  jobProgress,
  onCancelActiveJob,
}: AppOverlaysProps) => {
  return (
    <>
      {showColorStudio && (
        <ColorStudioDialog
          initialColors={activePaletteColors}
          quantizationMethod={quantizationMethod}
          setQuantizationMethod={setQuantizationMethod}
          quantizationColorCount={quantizationColorCount}
          setQuantizationColorCount={setQuantizationColorCount}
          canAutoQuantize={canAutoQuantize}
          canExtractFromOriginal={canExtractFromOriginal}
          isQuantizing={quantizingPalette}
          onExtractFromImage={onExtractFromImage}
          onExtractFromOriginal={onExtractFromOriginal}
          onImportPalette={onImportPalette}
          onExportPalette={onExportPalette}
          onSave={onSavePalette}
          onClose={onCloseColorStudio}
        />
      )}

      {showAbout && <AboutDialog onClose={onCloseAbout} />}
      {showShortcuts && <ShortcutsDialog onClose={onCloseShortcuts} />}

      {showPresetManager && (
        <PresetManager
          currentSettings={presetSettings}
          onClose={onClosePresetManager}
          onLoadPreset={onLoadPreset}
        />
      )}

      <ExitWarningDialog
        open={showExitWarning}
        isSaving={isSavingExitWarning}
        onSaveAndExit={onSaveAndExit}
        onDiscardAndExit={onDiscardAndExit}
        onCancel={onCancelExitWarning}
      />

      {(workflowBusy || Boolean(jobId)) && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
          <div className="win95-window w-[360px] max-w-[92vw] p-2">
            <div className="win95-titlebar">
              <span>Render in progress</span>
              <span className="text-[10px] uppercase">{jobKind ?? "workflow"}</span>
            </div>
            <div className="mt-2 space-y-2 px-1 pb-1 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-bold">
                  {workflowStatus ?? "Rendering..."}
                </span>
                <span className="text-muted-foreground">{jobProgressPercent}%</span>
              </div>

              <div className="win95-border-inset h-4 bg-input p-[2px]">
                <div
                  className="h-full bg-primary transition-[width] duration-300"
                  style={{ width: `${jobProgressPercent}%` }}
                />
              </div>

              <div className="win95-border-inset px-2 py-1 text-[10px] text-muted-foreground">
                Frames: {jobProgress?.current_frame ?? 0} / {jobProgress?.total_frames ?? 0}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="win95-button px-2 py-1 text-[11px]"
                  onClick={onCancelActiveJob}
                  disabled={!jobId}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

