import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type WorkspaceMode } from "@/components/WorkspaceModeSwitcher";
import { ICONS } from "@/components/ui/IconLibrary";

interface ToolbarProps {
  onToggleFocusMode: () => void;
  onSelectWorkspaceMode: (mode: WorkspaceMode) => void;
  onOpenColorStudio: () => void;
  workspaceMode: WorkspaceMode;
  focusMode: boolean;
  leftPanelVisible: boolean;
}

const workspaceModes: Array<{
  value: WorkspaceMode;
  title: string;
  icon: (props: { className?: string; size?: 16 | 18 }) => JSX.Element;
}> = [
  { value: "image", title: "Image workspace", icon: ICONS.WORKSPACE_IMAGE },
  { value: "video", title: "Video workspace", icon: ICONS.WORKSPACE_VIDEO },
  { value: "animation", title: "Animation workspace", icon: ICONS.WORKSPACE_ANIMATION },
];

export const Toolbar = ({
  onToggleFocusMode,
  onSelectWorkspaceMode,
  onOpenColorStudio,
  workspaceMode,
  focusMode,
  leftPanelVisible,
}: ToolbarProps) => {
  return (
    <TooltipProvider delayDuration={120}>
      <div className="win98-toolbar px-1 py-0.5 gap-1 min-h-0 h-8">
        <div className="flex flex-wrap items-center gap-1">
          {workspaceModes.map((entry) => {
            const active = workspaceMode === entry.value;
            const Icon = entry.icon;
            return (
              <Tooltip key={entry.value}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onSelectWorkspaceMode(entry.value)}
                    className={`win95-button win98-icon-button ${active ? "bg-primary text-primary-foreground" : ""}`}
                    aria-label={entry.title}
                  >
                    <Icon />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {active
                    ? leftPanelVisible
                      ? `${entry.title} · click again to hide left dock`
                      : `${entry.title} · click again to show left dock`
                    : entry.title}
                </TooltipContent>
              </Tooltip>
            );
          })}

          <div className="win98-icon-separator" aria-hidden="true" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onOpenColorStudio}
                className="win95-button win98-icon-button"
                aria-label="Open Color Studio"
              >
                <ICONS.COLOR_STUDIO />
              </button>
            </TooltipTrigger>
            <TooltipContent>Open Color Studio</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggleFocusMode}
                className={`win95-button win98-icon-button ${focusMode ? "bg-primary text-primary-foreground" : ""}`}
                aria-label="Toggle focus mode"
              >
                <ICONS.FOCUS_MODE />
              </button>
            </TooltipTrigger>
            <TooltipContent>Focus mode (F)</TooltipContent>
          </Tooltip>
        </div>

        {/* <div className="mx-2 hidden h-6 w-px bg-black/20 md:block" /> */}

        {/* <div className="hidden items-center gap-1 md:flex">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="win95-border-inset bg-white px-2 py-1 text-[11px] font-bold flex items-center gap-1">
                <Desktop className="h-3 w-3" /> {shortMode[workspaceMode]}
              </div>
            </TooltipTrigger>
            <TooltipContent>Current workspace mode</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="win95-border-inset bg-white px-2 py-1 text-[11px] font-bold flex items-center gap-1">
                <FolderOpen className="h-3 w-3" /> {imageSize ?? "No file"}
              </div>
            </TooltipTrigger>
            <TooltipContent>Loaded source size</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="win95-border-inset bg-white px-2 py-1 text-[11px] font-bold flex items-center gap-1">
                <Settings className="h-3 w-3" /> {activeAdjustments}
              </div>
            </TooltipTrigger>
            <TooltipContent>Number of adjustments changed from default</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="win95-border-inset bg-white px-2 py-1 text-[11px] font-bold flex items-center gap-1">
                <WindowGraph className="h-3 w-3" /> {hasProcessedImage ? "Processed" : "Waiting"}
              </div>
            </TooltipTrigger>
            <TooltipContent>Current preview render state</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="win95-border-inset bg-white px-2 py-1 text-[11px] font-bold flex items-center gap-1">
                <Sparkles size={11} /> {backendConnected ? "Backend" : "Local"}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {backendConnected ? "Rust backend command bridge is active" : "Web/local fallback mode"}
            </TooltipContent>
          </Tooltip>
        </div> */}

        <div className="ml-auto flex items-center gap-1 text-[10px]">
          <div className="win98-badge bg-secondary px-1 py-0.5">
            <ICONS.LIVE_PREVIEW />
            Live
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};
