import { ReactNode } from "react";

interface WindowProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export const Window = ({ title, children, className = "" }: WindowProps) => {
  return (
    <div className={`win95-window ${className}`}>
      <div className="win95-titlebar">
        <span className="text-sm">{title}</span>
        <div className="flex gap-0.5">
          <button className="bg-card px-2 text-xs border border-win95-light hover:bg-muted">_</button>
          <button className="bg-card px-2 text-xs border border-win95-light hover:bg-muted">□</button>
          <button className="bg-card px-2 text-xs border border-win95-light hover:bg-muted">×</button>
        </div>
      </div>
      {children}
    </div>
  );
};
