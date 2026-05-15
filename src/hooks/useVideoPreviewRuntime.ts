import { useEffect } from "react";
import { useVideoPlaybackStore } from "@/store/videoPlaybackStore";

interface UseVideoPreviewRuntimeArgs {
  enabled: boolean;
}

export function useVideoPreviewRuntime({ enabled }: UseVideoPreviewRuntimeArgs) {
  const setGhostFrameEnabled = useVideoPlaybackStore((state) => state.setGhostFrameEnabled);

  useEffect(() => {
    setGhostFrameEnabled(enabled);

    return () => {
      setGhostFrameEnabled(false);
    };
  }, [enabled, setGhostFrameEnabled]);
}

