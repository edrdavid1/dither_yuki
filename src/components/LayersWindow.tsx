import { LayerPanel } from "@/components/LayerPanel";
import type { Layer } from "@/types/layers";

interface LayersWindowProps {
  layers: Layer[];
  activeLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onAddLayer: () => void;
  onRemoveLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
  onMoveLayer: (layerId: string, direction: -1 | 1) => void;
}

export const LayersWindow = ({
  layers,
  activeLayerId,
  onSelectLayer,
  onAddLayer,
  onRemoveLayer,
  onToggleVisibility,
  onToggleLock,
  onMoveLayer,
}: LayersWindowProps) => {
  return (
    <aside className="min-h-0 overflow-hidden">
      <div className="h-full min-h-0 overflow-hidden">
        <LayerPanel
          layers={layers}
          activeLayerId={activeLayerId}
          onSelectLayer={onSelectLayer}
          onAddLayer={onAddLayer}
          onRemoveLayer={onRemoveLayer}
          onToggleVisibility={onToggleVisibility}
          onToggleLock={onToggleLock}
          onMoveLayer={onMoveLayer}
        />
      </div>
    </aside>
  );
};

