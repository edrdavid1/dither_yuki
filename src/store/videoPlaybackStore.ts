// Video playback store — Zustand slice for scrub/play state and layer tracks.

import { create } from "zustand";
import type { LayerTrack } from "@/lib/videoRuntime/layerTracks";

type ValueUpdater<T> = T | ((prev: T) => T);

function resolveValue<T>(next: ValueUpdater<T>, prev: T): T {
  return typeof next === "function" ? next(prev) : next;
}

function createInitialVideoPlaybackState() {
  return {
    playheadFrameIndex: 0,
    playing: false,
    playbackStreamReady: false,
    playbackStreamWarmed: false,
    loopEnabled: true,
    inFrame: null as number | null,
    outFrame: null as number | null,
    layerTracks: [] as LayerTrack[],
    selectedBlockLayerId: null as string | null,
    selectedBlockRangeIndex: null as number | null,
    ghostFrameEnabled: false,
  };
}

export interface VideoPlaybackSlice {
  playheadFrameIndex: number;
  playing: boolean;
  playbackStreamReady: boolean;
  playbackStreamWarmed: boolean;
  loopEnabled: boolean;
  inFrame: number | null;
  outFrame: number | null;
  layerTracks: LayerTrack[];
  selectedBlockLayerId: string | null;
  selectedBlockRangeIndex: number | null;
  ghostFrameEnabled: boolean;

  setPlayheadFrameIndex: (next: ValueUpdater<number>) => void;
  setPlaying: (next: ValueUpdater<boolean>) => void;
  setPlaybackStreamReady: (next: ValueUpdater<boolean>) => void;
  setPlaybackStreamWarmed: (next: ValueUpdater<boolean>) => void;
  setLoopEnabled: (next: ValueUpdater<boolean>) => void;
  setInFrame: (next: ValueUpdater<number | null>) => void;
  setOutFrame: (next: ValueUpdater<number | null>) => void;
  setLayerTracks: (next: ValueUpdater<LayerTrack[]>) => void;
  upsertLayerTrack: (track: LayerTrack) => void;
  removeLayerTrack: (layerId: string) => void;
  resetPlaybackState: () => void;
  setSelectedBlock: (layerId: string | null, rangeIndex: number | null) => void;
  setGhostFrameEnabled: (enabled: boolean) => void;
}

export const useVideoPlaybackStore = create<VideoPlaybackSlice>()((set) => ({
  ...createInitialVideoPlaybackState(),

  setPlayheadFrameIndex: (next) => {
    set((state) => ({ playheadFrameIndex: resolveValue(next, state.playheadFrameIndex) }));
  },

  setPlaying: (next) => {
    set((state) => ({ playing: resolveValue(next, state.playing) }));
  },

  setPlaybackStreamReady: (next) => {
    set((state) => ({ playbackStreamReady: resolveValue(next, state.playbackStreamReady) }));
  },

  setPlaybackStreamWarmed: (next) => {
    set((state) => ({ playbackStreamWarmed: resolveValue(next, state.playbackStreamWarmed) }));
  },

  setLoopEnabled: (next) => {
    set((state) => ({ loopEnabled: resolveValue(next, state.loopEnabled) }));
  },

  setInFrame: (next) => {
    set((state) => ({ inFrame: resolveValue(next, state.inFrame) }));
  },

  setOutFrame: (next) => {
    set((state) => ({ outFrame: resolveValue(next, state.outFrame) }));
  },

  setLayerTracks: (next) => {
    set((state) => ({ layerTracks: resolveValue(next, state.layerTracks) }));
  },

  upsertLayerTrack: (track) => {
    set((state) => {
      const layerTracks = state.layerTracks.filter((entry) => entry.layerId !== track.layerId);
      layerTracks.push(track);
      return { layerTracks };
    });
  },

  removeLayerTrack: (layerId) => {
    set((state) => ({ layerTracks: state.layerTracks.filter((track) => track.layerId !== layerId) }));
  },

  resetPlaybackState: () => {
    set(createInitialVideoPlaybackState());
  },

  setSelectedBlock: (layerId, rangeIndex) => {
    set({ selectedBlockLayerId: layerId, selectedBlockRangeIndex: rangeIndex });
  },

  setGhostFrameEnabled: (enabled) => {
    set({ ghostFrameEnabled: enabled });
  },
}));