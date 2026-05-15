const GPU_PREVIEW_FLAG = "videoGpuPipelineEnabled";
const GPU_RENDER_FLAG = "videoGpuRenderEnabled";

function readFlag(key: string): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === "1" || value === "true";
  } catch {
    return false;
  }
}

export function isVideoGpuPreviewEnabled(): boolean {
  return readFlag(GPU_PREVIEW_FLAG);
}

export function isVideoGpuRenderEnabled(): boolean {
  return readFlag(GPU_RENDER_FLAG);
}

