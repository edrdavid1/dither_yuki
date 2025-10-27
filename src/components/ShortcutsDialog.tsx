import { X } from "lucide-react";

interface ShortcutsDialogProps {
  onClose: () => void;
}

export const ShortcutsDialog = ({ onClose }: ShortcutsDialogProps) => {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
  const mod = isMac ? 'Cmd' : 'Ctrl';
  const shortcuts = [
    { key: `${mod} + O`, action: "Open Image" },
    { key: `${mod} + S`, action: "Save Image" },
    { key: `${mod} + E`, action: "Export Image" },
    { key: `${mod} + R`, action: "Reset to Original" },
    { key: `${mod} + P`, action: "Edit Palette" },
    { key: "+ / -", action: "Zoom In/Out" },
    { key: "0", action: "Reset Zoom" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="win95-window w-full max-w-md">
        <div className="win95-titlebar">
          <span className="text-sm font-bold">Keyboard Shortcuts</span>
          <button 
            onClick={onClose}
            className="bg-card px-2 text-xs border border-win95-light hover:bg-muted"
          >
            <X size={12} />
          </button>
        </div>
        <div className="p-6 space-y-4">
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
