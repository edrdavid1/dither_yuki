import { useRef, useEffect, useState, useCallback } from "react";
import { Expand, Image, Minus, Plus, Search } from "pixelarticons/react";

interface PreviewPanelProps {
  originalImage: HTMLImageElement | null;
  processedImage: HTMLImageElement | null;
  showOriginal: boolean;
  setShowOriginal: (value: boolean) => void;
  isAnimationMode?: boolean;
  canAnimate?: boolean;
  animationPlaying?: boolean;
  onToggleAnimationPlayback?: () => void;
  animationFps?: number;
  onAnimationFpsChange?: (value: number) => void;
  animationSpeed?: number;
  onAnimationSpeedChange?: (value: number) => void;
}

export const PreviewPanel = ({ 
  originalImage, 
  processedImage,
  showOriginal,
  setShowOriginal,
  isAnimationMode = false,
  canAnimate = false,
  animationPlaying = false,
  onToggleAnimationPlayback,
  animationFps = 12,
  onAnimationFpsChange,
  animationSpeed = 1,
  onAnimationSpeedChange,
}: PreviewPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  const fitToWindow = useCallback(() => {
    const container = containerRef.current;
    const imageToShow = showOriginal ? originalImage : processedImage;
    if (!container || !imageToShow) {
      setZoom(1);
      return;
    }

    const padding = 40;
    const widthRatio = (container.clientWidth - padding) / imageToShow.width;
    const heightRatio = (container.clientHeight - padding) / imageToShow.height;
    const nextZoom = Math.max(0.25, Math.min(4, Math.min(widthRatio, heightRatio, 1)));
    setZoom(Number.isFinite(nextZoom) ? nextZoom : 1);
  }, [originalImage, processedImage, showOriginal]);

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

  useEffect(() => {
    fitToWindow();
  }, [fitToWindow]);

  useEffect(() => {
    const handleResize = () => fitToWindow();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fitToWindow]);

  const imageToShow = showOriginal ? originalImage : processedImage;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div ref={containerRef} className="flex-1 overflow-auto win98-scroll win95-border-inset bg-white/90 p-4 relative">
        {imageToShow ? (
          <div className="flex min-h-full min-w-full items-start justify-start">
            <canvas 
              ref={canvasRef}
              className="max-w-full h-auto bg-white shadow-[8px_8px_0_rgba(0,0,0,0.18)]"
              style={{ 
                imageRendering: 'pixelated',
                transform: `scale(${zoom})`,
                transformOrigin: 'top left'
              }}
            />
          </div>
        ) : (
          <div className="win98-empty-state">
            <div className="win98-badge"><Image className="h-3 w-3" /> Empty canvas</div>
            <div className="text-base font-bold text-foreground">Drop in an image to start shaping the look</div>
            <p className="max-w-md text-xs">The workflow is simple: open a file, tune the recipe on the left, then compare the original and processed result on this stage.</p>
          </div>
        )}
      </div>
      
      <div className="win95-panel preview-controlbar flex flex-wrap gap-1.5 justify-between">
        <div className="flex gap-2">
          <button 
            className={`win95-button text-[11px] px-2 py-0.5 ${showOriginal ? 'bg-primary text-primary-foreground' : ''}`}
            onClick={() => setShowOriginal(true)}
          >
            Before
          </button>
          <button 
            className={`win95-button text-[11px] px-2 py-0.5 ${!showOriginal ? 'bg-primary text-primary-foreground' : ''}`}
            onClick={() => setShowOriginal(false)}
          >
            After
          </button>
        </div>

        {isAnimationMode && (
          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            <button
              className={`win95-button px-1.5 py-0 ${animationPlaying ? "bg-primary text-primary-foreground" : ""}`}
              onClick={onToggleAnimationPlayback}
              disabled={!canAnimate}
              title="Toggle animation playback"
            >
              {animationPlaying ? "❚❚" : "▶"}
            </button>
            <span className="text-muted-foreground">FPS</span>
            <input
              type="number"
              min={1}
              max={60}
              value={animationFps}
              onChange={(event) => onAnimationFpsChange?.(Math.max(1, Math.min(60, Number(event.target.value) || 1)))}
              className="win95-input h-6 w-14 px-1 py-0 text-[10px]"
              title="Animation FPS"
            />
            <span className="text-muted-foreground">Speed</span>
            <select
              value={animationSpeed}
              onChange={(event) => onAnimationSpeedChange?.(Number(event.target.value))}
              className="win95-input h-6 px-1 py-0 text-[10px]"
              title="Animation speed"
            >
              <option value={0.5}>0.5×</option>
              <option value={0.75}>0.75×</option>
              <option value={1}>1×</option>
              <option value={1.25}>1.25×</option>
              <option value={1.5}>1.5×</option>
              <option value={2}>2×</option>
            </select>
          </div>
        )}
        
        <div className="flex gap-1">
          <button 
            className="win95-button p-0.5 px-1.5"
            onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
            title="Zoom Out"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="win95-button p-0.5 px-2 text-[11px]">{Math.round(zoom * 100)}%</span>
          <button 
            className="win95-button p-0.5 px-1.5"
            onClick={() => setZoom(Math.min(4, zoom + 0.25))}
            title="Zoom In"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button 
            className="win95-button p-0.5 px-1.5"
            onClick={fitToWindow}
            title="Fit to Window"
          >
            <Expand className="h-3 w-3" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Search className="h-3 w-3" />
          {imageToShow ? `${imageToShow.width}×${imageToShow.height} preview surface` : "No preview surface yet"}
        </div>
      </div>
    </div>
  );
};
