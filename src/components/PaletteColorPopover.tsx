import { Input } from "@/components/ui/input";

interface PaletteColorPopoverProps {
  title: string;
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
  onCancel: () => void;
}

export const PaletteColorPopover = ({
  title,
  value,
  onChange,
  onApply,
  onCancel,
}: PaletteColorPopoverProps) => {
  return (
    <div className="absolute left-0 top-8 z-20 win95-window p-2 w-[220px] space-y-2">
      <div className="text-[10px] font-bold">{title}</div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-8 w-10 cursor-pointer border-2 border-win95-dark"
        />
        <Input
          className="win95-input h-8 flex-1 bg-input text-xs font-mono"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={7}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="win95-button px-2 py-1 text-[11px]"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="win95-button px-2 py-1 text-[11px]"
          onClick={onApply}
        >
          Apply
        </button>
      </div>
    </div>
  );
};

