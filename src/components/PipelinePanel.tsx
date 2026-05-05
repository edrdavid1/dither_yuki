import { useState } from "react";
import { Analytics, Dock } from "pixelarticons/react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WorkspaceMode } from "@/components/WorkspaceModeSwitcher";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ICONS } from "@/components/ui/IconLibrary";

/**
 * One entry in the visual pipeline stack.
 * `effectLayer` is typed as `Record<string, unknown>` so this module has no
 * dependency on Index.tsx. Index.tsx casts to its own EffectLayerPayload when reading.
 */
export interface PipelineStackEntry {
  id: string;
  /** Display name shown in the UI row (usually the algorithm name). */
  label: string;
  /** Whether this layer is included in the render path. */
  visible: boolean;
  /** The serialisable effect-layer payload forwarded to the Rust backend. */
  effectLayer: Record<string, unknown>;
}

interface PipelinePanelProps {
  mode: WorkspaceMode;
  layers: PipelineStackEntry[];
  isProcessing?: boolean;
  algorithmOptions: string[];
  paletteOptions: string[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onToggleVisible: (id: string) => void;
  onRemove: (id: string) => void;
  onAddLayer: (algorithm: string, palette: string) => void;
}

export const PipelinePanel = ({
  mode,
  layers,
  isProcessing = false,
  algorithmOptions,
  paletteOptions,
  onReorder,
  onToggleVisible,
  onRemove,
  onAddLayer,
}: PipelinePanelProps) => {
  const [addOpen, setAddOpen] = useState(false);
  const [newAlgorithm, setNewAlgorithm] = useState(
    () => algorithmOptions.find((a) => a !== "None") ?? "Floyd-Steinberg",
  );
  const [newPalette, setNewPalette] = useState(
    () => paletteOptions.find((p) => p !== "Custom") ?? "Grayscale",
  );

  const visibleCount = layers.filter((l) => l.visible).length;

  const handleAdd = () => {
    onAddLayer(newAlgorithm, newPalette);
    setAddOpen(false);
  };

  return (
    <TooltipProvider delayDuration={120}>
    <div className="win98-card h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="win98-section-title flex items-center gap-2">
            <Dock className="h-3 w-3" /> Pipeline
          </div>
          <div className="text-sm font-bold flex items-center gap-2">
            <span>Visual processing stack</span>
            {isProcessing && (
              <span className="inline-flex items-center gap-1 text-[10px] font-normal text-muted-foreground">
                <span className="h-3 w-3 rounded-full border border-current border-r-transparent animate-spin" />
                processing...
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Applied top to bottom. Toggle the eye to hide a layer without removing it.
          </p>
        </div>
        <div className="win98-badge">{mode}</div>
      </div>

      {/* Layer list */}
      <div className="space-y-1">
        {layers.map((layer, index) => (
          <div key={layer.id}>
            <div
              className={`win95-border px-1.5 py-1 min-h-8 ${layer.visible ? "bg-card" : "bg-muted text-muted-foreground"}`}
            >
              <div className="flex items-center gap-2">
                {/* Visibility toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onToggleVisible(layer.id)}
                      className="win95-button win98-icon-button"
                      aria-label={layer.visible ? "Hide layer" : "Show layer"}
                    >
                      {layer.visible
                        ? <ICONS.PIPELINE_VISIBLE />
                        : <ICONS.PIPELINE_HIDDEN />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{layer.visible ? "Hide layer" : "Show layer"}</TooltipContent>
                </Tooltip>

                {/* Label */}
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-bold">{layer.label}</span>
                  <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {index === 0 ? "live" : "snapshot"}
                  </span>
                </div>

                {/* Reorder + delete */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onReorder(index, index - 1)}
                        disabled={index === 0}
                        className="win95-button win98-icon-button disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Move up"
                      >
                        <ICONS.PIPELINE_UP />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Move up</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onReorder(index, index + 1)}
                        disabled={index === layers.length - 1}
                        className="win95-button win98-icon-button disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Move down"
                      >
                        <ICONS.PIPELINE_DOWN />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Move down</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onRemove(layer.id)}
                        disabled={layers.length <= 1}
                        className="win95-button win98-icon-button disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Remove layer"
                      >
                        <ICONS.PIPELINE_REMOVE />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Remove layer</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add layer UI */}
      {addOpen ? (
        <div className="win95-border p-2 space-y-2">
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">New layer</div>
          <Select value={newAlgorithm} onValueChange={setNewAlgorithm}>
            <SelectTrigger className="h-6 text-[11px]">
              <SelectValue placeholder="Algorithm" />
            </SelectTrigger>
            <SelectContent>
              {algorithmOptions.filter((a) => a !== "None").map((a) => (
                <SelectItem key={a} value={a} className="text-[11px]">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={newPalette} onValueChange={setNewPalette}>
            <SelectTrigger className="h-6 text-[11px]">
              <SelectValue placeholder="Palette" />
            </SelectTrigger>
            <SelectContent>
              {paletteOptions.filter((p) => p !== "Custom").map((p) => (
                <SelectItem key={p} value={p} className="text-[11px]">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              className="win95-border flex-1 py-1 text-[11px] font-bold hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="win95-border px-3 py-1 text-[11px] hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="win95-button w-full flex items-center justify-center gap-1 py-1 text-[11px]"
              aria-label="Add layer"
            >
              <ICONS.PIPELINE_ADD />
              Add layer
            </button>
          </TooltipTrigger>
          <TooltipContent>Add layer</TooltipContent>
        </Tooltip>
      )}

      {/* Summary */}
      <div className="win95-border-inset px-2 py-2 text-[11px] text-muted-foreground">
        <div className="flex items-center justify-between gap-2 font-bold text-foreground">
          <span className="flex items-center gap-2">
            <Analytics className="h-3 w-3" />
            Stack summary
          </span>
          <span className="win98-badge">{visibleCount}/{layers.length} active</span>
        </div>
        <p className="mt-1 leading-relaxed">
          {visibleCount > 0
            ? `${visibleCount} layer${visibleCount === 1 ? "" : "s"} feeding the render path.`
            : "All layers are hidden — preview will show unprocessed source."}
        </p>
      </div>
    </div>
    </TooltipProvider>
  );
};
