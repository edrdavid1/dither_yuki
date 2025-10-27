import { useRef, useEffect, useState } from "react";
import { ZoomIn, ZoomOut, Maximize } from "lucide-react";

interface PreviewPanelProps {
  originalImage: HTMLImageElement | null;
  processedImage: HTMLImageElement | null;
  showOriginal: boolean;
  setShowOriginal: (value: boolean) => void;
}

export const PreviewPanel = ({ 
  originalImage, 
  processedImage,
  showOriginal,
  setShowOriginal
}: PreviewPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageToShow = showOriginal ? originalImage : processedImage;
    
    if (imageToShow) {
      canvas.width = imageToShow.width;
      canvas.height = imageToShow.height;
      ctx.drawImage(imageToShow, 0, 0);
    } else {
      // Clear canvas and show placeholder
      canvas.width = 800;
      canvas.height = 600;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      ctx.font = '14px Tahoma';
      ctx.textAlign = 'center';
      ctx.fillText('No image loaded', canvas.width / 2, canvas.height / 2);
    }
  }, [originalImage, processedImage, showOriginal]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto win95-border-inset bg-white p-2">
        <canvas 
          ref={canvasRef}
          className="max-w-full h-auto"
          style={{ 
            imageRendering: 'pixelated',
            transform: `scale(${zoom})`,
            transformOrigin: 'top left'
          }}
        />
      </div>
      
      <div className="win95-panel mt-2 flex gap-2 justify-between">
        <div className="flex gap-2">
          <button 
            className={`win95-button text-xs ${showOriginal ? 'bg-primary text-primary-foreground' : ''}`}
            onClick={() => setShowOriginal(true)}
          >
            Before
          </button>
          <button 
            className={`win95-button text-xs ${!showOriginal ? 'bg-primary text-primary-foreground' : ''}`}
            onClick={() => setShowOriginal(false)}
          >
            After
          </button>
        </div>
        
        <div className="flex gap-1">
          <button 
            className="win95-button p-1"
            onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
          <span className="win95-button p-1 px-2 text-xs">{Math.round(zoom * 100)}%</span>
          <button 
            className="win95-button p-1"
            onClick={() => setZoom(Math.min(4, zoom + 0.25))}
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
          <button 
            className="win95-button p-1"
            onClick={() => setZoom(1)}
            title="Fit to Window"
          >
            <Maximize size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
