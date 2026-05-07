import { X } from "lucide-react";

interface ExitWarningDialogProps {
  open: boolean;
  isSaving: boolean;
  onSaveAndExit: () => void;
  onDiscardAndExit: () => void;
  onCancel: () => void;
}

export const ExitWarningDialog = ({
  open,
  isSaving,
  onSaveAndExit,
  onDiscardAndExit,
  onCancel,
}: ExitWarningDialogProps) => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4">
      <div className="win95-window w-[440px] max-w-[92vw] overflow-hidden">
        <div className="win95-titlebar">
          <span>Unsaved changes</span>
          <button
            type="button"
            className="border border-win95-light bg-card px-2 text-xs hover:bg-muted"
            onClick={onCancel}
            aria-label="Close"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        <div className="space-y-4 p-4 text-sm">
          <p>You have unsaved changes. What would you like to do before closing the app?</p>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="win95-button px-3 py-1" onClick={onDiscardAndExit}>
              Don’t Save
            </button>
            <button
              type="button"
              className="win95-button px-3 py-1"
              onClick={onSaveAndExit}
              disabled={isSaving}
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="win95-button px-3 py-1" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};