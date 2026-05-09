import { X } from "lucide-react";

interface ShortcutsDialogProps {
  onClose: () => void;
}

export const ShortcutsDialog = ({ onClose }: ShortcutsDialogProps) => {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
  const mod = isMac ? 'Cmd' : 'Ctrl';
  const shortcuts = [
    { key: `${mod} + N`, action: "New Project" },
    { key: `${mod} + O`, action: "Open File" },
    { key: `${mod} + Shift + O`, action: "Open Project (.dyproj)" },
    { key: `${mod} + S`, action: "Save Project (.dyproj)" },
    { key: `${mod} + Shift + S`, action: "Export Image (PNG)" },
    { key: `${mod} + E`, action: "Export Image" },
    { key: `${mod} + Z`, action: "Undo" },
    { key: `${mod} + Shift + Z`, action: "Redo" },
    { key: `${mod} + Y`, action: "Redo (alt)" },
    { key: `${mod} + R`, action: "Reset to Original" },
    { key: `${mod} + P`, action: "Edit Palette (Color Studio)" },
    { key: "F", action: "Toggle Focus Mode" },
    { key: "Delete / Backspace", action: "Delete Selected Frame (Animation)" },
    { key: "+ / -", action: "Zoom In / Out" },
    { key: "0", action: "Reset Zoom" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="win95-window w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="win95-titlebar">
          <span className="text-sm font-bold">Keyboard Shortcuts</span>
          <button
            onClick={onClose}
            className="bg-card px-2 text-xs border border-win95-light hover:bg-muted"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <div className="p-6 space-y-4 flex-1 overflow-y-auto win98-scroll">
          <div className="space-y-2">
            {shortcuts.map((shortcut, index) => (
              <div
                key={index}
                className="flex justify-between items-center py-2 border-b border-win95-dark last:border-0"
              >
                <span className="text-sm">{shortcut.action}</span>
                <kbd className="win95-border-inset px-2 py-1 text-xs font-mono bg-background">
                  {shortcut.key}
                </kbd>
              </div>
            ))}
          </div>
          
          <div className="pt-4">
            <button onClick={onClose} className="win95-button w-full">
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
