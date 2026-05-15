import { useRef, useEffect, useState, useCallback } from "react";
import { Expand, Image, Minus, Plus, Search } from "pixelarticons/react";

interface PreviewPanelProps {
  originalImage: HTMLImageElement | null;
  processedImage: HTMLImageElement | null;
  originalRgba?: { width: number; height: number; rgba: Uint8ClampedArray } | null;
  processedRgba?: { width: number; height: number; rgba: Uint8ClampedArray } | null;
  processingMs?: number | null;
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
  onFileDrop?: (file: File) => void;
}

export const PreviewPanel = ({ 
  originalImage, 
  processedImage,
  originalRgba = null,
  processedRgba = null,
  processingMs = null,
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
  onFileDrop,
}: PreviewPanelProps) => {
  const [dragOver, setDragOver] = useState(false);
  const selectedRgbaSurface = showOriginal ? originalRgba : (processedRgba ?? originalRgba);
  const imageSurface = showOriginal ? (originalImage ?? processedImage) : (processedImage ?? originalImage);

  const isValidRgbaSurface = Boolean(
    selectedRgbaSurface &&
      selectedRgbaSurface.width > 0 &&
      selectedRgbaSurface.height > 0 &&
      selectedRgbaSurface.rgba.length === selectedRgbaSurface.width * selectedRgbaSurface.height * 4,
  );

  const safeRgbaSurface = isValidRgbaSurface ? selectedRgbaSurface : null;

  const hasRgbaSurface = Boolean(safeRgbaSurface);
  const hasImageSurface = Boolean(imageSurface);
  const hasPreviewSurface = hasRgbaSurface || hasImageSurface;
  const previewDimensions = hasRgbaSurface
    ? `${safeRgbaSurface?.width ?? 0}×${safeRgbaSurface?.height ?? 0}`
    : hasImageSurface
      ? `${imageSurface?.width ?? 0}×${imageSurface?.height ?? 0}`
      : "No preview surface yet";

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileDrop?.(file);
  }, [onFileDrop]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const hasManualZoomRef = useRef(false);

  const fitToWindow = useCallback(() => {
    const container = containerRef.current;
    const width = safeRgbaSurface?.width ?? imageSurface?.width;
    const height = safeRgbaSurface?.height ?? imageSurface?.height;
    if (!container || !width || !height) {
      setZoom(1);
      return;
    }

    const padding = 40;
    const widthRatio = (container.clientWidth - padding) / width;
    const heightRatio = (container.clientHeight - padding) / height;
    const nextZoom = Math.max(0.25, Math.min(4, Math.min(widthRatio, heightRatio, 1)));
    setZoom(Number.isFinite(nextZoom) ? nextZoom : 1);
  }, [imageSurface?.height, imageSurface?.width, safeRgbaSurface?.height, safeRgbaSurface?.width]);

  useEffect(() => {
    if (!originalImage && !processedImage && !originalRgba && !processedRgba) {
      hasManualZoomRef.current = false;
      setZoom(1);
      return;
    }

    if (!hasManualZoomRef.current) {
      fitToWindow();
    }
  }, [fitToWindow, originalImage, originalRgba, processedImage, processedRgba, showOriginal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (safeRgbaSurface) {
      try {
        canvas.width = safeRgbaSurface.width;
        canvas.height = safeRgbaSurface.height;
        // Use any to avoid complex TS issues with SharedArrayBuffer in some environments
        const imageData = new ImageData(safeRgbaSurface.rgba as any, safeRgbaSurface.width, safeRgbaSurface.height);
        ctx.putImageData(imageData, 0, 0);
      } catch (error) {
        console.warn("[preview] Failed to draw RGBA surface, falling back to image surface", error);
        if (imageSurface) {
          canvas.width = imageSurface.width;
          canvas.height = imageSurface.height;
          ctx.drawImage(imageSurface, 0, 0);
        }
      }
    } else if (imageSurface) {
      canvas.width = imageSurface.width;
      canvas.height = imageSurface.height;
      ctx.drawImage(imageSurface, 0, 0);
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
  }, [imageSurface, safeRgbaSurface]);

  useEffect(() => {
    const handleResize = () => fitToWindow();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fitToWindow]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="win95-panel flex flex-wrap items-center justify-between gap-1 px-2 py-1">
        <div className="flex items-center gap-2">
          <span className="win98-badge">
            Preview
          </span>
          <span className="text-[10px] text-muted-foreground">
            {hasPreviewSurface ? (animationPlaying ? "Playing frame sequence" : "Live canvas") : "No source loaded"}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {processingMs !== null && (
            <span className="win95-border-inset px-2 py-0.5 font-mono text-[10px]">
              {processingMs.toFixed(1)}ms
            </span>
          )}
          <span className="win95-border-inset px-2 py-0.5 font-mono text-[10px]">
            {previewDimensions}
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`win98-scroll-area win98-scroll flex-1 win95-border-inset bg-white/90 p-1 relative transition-colors${dragOver ? " !bg-blue-50 outline-2 outline-dashed outline-[#000080]" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/10">
            <span className="win98-badge text-sm px-4 py-2">
              Drop to open
            </span>
          </div>
        )}
        {hasPreviewSurface ? (
          <div className="flex min-h-full min-w-full items-start justify-start">
            <canvas 
              ref={canvasRef}
              className="max-w-full h-auto bg-white"
              style={{ 
                imageRendering: 'pixelated',
                display: 'block',
                transform: `scale(${zoom})`,
                transformOrigin: 'top left'
              }}
            />
          </div>
        ) : (
          <div className="win98-empty-state">
            <div className="win98-badge">
              <Image className="h-3 w-3" /> No media loaded
            </div>
            <div className="text-sm font-bold text-foreground">Drop an image or video here</div>
            <p className="text-[10px] text-muted-foreground">or use File → Open</p>
          </div>
        )}
      </div>
      
      <div className="win95-panel flex flex-wrap gap-1 justify-between">
        <div className="flex gap-1 items-center">
          {processingMs !== null && (
            <span className="win95-border-inset px-2 py-0.5 font-mono text-[10px]">
              {processingMs.toFixed(1)}ms
            </span>
          )}
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
        
        <div className="flex gap-[1px]">
          <button 
            className="win95-button p-0.5 px-1.5"
            onClick={() => {
              hasManualZoomRef.current = true;
              setZoom(Math.max(0.25, zoom - 0.25));
            }}
            title="Zoom Out"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="win95-button p-0.5 px-2 text-[11px]">
            {Math.round(zoom * 100)}%
          </span>
          <button 
            className="win95-button p-0.5 px-1.5"
            onClick={() => {
              hasManualZoomRef.current = true;
              setZoom(Math.min(4, zoom + 0.25));
            }}
            title="Zoom In"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button 
            className="win95-button p-0.5 px-1.5"
            onClick={() => {
              hasManualZoomRef.current = false;
              fitToWindow();
            }}
            title="Fit to Window"
          >
            <Expand className="h-3 w-3" />
          </button>
        </div>

        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Search className="h-3 w-3" />
          {previewDimensions}
        </div>
      </div>
    </div>
  );
};
