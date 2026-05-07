import { ReactNode } from "react";

interface InspectorWindowProps {
  title: string;
  subtitle?: string;
  className?: string;
  children: ReactNode;
}

export const InspectorWindow = ({ title, subtitle, className, children }: InspectorWindowProps) => {
  return (
    <div className={`win98-card flex flex-1 min-h-0 flex-col overflow-hidden${className ? ` ${className}` : ""}`}>
      <div className="react95-window-header">
        <span>{title}</span>
        <span className="text-[10px] font-normal opacity-60">{subtitle ?? title.toLowerCase()}</span>
      </div>
      <div className="flex-1 min-h-0 win98-scroll-area win98-scroll pr-4">{children}</div>
    </div>
  );
};

