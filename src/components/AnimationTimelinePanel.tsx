import { useRef, type RefObject } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ICONS } from "@/components/ui/IconLibrary";
import { type AnimationFrame } from "@/types/animationFrame";

interface AnimationTimelinePanelProps {
  frames: AnimationFrame[];
  selectedFrameIndex: number;
  onSelectFrame: (index: number) => void;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  workflowStatus?: string;
  onAddFrame: () => void;
  onImportFrame: () => void;
  onDeleteFrame: () => void;
  onRender: () => void;
  canDeleteFrame: boolean;
  canRunFrameActions: boolean;
  selectedFrameIds?: Set<string>;
  onMultiSelect?: (frameId: string, addToSelection: boolean) => void;
  onApplyToSelected?: () => void;
}

interface FilmstripThumbProps {
  index: number;
  frame: AnimationFrame;
  active: boolean;
  inMultiSelect: boolean;
  onSelect: (frameId: string, shiftKey: boolean, ctrlKey: boolean) => void;
  observerRoot: RefObject<HTMLDivElement>;
}

const FilmstripThumb = ({
  index,
  frame,
  active,
  inMultiSelect,
  onSelect,
  observerRoot: _observerRoot,
}: FilmstripThumbProps) => {
  const ringClass = active
    ? "ring-2 ring-[#000080]"
    : inMultiSelect
    ? "ring-1 ring-[#004080] ring-offset-0"
    : "";

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => onSelect(frame.id, e.shiftKey, e.ctrlKey || e.metaKey)}
        className={`win95-border-inset relative h-[36px] w-[36px] overflow-hidden bg-[#bdbdbd] ${ringClass}`}
        title={`Frame ${index + 1}${inMultiSelect ? " (selected)" : ""}`}
      >
        {frame.src ? (
          <img
            src={frame.src}
            alt={`Frame ${index + 1}`}
            className="mx-auto mt-[2px] h-[28px] w-[28px] object-cover"
          />
        ) : (
          <span className="block mx-auto mt-[2px] h-[28px] w-[28px] bg-[#9b9b9b]" />
        )}
        <span
          className={`absolute bottom-0 right-[2px] text-[9px] leading-[9px] ${
            active ? "text-[#000080] font-bold" : "text-muted-foreground"
          }`}
        >
          {index + 1}
        </span>
      </button>
    </div>
  );
};

export const AnimationTimelinePanel = ({
  frames,
  selectedFrameIndex,
  onSelectFrame,
  isPlaying,
  onTogglePlayback,
  workflowStatus,
  onAddFrame,
  onImportFrame,
  onDeleteFrame,
  onRender,
  canDeleteFrame,
  canRunFrameActions,
  selectedFrameIds,
  onMultiSelect,
  onApplyToSelected,
}: AnimationTimelinePanelProps) => {
  const filmstripRootRef = useRef<HTMLDivElement>(null);
  const frameCount = Math.max(frames.length, 1);
  const selectedFrame = Math.max(0, Math.min(selectedFrameIndex, frameCount - 1));

  return (
    <div
      className="win95-border relative overflow-hidden bg-[#C0C0C0] font-mono text-[10px]"
      style={{ maxHeight: "min(25vh, 180px)" }}
    >
      <div className="flex items-start gap-[1px]">
        <div
          ref={filmstripRootRef}
          className="filmstrip-track win98-scroll flex-1 pt-[6px]"
        >
          {frames.map((frame, index) => (
            <FilmstripThumb
              key={frame.id}
              index={index}
              frame={frame}
              active={selectedFrame === index}
              inMultiSelect={selectedFrameIds?.has(frame.id) ?? false}
              onSelect={(frameId, shiftKey, ctrlKey) => {
                if (onMultiSelect && (ctrlKey || (selectedFrameIds && selectedFrameIds.size > 0 && !shiftKey))) {
                  onMultiSelect(frameId, ctrlKey);
                } else if (shiftKey && selectedFrameIds && selectedFrameIds.size > 0) {
                  const lastSelectedId = Array.from(selectedFrameIds).pop() ?? frames[selectedFrame]?.id;
                  const lastIdx = frames.findIndex((f) => f.id === lastSelectedId);
                  const currentIdx = frames.findIndex((f) => f.id === frameId);
                  const start = Math.min(lastIdx, currentIdx);
                  const end = Math.max(lastIdx, currentIdx);
                  for (let i = start; i <= end; i++) {
                    onMultiSelect?.(frames[i]!.id, true);
                  }
                } else {
                  const idx = frames.findIndex((item) => item.id === frameId);
                  if (idx >= 0) onSelectFrame(idx);
                }
              }}
              observerRoot={filmstripRootRef}
            />
          ))}
        </div>

        <div className="compact-toolbar shrink-0 border border-black">
          <div className="flex items-center gap-[1px]">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="win95-button h-[20px] w-[20px] min-w-[20px] flex items-center justify-center p-0"
                  onClick={onAddFrame}
                  disabled={!canRunFrameActions}
                >
                  <ICONS.PLUS_FRAME />
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Duplicate frame</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="win95-button h-[20px] w-[20px] min-w-[20px] flex items-center justify-center p-0"
                  onClick={onDeleteFrame}
                  disabled={!canDeleteFrame}
                >
                  <ICONS.MINUS_FRAME />
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Delete frame</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="win95-button h-[20px] w-[20px] min-w-[20px] flex items-center justify-center p-0"
                  onClick={onImportFrame}
                  disabled={!canRunFrameActions}
                >
                  <ICONS.IMPORT_FRAME />
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Import frame from file</TooltipContent>
            </Tooltip>

            {selectedFrameIds && selectedFrameIds.size > 1 && onApplyToSelected && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="win95-button h-[20px] px-[4px] text-[9px] leading-none"
                    onClick={onApplyToSelected}
                    disabled={!canRunFrameActions}
                  >
                    Apply
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  Apply current settings to {selectedFrameIds.size} selected frames
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="win95-button h-[20px] w-[20px] min-w-[20px] flex items-center justify-center p-0"
                  onClick={onTogglePlayback}
                  disabled={!canRunFrameActions}
                >
                  {isPlaying ? (
                    <span className="text-[9px] leading-none">■</span>
                  ) : (
                    <ICONS.PLAY />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                {isPlaying ? "Stop preview" : "Play preview"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="win95-button h-[20px] w-[20px] min-w-[20px] flex items-center justify-center p-0"
                  onClick={onRender}
                  disabled={!canRunFrameActions}
                >
                  <ICONS.SAVE_GIF />
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Export animation (GIF)</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="win95-border-inset mt-[1px] bg-input/90 px-[2px] py-0 h-[16px] max-h-[20px] flex items-center justify-between gap-1 text-[9px] text-muted-foreground leading-none">
        <span>
          #{selectedFrame + 1} / {frameCount}
          {selectedFrameIds && selectedFrameIds.size > 1 ? ` (${selectedFrameIds.size} selected)` : ""}
        </span>
        <span className="truncate">{workflowStatus ?? "Filmstrip editor"}</span>
      </div>
    </div>
  );
};
