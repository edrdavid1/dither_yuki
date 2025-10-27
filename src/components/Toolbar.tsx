import { FolderOpen, Save, Download } from "lucide-react";

interface ToolbarProps {
  onOpenFile: () => void;
  onSaveImage: () => void;
  onExport: () => void;
}

export const Toolbar = ({ onOpenFile, onSaveImage, onExport }: ToolbarProps) => {
  return (
    <div className="bg-card border-b-2 border-win95-dark p-1 flex gap-1">
      <button
        onClick={onOpenFile}
        className="win95-button p-2"
        title="Open Image"
      >
        <FolderOpen size={16} />
      </button>
      <button
        onClick={onSaveImage}
        className="win95-button p-2"
        title="Save"
      >
        <Save size={16} />
      </button>
      <button
        onClick={onExport}
        className="win95-button p-2"
        title="Export"
      >
        <Download size={16} />
      </button>
    </div>
  );
};
