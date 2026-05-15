/**
 * VideoPreviewCanvas — smooth video preview component.
 *
 * Renders video frames directly to a canvas via useVideoCanvas,
 * bypassing React state for each frame. Supports zoom, fit-to-window,
 * and a status overlay (timecode, processing time, cache indicator).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useVideoCanvas, type VideoCanvasFrameInfo } from "@/hooks/useVideoCanvas";
import type { LayerTrack } from "@/lib/videoRuntime/layerTracks";
import { toast } from "sonner";

interface VideoPreviewCanvasProps {
  enabled: boolean;
  videoSource: File | null;
  videoId: string | null;
  videoMetadata: { width?: number; height?: number; fps?: number } | null;
  videoPlayheadFrameIndex: number;
  videoPlaying: boolean;
  videoFps: number;
  layerPayload: unknown[];
  layerTracks: LayerTrack[];
  processingBackend: "cpu" | "gpu";
  /** Show the raw (unprocessed) frame instead of the filtered one. */
  showOriginal?: boolean;
  /** Raw RGBA surface for the "Before" view. */
  originalRgba?: { width: number; height: number; rgba: Uint8ClampedArray } | null;
}

function drawRgbaToCanvas(
  canvas: HTMLCanvasElement,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (!width || !height || rgba.length !== width * height * 4) return;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
}

export function VideoPreviewCanvas({
  enabled,
  videoSource,
  videoId,
  videoMetadata,
  videoPlayheadFrameIndex,
  videoPlaying,
  videoFps,
  layerPayload,
  layerTracks,
  processingBackend,
  showOriginal = false,
  originalRgba,
}: VideoPreviewCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const hasManualZoomRef = useRef(false);
  const [frameInfo, setFrameInfo] = useState<VideoCanvasFrameInfo | null>(null);
  const [hasDrawnProcessedFrame, setHasDrawnProcessedFrame] = useState(false);
  const hasShownFfmpegErrorRef = useRef(false);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  const { canvasRef: processedCanvasRef, drawFrame } = useVideoCanvas({
    enabled,
    videoSource,
    videoId,
    videoMetadata,
    videoPlayheadFrameIndex,
    videoPlaying,
    videoFps,
    layerPayload,
    layerTracks,
    processingBackend,
    onFrameDrawn: setFrameInfo,
  });

  useEffect(() => {
    setFrameInfo(null);
    setHasDrawnProcessedFrame(false);
    hasShownFfmpegErrorRef.current = false;
  }, [enabled, videoId, videoMetadata?.height, videoMetadata?.width]);

  useEffect(() => {
    if (frameInfo) {
      setHasDrawnProcessedFrame(true);
      
      if (frameInfo.ffmpegErrors && !hasShownFfmpegErrorRef.current) {
        toast.warning("Video contains corruption", {
          description: "FFmpeg detected bitstream errors. Some frames may be skipped or glitched.",
          duration: 5000,
        });
        hasShownFfmpegErrorRef.current = true;
      }
    }
  }, [frameInfo]);

  // Draw original (Before) canvas when originalRgba changes.
  useEffect(() => {
    const canvas = originalCanvasRef.current;
    if (!canvas || !originalRgba) return;
    drawRgbaToCanvas(canvas, originalRgba.rgba, originalRgba.width, originalRgba.height);
  }, [originalRgba]);

  // Fit to window.
  const fitToWindow = useCallback(() => {
    const container = containerRef.current;
    const w = videoMetadata?.width ?? originalRgba?.width ?? 0;
    const h = videoMetadata?.height ?? originalRgba?.height ?? 0;
    if (!container || !w || !h) { setZoom(1); return; }
    const pad = 32;
    const wr = (container.clientWidth - pad) / w;
    const hr = (container.clientHeight - pad) / h;
    const z = Math.max(0.1, Math.min(4, Math.min(wr, hr, 1)));
    setZoom(Number.isFinite(z) ? z : 1);
    setPanX(0);
    setPanY(0);
  }, [videoMetadata?.width, videoMetadata?.height, originalRgba?.width, originalRgba?.height]);

  // Auto-scale based on quality mode: fast mode uses smaller zoom, accurate uses fit-to-window
  useEffect(() => {
    if (!hasManualZoomRef.current && frameInfo) {
      if (frameInfo.quality === "fast") {
        // Fast mode: use smaller zoom to show more context
        const container = containerRef.current;
        const w = frameInfo.width;
        const h = frameInfo.height;
        if (container && w && h) {
          const pad = 32;
          const wr = (container.clientWidth - pad) / w;
          const hr = (container.clientHeight - pad) / h;
          const z = Math.max(0.1, Math.min(2, Math.min(wr, hr, 0.75)));
          setZoom(Number.isFinite(z) ? z : 0.75);
        }
      } else {
        // Accurate mode: fit to window for detailed work
        fitToWindow();
      }
    }
  }, [frameInfo?.quality, frameInfo?.width, frameInfo?.height, fitToWindow]);

  useEffect(() => {
    if (!hasManualZoomRef.current) fitToWindow();
  }, [fitToWindow, videoSource]);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (!hasManualZoomRef.current) fitToWindow();
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [fitToWindow]);

  // Handle mouse wheel for zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!containerRef.current) return;
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    hasManualZoomRef.current = true;
    setZoom((z) => Math.max(0.1, Math.min(4, z + delta)));
  }, []);

  // Handle mouse drag for panning
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button !== 2 && e.button !== 1) return; // Right-click or middle-click
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX - panX, y: e.clientY - panY };
  }, [panX, panY]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isPanningRef.current) return;
    setPanX(e.clientX - panStartRef.current.x);
    setPanY(e.clientY - panStartRef.current.y);
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    
    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleWheel, handleMouseDown, handleMouseMove, handleMouseUp]);

  const hasContent = Boolean(videoSource);
  const safeFps = Math.max(1, videoFps);
  const timecode = frameToTimecode(videoPlayheadFrameIndex, safeFps);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        background: "#0a0a0a",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: isPanningRef.current ? "grabbing" : "grab",
        userSelect: "none",
      }}
    >
      {hasContent ? (
        <>
          {/** Once a processed frame has been drawn, the original frame should
           * stay out of the way so playback reads as motion rather than a
           * tiny overlay on top of a frozen source frame. */}
          {/** The original canvas remains as a loading fallback until the first
           * processed frame arrives. */}
          {/* Original canvas (Before) */}
          <canvas
            ref={originalCanvasRef}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${zoom})`,
              transformOrigin: "center center",
              imageRendering: "pixelated",
              maxWidth: "none",
              zIndex: 0,
              opacity: showOriginal || !hasDrawnProcessedFrame ? 1 : 0,
              transition: "opacity 80ms linear",
              pointerEvents: "none",
            }}
          />

          {/* Processed canvas (After) */}
          <canvas
            ref={processedCanvasRef}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${zoom})`,
              transformOrigin: "center center",
              imageRendering: "pixelated",
              maxWidth: "none",
              zIndex: 1,
              opacity: showOriginal ? 0 : hasDrawnProcessedFrame ? 1 : 0,
              transition: "opacity 80ms linear",
              pointerEvents: "none",
            }}
          />

          {/* Status overlay — bottom left */}
          <div
            style={{
              position: "absolute",
              bottom: 8,
              left: 8,
              display: "flex",
              gap: 6,
              alignItems: "center",
              pointerEvents: "none",
            }}
          >
            {/* Timecode */}
            <span
              style={{
                background: "rgba(0,0,0,0.7)",
                color: "#e8e800",
                fontFamily: "var(--app-font-mono)",
                fontSize: 11,
                padding: "2px 6px",
                letterSpacing: "0.08em",
                borderRadius: 2,
              }}
            >
              {timecode}
            </span>

            {/* Processing info */}
            {frameInfo && (
              <span
                style={{
                  background: "rgba(0,0,0,0.6)",
                  color: frameInfo.cacheHit ? "#4caf50" : "#888",
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 9,
                  padding: "2px 5px",
                  borderRadius: 2,
                }}
              >
                {frameInfo.cacheHit ? "⚡" : "⟳"} {frameInfo.processingMs.toFixed(0)}ms
                {" · "}{frameInfo.quality === "accurate" ? "HQ" : "fast"}
                {" · "}{frameInfo.width}×{frameInfo.height}
              </span>
            )}

            {/* Playing indicator */}
            {videoPlaying && (
              <span
                style={{
                  background: "rgba(232,0,0,0.8)",
                  color: "#fff",
                  fontFamily: "var(--app-font-mono)",
                  fontSize: 9,
                  padding: "2px 5px",
                  borderRadius: 2,
                  letterSpacing: "0.1em",
                }}
              >
                ● REC
              </span>
            )}
          </div>

          {/* Zoom controls — bottom right */}
          <div
            style={{
              position: "absolute",
              bottom: 8,
              right: 8,
              display: "flex",
              gap: 2,
              pointerEvents: "auto",
            }}
          >
            <ZoomBtn onClick={() => { hasManualZoomRef.current = true; setZoom((z) => Math.max(0.1, z - 0.25)); }}>−</ZoomBtn>
            <ZoomBtn
              onClick={() => { hasManualZoomRef.current = false; fitToWindow(); }}
              style={{ minWidth: 44, fontSize: 9 }}
              title="Reset zoom and pan (or press R)"
            >
              {Math.round(zoom * 100)}%
            </ZoomBtn>
            <ZoomBtn onClick={() => { hasManualZoomRef.current = true; setZoom((z) => Math.min(4, z + 0.25)); }}>+</ZoomBtn>
          </div>

          {/* Help text for pan/zoom */}
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              display: "flex",
              gap: 8,
              fontSize: 9,
              color: "#666",
              fontFamily: "var(--app-font-mono)",
              pointerEvents: "none",
            }}
          >
            <span title="Scroll to zoom">🖱️ Scroll</span>
            <span title="Right-click and drag to pan">🖱️ RMB+Drag</span>
          </div>
        </>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            color: "#333",
            fontFamily: "var(--app-font-mono)",
            fontSize: 11,
          }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="#333" strokeWidth="1.5">
            <rect x="2" y="6" width="28" height="20" rx="2" />
            <polygon points="12,11 24,16 12,21" fill="#333" stroke="none" />
          </svg>
          <span>Drop a video file or use File → Open</span>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function frameToTimecode(frame: number, fps: number): string {
  const f = Math.max(0, Math.round(frame));
  const safeFps = Math.max(1, Math.round(fps));
  const totalSecs = Math.floor(f / safeFps);
  const ff = f % safeFps;
  const ss = totalSecs % 60;
  const mm = Math.floor(totalSecs / 60) % 60;
  const hh = Math.floor(totalSecs / 3600);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}:${String(ff).padStart(2, "0")}`;
}

function ZoomBtn({
  children,
  onClick,
  style,
}: {
  children: React.ReactNode;
  onClick: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "rgba(0,0,0,0.6)",
        border: "1px solid #333",
        color: "#888",
        fontFamily: "var(--app-font-mono)",
        fontSize: 11,
        padding: "2px 6px",
        cursor: "pointer",
        borderRadius: 2,
        minWidth: 24,
        ...style,
      }}
    >
      {children}
    </button>
  );
}
