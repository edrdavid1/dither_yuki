/**
 * useMasterClock — subscribes to the Rust MasterClockService Tauri events and
 * exposes transport controls that invoke the corresponding Tauri commands.
 *
 * Requirements: 2.9
 */

import { useEffect, useRef, useState } from "react";
import { safeTauriInvoke } from "@/lib/tauriBridge";
import { useVideoPlaybackStore } from "@/store/videoPlaybackStore";

export interface UseMasterClockResult {
  /** True when the Rust clock is available and driving the playhead. */
  tauriAvailable: boolean;
  /** True while playback has been requested but the first Rust tick has not arrived yet. */
  awaitingFirstTick: boolean;
  play: (fps: number, inFrame: number, outFrame: number, totalFrames: number) => void;
  pause: () => void;
  seek: (frame: number) => void;
  setLoop: (enabled: boolean) => void;
}

/**
 * Subscribe to `clock_tick` and `transport_stopped` Tauri events emitted by
 * the Rust MasterClockService.  On each tick the playhead frame index in
 * `videoPlaybackStore` is updated.  When the transport stops the `playing`
 * flag is cleared.
 *
 * The returned helpers (`play`, `pause`, `seek`, `setLoop`) invoke the
 * corresponding Tauri commands via `safeTauriInvoke`.
 *
 * `tauriAvailable` is `true` once the event listener is successfully registered.
 * When `false`, the caller should fall back to the JS interval in
 * `useVideoPlaybackOrchestration` (pass `masterClockEnabled: false`).
 */
export function useMasterClock(): UseMasterClockResult {
  const setPlayheadFrameIndex = useVideoPlaybackStore((s) => s.setPlayheadFrameIndex);
  const setPlaying = useVideoPlaybackStore((s) => s.setPlaying);

  // Whether the Tauri event API is available in this runtime.
  const [tauriAvailable, setTauriAvailable] = useState(false);
  const [awaitingFirstTick, setAwaitingFirstTick] = useState(false);

  const awaitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep stable refs so the cleanup function always has the latest setters
  // without needing to re-subscribe to Tauri events on every render.
  const setPlayheadRef = useRef(setPlayheadFrameIndex);
  setPlayheadRef.current = setPlayheadFrameIndex;

  const setPlayingRef = useRef(setPlaying);
  setPlayingRef.current = setPlaying;

  useEffect(() => {
    let unlistenTick: (() => void) | null = null;
    let unlistenStopped: (() => void) | null = null;
    let cancelled = false;

    const clearAwaitingFirstTick = () => {
      if (awaitingTimerRef.current !== null) {
        clearTimeout(awaitingTimerRef.current);
        awaitingTimerRef.current = null;
      }
      setAwaitingFirstTick(false);
    };

    const subscribe = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");

        if (cancelled) return;

        unlistenTick = await listen<{ frame: number }>("clock_tick", (event) => {
          clearAwaitingFirstTick();
          setPlayheadRef.current(event.payload.frame);
        });

        if (cancelled) {
          if (unlistenTick) {
            try {
              unlistenTick();
            } catch (err) {
              console.warn("[useMasterClock] clock_tick unlisten failed during setup cancellation", err);
            }
          }
          return;
        }

        unlistenStopped = await listen<void>("transport_stopped", () => {
          clearAwaitingFirstTick();
          setPlayingRef.current(false);
        });

        if (cancelled) {
          if (unlistenTick) {
            try {
              unlistenTick();
            } catch (err) {
              console.warn("[useMasterClock] clock_tick unlisten failed during setup cancellation", err);
            }
          }
          if (unlistenStopped) {
            try {
              unlistenStopped();
            } catch (err) {
              console.warn("[useMasterClock] transport_stopped unlisten failed during setup cancellation", err);
            }
          }
          return;
        }

        // Both listeners registered successfully — Rust clock is available.
        setTauriAvailable(true);
      } catch (err) {
        // Tauri event API is unavailable (browser / test environment).
        // JS interval fallback in useVideoPlaybackOrchestration will be used.
        console.warn("[useMasterClock] Tauri events unavailable, using JS fallback", err);
        setTauriAvailable(false);
      }
    };

    void subscribe();

    return () => {
      cancelled = true;
      if (awaitingTimerRef.current !== null) {
        clearTimeout(awaitingTimerRef.current);
        awaitingTimerRef.current = null;
      }
      if (unlistenTick) {
        try {
          unlistenTick();
        } catch (err) {
          console.warn("[useMasterClock] clock_tick unlisten failed", err);
        }
      }
      if (unlistenStopped) {
        try {
          unlistenStopped();
        } catch (err) {
          console.warn("[useMasterClock] transport_stopped unlisten failed", err);
        }
      }
    };
  }, []);

  const play = (fps: number, inFrame: number, outFrame: number, totalFrames: number) => {
    if (awaitingTimerRef.current !== null) {
      clearTimeout(awaitingTimerRef.current);
      awaitingTimerRef.current = null;
    }
    // Set playing immediately — don't wait for the first Rust tick.
    // The RAF pull loop in useVideoCanvas will start pulling frames right away.
    setAwaitingFirstTick(false);
    setPlaying(true);

    void safeTauriInvoke("transport_play", { fps, inFrame, outFrame, totalFrames })
      .then((result) => {
        if (result === null) {
          // transport_play command failed — fall back to JS interval.
          console.warn("[useMasterClock] transport_play returned null, disabling Tauri clock");
          setTauriAvailable(false);
        } else {
          setTauriAvailable(true);
        }
      });
  };

  const pause = () => {
    if (awaitingTimerRef.current !== null) {
      clearTimeout(awaitingTimerRef.current);
      awaitingTimerRef.current = null;
    }
    setAwaitingFirstTick(false);
    setPlaying(false);
    void safeTauriInvoke("transport_pause");
  };

  const seek = (frame: number) => {
    if (awaitingTimerRef.current !== null) {
      clearTimeout(awaitingTimerRef.current);
      awaitingTimerRef.current = null;
    }
    setAwaitingFirstTick(false);
    setPlayheadFrameIndex(frame);
    void safeTauriInvoke("transport_seek", { frame });
  };

  const setLoop = (enabled: boolean) => {
    void safeTauriInvoke("transport_set_loop", { enabled });
  };

  return { tauriAvailable, awaitingFirstTick, play, pause, seek, setLoop };
}
