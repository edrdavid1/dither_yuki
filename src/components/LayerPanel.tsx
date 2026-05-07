import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ICONS } from "@/components/ui/IconLibrary";
import type { Layer } from "@/types/layers";

interface LayerPanelProps {
  layers: Layer[];
  activeLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onAddLayer: () => void;
  onRemoveLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
  onMoveLayer: (layerId: string, direction: -1 | 1) => void;
}

export const LayerPanel = ({
  layers,
  activeLayerId,
  onSelectLayer,
  onAddLayer,
  onRemoveLayer,
  onToggleVisibility,
  onToggleLock,
  onMoveLayer,
}: LayerPanelProps) => {
  return (
    <TooltipProvider delayDuration={120}>
      <div className="win98-card flex h-full min-h-0 w-full flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="win98-section-title">LAYERS</div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onAddLayer}
                className="flex h-[24px] w-[24px] items-center justify-center border border-black bg-[#c0c0c0] text-[14px] font-bold leading-none"
                aria-label="Add layer"
              >
                +
              </button>
            </TooltipTrigger>
            <TooltipContent>Add layer</TooltipContent>
          </Tooltip>
        </div>

        <div className="mt-1 min-h-0 flex-1 space-y-[2px] overflow-y-auto pr-[1px] win98-scroll-area win98-scroll">
          {layers.map((layer, index) => {
            const active = layer.id === activeLayerId;
            return (
              <div
                key={layer.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectLayer(layer.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectLayer(layer.id);
                  }
                }}
                className="win95-border flex items-center gap-1 px-1 py-1 text-[11px]"
                style={{
                  outline: active ? "2px solid #1a73e8" : "2px solid transparent",
                  outlineOffset: "-2px",
                  background: active ? "#e8f0fe" : "transparent",
                }}
              >
                <span className="w-6 shrink-0 text-right font-bold">#{index + 1}</span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(layer.id);
                  }}
                  className="flex h-[20px] w-[20px] items-center justify-center border border-black bg-[#f0f0f0] text-[14px] leading-none"
                  aria-label={layer.visible ? "Hide layer" : "Show layer"}
                >
                  {layer.visible ? <ICONS.PIPELINE_VISIBLE size={16} /> : <ICONS.PIPELINE_HIDDEN size={16} />}
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLock(layer.id);
                  }}
                  className="flex h-[20px] w-[20px] items-center justify-center border border-black bg-[#f0f0f0] text-[14px] leading-none"
                  aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
                >
                  {layer.locked ? <ICONS.LAYER_LOCK size={16} /> : <ICONS.LAYER_UNLOCK size={16} />}
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveLayer(layer.id, -1);
                  }}
                  disabled={index === 0}
                  className="flex h-[20px] w-[20px] items-center justify-center border border-black bg-[#f0f0f0] text-[14px] leading-none disabled:opacity-40"
                  aria-label="Move layer up"
                >
                  <ICONS.PIPELINE_UP size={16} />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveLayer(layer.id, 1);
                  }}
                  disabled={index === layers.length - 1}
                  className="flex h-[20px] w-[20px] items-center justify-center border border-black bg-[#f0f0f0] text-[14px] leading-none disabled:opacity-40"
                  aria-label="Move layer down"
                >
                  <ICONS.PIPELINE_DOWN size={16} />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveLayer(layer.id);
                  }}
                  disabled={layers.length <= 1}
                  className="flex h-[20px] w-[20px] items-center justify-center border border-black bg-[#f0f0f0] text-[14px] leading-none disabled:opacity-40"
                  aria-label="Remove layer"
                >
                  <ICONS.PIPELINE_REMOVE size={16} />
                </button>
              </div>
            );
          })}
        </div>

      </div>
    </TooltipProvider>
  );
};
