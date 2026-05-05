import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ICONS } from "@/components/ui/IconLibrary";

export interface AnimationTemporalConfig {
  enabled: boolean;
  mode: string;
  amount: number;
  speed: number;
  phase: number;
}

export interface AnimationTrackDraft {
  parameter: string;
  from: number;
  to: number;
  startFrame: number;
  endFrame: number;
  easing: string;
  looped: boolean;
}

interface AnimationTimelinePanelProps {
  frameCount: number;
  frameIndices: number[];
  selectedFrameIndex: number;
  onSelectFrame: (index: number) => void;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  renderMode: "quick" | "rendered";
  onRenderModeChange: (mode: "quick" | "rendered") => void;
  quickStride: number;
  onQuickStrideChange: (stride: number) => void;
  temporalModes: string[];
  easingModes: string[];
  parameterModes: string[];
  temporal: AnimationTemporalConfig;
  onTemporalChange: (next: AnimationTemporalConfig) => void;
  track: AnimationTrackDraft;
  onTrackChange: (next: AnimationTrackDraft) => void;
  workflowStatus?: string;
  onExportFramesPack: () => void;
  onAddFrame: () => void;
  onDeleteFrame: () => void;
  onApplyFrame: () => void;
  onRenderGif: () => void;
  canDeleteFrame: boolean;
  canRunFrameActions: boolean;
  hasFrames: boolean;
}

const hintClass = "win95-button px-1.5 py-0.5 text-[10px]";

export const AnimationTimelinePanel = ({
  frameCount,
  frameIndices,
  selectedFrameIndex,
  onSelectFrame,
  isPlaying,
  onTogglePlayback,
  renderMode,
  onRenderModeChange,
  quickStride,
  onQuickStrideChange,
  temporalModes,
  easingModes,
  parameterModes,
  temporal,
  onTemporalChange,
  track,
  onTrackChange,
  workflowStatus,
  onExportFramesPack,
  onAddFrame,
  onDeleteFrame,
  onApplyFrame,
  onRenderGif,
  canDeleteFrame,
  canRunFrameActions,
  hasFrames,
}: AnimationTimelinePanelProps) => {
  const timelineCount = Math.max(frameCount, 1);
  const safeStart = Math.max(0, Math.min(track.startFrame, timelineCount - 1));
  const safeEnd = Math.max(safeStart, Math.min(track.endFrame, timelineCount - 1));

  return (
    <div className="win98-card space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Animation timeline</div>
        <div className="win95-border-inset px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {safeStart}f → {safeEnd}f
        </div>
      </div>

      <div className="win95-border-inset bg-input/80 px-1 py-1">
        <div className="flex min-h-[28px] flex-wrap items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="win95-button win98-icon-button" onClick={onAddFrame} disabled={!canRunFrameActions}>
                <ICONS.PLUS_FRAME />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Add frame</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="win95-button win98-icon-button" onClick={onDeleteFrame} disabled={!canDeleteFrame}>
                <ICONS.MINUS_FRAME />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Delete selected frame</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="win95-button win98-icon-button" onClick={onTogglePlayback} disabled={!canRunFrameActions}>
                <ICONS.PLAY />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{isPlaying ? "Stop preview" : "Play preview"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="win95-button win98-icon-button" onClick={onApplyFrame} disabled={!canRunFrameActions}>
                <ICONS.RENDER />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Apply current effect to frame</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="win95-button h-[22px] px-1.5 text-[10px] font-bold" onClick={onRenderGif} disabled={!canRunFrameActions}>
                <span className="inline-flex items-center gap-1">
                  <ICONS.SAVE_GIF />
                  GIF
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Render GIF</TooltipContent>
          </Tooltip>
          <div className="win98-icon-separator" />
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="win95-button win98-icon-button" onClick={onExportFramesPack} disabled={!hasFrames}>
                <ICONS.EXPORT_SVG />
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Export frame pack</TooltipContent>
          </Tooltip>
          <span className="ml-auto win95-border-inset px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {frameIndices.length} fr
          </span>
        </div>
      </div>

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1.55fr)_minmax(260px,1fr)]">
        <div className="space-y-1.5 min-w-0">
          <div className="win95-border-inset bg-input/80 px-1.5 py-1 overflow-x-auto win98-scroll">
            <div className="flex min-w-max items-center gap-1">
              {frameIndices.map((frameNumber, index) => (
                <button
                  key={`frame-${frameNumber}`}
                  type="button"
                  onClick={() => onSelectFrame(index)}
                  className={`win95-button px-1.5 py-0.5 text-[10px] leading-none h-[20px] ${selectedFrameIndex === index ? "bg-primary text-primary-foreground" : ""}`}
                >
                  {frameNumber}
                </button>
              ))}
            </div>
          </div>

          <div className="win95-border-inset px-2 py-1.5 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="font-bold inline-flex items-center gap-1"><ICONS.CHART /> Track envelope</span>
              <span>{safeStart}f → {safeEnd}f</span>
            </div>
            <div className="relative h-[14px] bg-muted/80 border border-win95-shadow">
              <div
                className="absolute inset-y-0 bg-primary/65"
                style={{
                  left: `${timelineCount <= 1 ? 0 : (safeStart / Math.max(timelineCount - 1, 1)) * 100}%`,
                  width: `${timelineCount <= 1 ? 100 : ((safeEnd - safeStart + 1) / timelineCount) * 100}%`,
                }}
              />
              <span
                className="absolute top-1/2 -translate-y-1/2 -ml-[5px] text-foreground"
                style={{ left: `${timelineCount <= 1 ? 0 : (safeStart / Math.max(timelineCount - 1, 1)) * 100}%` }}
              >
                <ICONS.KEYFRAME className="h-[10px] w-[10px]" />
              </span>
              <span
                className="absolute top-1/2 -translate-y-1/2 -ml-[5px] text-foreground"
                style={{ left: `${timelineCount <= 1 ? 100 : (safeEnd / Math.max(timelineCount - 1, 1)) * 100}%` }}
              >
                <ICONS.KEYFRAME className="h-[10px] w-[10px]" />
              </span>
              <div
                className="absolute inset-y-0 w-[2px] bg-card border-x border-foreground/75"
                style={{ left: `${frameIndices.length <= 1 ? 0 : (selectedFrameIndex / Math.max(frameIndices.length - 1, 1)) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="win95-border px-2 py-1.5 text-[11px] space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-bold inline-flex items-center gap-1.5">
              <ICONS.CLOCK />
              <ICONS.RENDER />
              Properties
            </span>
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
              <ICONS.LOOP /> timeline
            </span>
          </div>

          <div className="grid gap-1 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-[10px]"><ICONS.RENDER /> Mode</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className={hintClass}>?</button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">Quick renders sampled frames; Rendered produces every frame.</TooltipContent>
                </Tooltip>
              </div>
              <Select value={renderMode} onValueChange={(value) => onRenderModeChange(value as "quick" | "rendered")}> 
                <SelectTrigger className="win95-input bg-input h-7 text-[10px] px-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="win95-window">
                  <SelectItem value="quick">Quick</SelectItem>
                  <SelectItem value="rendered">Rendered</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="inline-flex items-center gap-1"><ICONS.PLAY /> Quick stride</span>
                <span>{quickStride}</span>
              </div>
              <Slider value={[quickStride]} onValueChange={(value) => onQuickStrideChange(value[0] ?? 2)} min={1} max={6} step={1} />
            </div>
          </div>

          <div className="grid gap-1 sm:grid-cols-2">
            <label className="win95-input bg-input h-7 flex items-center justify-between px-1.5 text-[10px]">
              <span className="inline-flex items-center gap-1"><ICONS.CLOCK /> Temporal</span>
              <input type="checkbox" checked={temporal.enabled} onChange={(event) => onTemporalChange({ ...temporal, enabled: event.target.checked })} />
            </label>
            <Select value={temporal.mode} onValueChange={(value) => onTemporalChange({ ...temporal, mode: value })}>
              <SelectTrigger className="win95-input bg-input h-7 text-[10px] px-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="win95-window">
                {temporalModes.map((mode) => (
                  <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span>Amount</span>
              <span>{temporal.amount}</span>
            </div>
            <Slider value={[temporal.amount]} onValueChange={(value) => onTemporalChange({ ...temporal, amount: value[0] ?? temporal.amount })} min={0} max={100} step={1} />
          </div>

          <div className="retro-divider" />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold inline-flex items-center gap-1"><ICONS.CHART /> Primary track</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className={hintClass}>?</button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">One real backend automation track is active here; more tracks can be stacked next.</TooltipContent>
              </Tooltip>
            </div>
            <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-4">
              <Select value={track.parameter} onValueChange={(value) => onTrackChange({ ...track, parameter: value })}>
                <SelectTrigger className="win95-input bg-input h-7 text-[10px] px-1.5"><SelectValue /></SelectTrigger>
                <SelectContent className="win95-window">
                  {parameterModes.map((mode) => (
                    <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={track.easing} onValueChange={(value) => onTrackChange({ ...track, easing: value })}>
                <SelectTrigger className="win95-input bg-input h-7 text-[10px] px-1.5"><SelectValue /></SelectTrigger>
                <SelectContent className="win95-window">
                  {easingModes.map((mode) => (
                    <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="win95-input bg-input h-7 flex items-center justify-between px-1.5 text-[10px]">
                <span>From</span>
                <input type="number" value={track.from} onChange={(e) => onTrackChange({ ...track, from: Number(e.target.value) })} className="w-14 bg-transparent text-right outline-none" />
              </label>
              <label className="win95-input bg-input h-7 flex items-center justify-between px-1.5 text-[10px]">
                <span>To</span>
                <input type="number" value={track.to} onChange={(e) => onTrackChange({ ...track, to: Number(e.target.value) })} className="w-14 bg-transparent text-right outline-none" />
              </label>
            </div>
            <div className="grid gap-1 sm:grid-cols-3">
              <label className="win95-input bg-input h-7 flex items-center justify-between px-1.5 text-[10px]">
                <span>Start</span>
                <input type="number" min={0} max={Math.max(frameCount - 1, 0)} value={track.startFrame} onChange={(e) => onTrackChange({ ...track, startFrame: Number(e.target.value) })} className="w-12 bg-transparent text-right outline-none" />
              </label>
              <label className="win95-input bg-input h-7 flex items-center justify-between px-1.5 text-[10px]">
                <span>End</span>
                <input type="number" min={0} max={Math.max(frameCount - 1, 0)} value={track.endFrame} onChange={(e) => onTrackChange({ ...track, endFrame: Number(e.target.value) })} className="w-12 bg-transparent text-right outline-none" />
              </label>
              <label className="win95-input bg-input h-7 flex items-center justify-between px-1.5 text-[10px]">
                <span>Loop</span>
                <input type="checkbox" checked={track.looped} onChange={(e) => onTrackChange({ ...track, looped: e.target.checked })} />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground min-h-[16px]">
        {workflowStatus ?? "Animation workspace is ready. Render frames to populate the strip."}
      </div>
    </div>
  );
};
