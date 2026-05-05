import { useState } from "react";

interface MenuBarProps {
  onOpenFile?: () => void;
  onSaveImage?: () => void;
  onExport?: () => void;
  onExportSvg?: () => void;
  onReset?: () => void;
  onShowAbout?: () => void;
  onShowShortcuts?: () => void;
  onSavePreset?: () => void;
  onLoadPreset?: () => void;
  onExportPreset?: () => void;
  onImportPreset?: () => void;
  onManagePresets?: () => void;
  backendConnected?: boolean;
  workspaceMode?: string;
}

export const MenuBar = ({
  onOpenFile,
  onSaveImage,
  onExport,
  onExportSvg,
  onReset,
  onShowAbout,
  onShowShortcuts,
  onSavePreset,
  onLoadPreset,
  onExportPreset,
  onImportPreset,
  onManagePresets,
  backendConnected,
  workspaceMode,
}: MenuBarProps) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const shortcuts: Record<string, string> = {
    Open: "Ctrl/Cmd+O",
    Save: "Ctrl/Cmd+S",
    Export: "Ctrl/Cmd+E",
    "Export SVG": "",
    "Import Preset": "",
    "Export Preset": "",
    Reset: "Ctrl/Cmd+R",
    Shortcuts: "?",
  };

  const handleMenuItemClick = (menu: string, item: string) => {
    setActiveMenu(null);
    
    switch (menu) {
      case "File":
        if (item === "Open") onOpenFile?.();
        else if (item === "Save") onSaveImage?.();
        else if (item === "Export") onExport?.();
        else if (item === "Export SVG") onExportSvg?.();
        break;
      case "Edit":
        if (item === "Reset") onReset?.();
        break;
      case "Presets":
        if (item === "Save Preset") onSavePreset?.();
        else if (item === "Load Preset") onLoadPreset?.();
        else if (item === "Export Preset") onExportPreset?.();
        else if (item === "Import Preset") onImportPreset?.();
        else if (item === "Manage Presets") onManagePresets?.();
        break;
      case "Help":
        if (item === "About") onShowAbout?.();
        else if (item === "Shortcuts") onShowShortcuts?.();
        break;
    }
  };

  const menus = [
    { label: "File", items: ["Open", "Save", "Export", "Export SVG"] },
    { label: "Edit", items: ["Reset"] },
    { label: "Presets", items: ["Save Preset", "Load Preset", "Export Preset", "Import Preset", "Manage Presets"] },
    { label: "Help", items: ["About", "Shortcuts"] },
  ];

  return (
    <div className="bg-card px-0 pt-0">
      <div className="flex items-center gap-0.5 border-b border-black/10 pb-0 text-xs min-h-0 h-7">
        {/* <div className="win95-border-inset mr-1 hidden items-center gap-2 bg-white px-2 py-1 text-[10px] font-bold sm:flex">
          <span className="h-2 w-2 bg-primary" />
          <span>Dither Yuki</span>
        </div> */}
        {menus.map((menu) => (
          <div key={menu.label} className="relative">
            <button
              className={`px-2 py-0.5 text-left text-[11px] ${activeMenu === menu.label ? 'win95-border-inset bg-secondary' : 'win95-border bg-card'} hover:bg-secondary`}
              onMouseEnter={() => setActiveMenu(menu.label)}
              onClick={() => setActiveMenu(activeMenu === menu.label ? null : menu.label)}
            >
              {menu.label}
            </button>
            {activeMenu === menu.label && (
              <div
                className="absolute top-full left-0 z-50 min-w-[180px] bg-card win95-border shadow-[3px_3px_0_rgba(0,0,0,0.18)]"
                onMouseLeave={() => setActiveMenu(null)}
              >
                {menu.items.map((item) => (
                  <button
                    key={item}
                    className="flex w-full items-center justify-between gap-2 px-2 py-0.5 text-left text-[11px] hover:bg-primary hover:text-primary-foreground"
                    onClick={() => handleMenuItemClick(menu.label, item)}
                  >
                    <span>{item}</span>
                    <span className="text-[10px] opacity-70">{shortcuts[item] ?? ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="ml-auto hidden px-1 text-[10px] text-muted-foreground md:block">
          {backendConnected ? "Desktop backend ready" : "Browser fallback"}
          {workspaceMode ? ` • ${workspaceMode} workspace` : ""}
        </div>
      </div>
    </div>
  );
};