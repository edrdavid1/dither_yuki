import { useState } from "react";

interface MenuBarProps {
  onOpenFile?: () => void;
  onSaveImage?: () => void;
  onExport?: () => void;
  onReset?: () => void;
  onShowAbout?: () => void;
  onShowShortcuts?: () => void;
  onSavePreset?: () => void;
  onLoadPreset?: () => void;
  onManagePresets?: () => void;
}

export const MenuBar = ({
  onOpenFile,
  onSaveImage,
  onExport,
  onReset,
  onShowAbout,
  onShowShortcuts,
  onSavePreset,
  onLoadPreset,
  onManagePresets,
}: MenuBarProps) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const handleMenuItemClick = (menu: string, item: string) => {
    setActiveMenu(null);
    
    switch (menu) {
      case "File":
        if (item === "Open") onOpenFile?.();
        else if (item === "Save") onSaveImage?.();
        else if (item === "Export") onExport?.();
        break;
      case "Edit":
        if (item === "Reset") onReset?.();
        break;
      case "Presets":
        if (item === "Save Preset") onSavePreset?.();
        else if (item === "Load Preset") onLoadPreset?.();
        else if (item === "Manage Presets") onManagePresets?.();
        break;
      case "Help":
        if (item === "About") onShowAbout?.();
        else if (item === "Shortcuts") onShowShortcuts?.();
        break;
    }
  };

  const menus = [
    { label: "File", items: ["Open", "Save", "Export"] },
    { label: "Edit", items: ["Reset"] },
    { label: "Presets", items: ["Save Preset", "Load Preset", "Manage Presets"] },
    { label: "Help", items: ["About", "Shortcuts"] },
  ];

  return (
    <div className="bg-card border-b-2 border-win95-dark">
      <div className="flex text-sm">
        {menus.map((menu) => (
          <div key={menu.label} className="relative">
            <button
              className="px-3 py-1 hover:bg-primary hover:text-primary-foreground"
              onMouseEnter={() => setActiveMenu(menu.label)}
              onClick={() => setActiveMenu(activeMenu === menu.label ? null : menu.label)}
            >
              {menu.label}
            </button>
            {activeMenu === menu.label && (
              <div
                className="absolute top-full left-0 bg-card win95-border z-50 min-w-[160px]"
                onMouseLeave={() => setActiveMenu(null)}
              >
                {menu.items.map((item) => (
                  <button
                    key={item}
                    className="block w-full text-left px-4 py-1 hover:bg-primary hover:text-primary-foreground"
                    onClick={() => handleMenuItemClick(menu.label, item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};