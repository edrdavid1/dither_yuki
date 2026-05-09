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
      
      <div className="flex-1 min-h-0 win98-scroll-area win98-scroll ">{children}</div>
    </div>
  );
};

