import { type ComponentType, type SVGProps } from "react";
import { Clapperboard, DateTime, Image } from "pixelarticons/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type WorkspaceMode = "image" | "video" | "animation";

interface WorkspaceModeSwitcherProps {
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
}

const modes: Array<{
  value: WorkspaceMode;
  title: string;
  subtitle: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}> = [
  {
    value: "image",
    title: "Image mode",
    subtitle: "Single-frame tuning and export",
    icon: Image,
  },
  {
    value: "video",
    title: "Video mode",
    subtitle: "Import, process, queue, render",
    icon: Clapperboard,
  },
  {
    value: "animation",
    title: "Animation mode",
    subtitle: "Still-to-motion, timeline, temporal effects",
    icon: DateTime,
  },
];

export const WorkspaceModeSwitcher = ({ mode, onModeChange }: WorkspaceModeSwitcherProps) => {
  return (
    <TooltipProvider delayDuration={120}>
      <div className="win98-card">
        <div className="grid grid-cols-3 gap-2">
          {modes.map((entry) => {
            const Icon = entry.icon;
            const active = entry.value === mode;

            return (
              <Tooltip key={entry.value}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onModeChange(entry.value)}
                    className={`win95-button flex min-h-[44px] items-center justify-center px-2 py-2 ${
                      active ? "bg-primary text-primary-foreground" : "bg-card"
                    }`}
                    aria-label={entry.title}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">{entry.title}: {entry.subtitle}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
};
