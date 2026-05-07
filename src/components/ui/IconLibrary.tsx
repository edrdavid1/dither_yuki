import type { LucideIcon } from "lucide-react";
import {
  Blend,
  Clock,
  Diamond,
  CircleDot,
  Clapperboard,
  Eye,
  EyeOff,
  FileDown,
  Film,
  Focus,
  FolderOpen,
  Image,
  Layers,
  LineChart,
  MinusSquare,
  Palette,
  PanelLeft,
  Play,
  PlusSquare,
  Repeat,
  Save,
  SlidersHorizontal,
  Plus,
  Settings2,
  Shuffle,
  Sparkles,
  Trash2,
  WandSparkles,
  Zap,
  ChevronUp,
  ChevronDown,
  Lock,
  LockOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

type IconRenderProps = {
  className?: string;
  size?: 16 | 18;
};

const makeIcon = (Icon: LucideIcon) => ({ className, size = 16 }: IconRenderProps) => (
  <span
    className={cn("inline-flex items-center justify-center shrink-0", size === 18 ? "h-[18px] w-[18px]" : "h-4 w-4", className)}
    aria-hidden="true"
  >
    <Icon size={size === 18 ? 14 : 12} strokeWidth={2} />
  </span>
);

export const ICONS = {
  WORKSPACE_IMAGE: makeIcon(Image),
  WORKSPACE_VIDEO: makeIcon(Film),
  WORKSPACE_ANIMATION: makeIcon(Play),
  COLOR_STUDIO: makeIcon(Palette),
  FOCUS_MODE: makeIcon(Focus),
  LIVE_PREVIEW: makeIcon(Sparkles),

  DITHER: makeIcon(WandSparkles),
  GLITCH: makeIcon(Settings2),
  MASK: makeIcon(Blend),
  RANDOMIZE: makeIcon(Shuffle),

  PIPELINE: makeIcon(Layers),
  PIPELINE_ADD: makeIcon(Plus),
  PIPELINE_UP: makeIcon(ChevronUp),
  PIPELINE_DOWN: makeIcon(ChevronDown),
  PIPELINE_VISIBLE: makeIcon(Eye),
  PIPELINE_HIDDEN: makeIcon(EyeOff),
  LAYER_LOCK: makeIcon(Lock),
  LAYER_UNLOCK: makeIcon(LockOpen),
  PIPELINE_REMOVE: makeIcon(Trash2),

  PROCESS_VIDEO: makeIcon(Clapperboard),
  EXPORT_SVG: makeIcon(FileDown),
  STATUS: makeIcon(PanelLeft),
  FORMAT_DOT: makeIcon(CircleDot),

  CLOCK: ({ className }: IconRenderProps) => (
    <span className={cn("inline-flex items-center justify-center h-4 w-4", className)} aria-hidden="true">
      <Clock size={14} strokeWidth={2} />
    </span>
  ),
  CHART: ({ className }: IconRenderProps) => (
    <span className={cn("inline-flex items-center justify-center h-4 w-4", className)} aria-hidden="true">
      <LineChart size={14} strokeWidth={2} />
    </span>
  ),
  RENDER: ({ className }: IconRenderProps) => (
    <span className={cn("inline-flex items-center justify-center h-4 w-4", className)} aria-hidden="true">
      <Zap size={14} strokeWidth={2} />
    </span>
  ),
  PLAY: ({ className }: IconRenderProps) => (
    <span className={cn("inline-flex items-center justify-center h-4 w-4", className)} aria-hidden="true">
      <Play size={12} fill="currentColor" strokeWidth={2} />
    </span>
  ),
  PLUS_FRAME: makeIcon(PlusSquare),
  MINUS_FRAME: makeIcon(MinusSquare),
  LOOP: makeIcon(Repeat),
  KEYFRAME: ({ className }: IconRenderProps) => (
    <span className={cn("inline-flex items-center justify-center h-4 w-4", className)} aria-hidden="true">
      <Diamond size={10} fill="currentColor" strokeWidth={2} />
    </span>
  ),
  SAVE_GIF: makeIcon(Save),
  IMPORT_FRAME: makeIcon(FolderOpen),
  PROPERTIES: makeIcon(SlidersHorizontal),
} as const;

export type IconName = keyof typeof ICONS;
