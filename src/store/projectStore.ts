// Project store — Zustand + zundo for undo/redo.
// Tracks the manifest, dirty state, and save/load lifecycle.

import { create } from "zustand";
import { temporal } from "zundo";
import { safeTauriInvoke } from "../lib/tauriBridge";
import type { DyprojManifest, LoadProjectResult } from "../types/project";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function hashManifest(m: DyprojManifest): string {
  // Lightweight hash: JSON stringify of the manifest (minus heavy binary refs)
  return JSON.stringify({
    version: m.version,
    id: m.id,
    name: m.name,
    layers: m.layers,
    palettes: m.palettes,
    assets: m.assets,
    animation: m.animation,
    videoLayerTracks: m.videoLayerTracks,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// State shape
// ────────────────────────────────────────────────────────────────────────────

export interface ProjectSlice {
  manifest: DyprojManifest | null;
  /** Hash of the manifest as it was at the last save. */
  savedHash: string | null;
  /** Absolute path of the currently open file, or null if unsaved. */
  filePath: string | null;
  /** IDs of external assets that could not be relinked. */
  offlineAssets: string[];

  // Actions
  newProject: (name: string) => void;
  loadProject: (path: string) => Promise<{ offlineAssets: string[]; timelineData: number[] | null }>;
  saveProject: (path: string, timelineData?: number[] | null) => Promise<void>;
  updateManifest: (updater: (m: DyprojManifest) => DyprojManifest) => void;

  // Dirty check helpers
  isDirty: () => boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────────────────────

// The temporal (zundo) middleware wraps only the manifest slice so that
// undo/redo does NOT replay heavy binary timeline data.
export const useProjectStore = create<ProjectSlice>()(
  temporal(
    (set, get) => ({
      manifest: null,
      savedHash: null,
      filePath: null,
      offlineAssets: [],

      newProject: (name) => {
        const manifest: DyprojManifest = {
          version: "1.0",
          id: crypto.randomUUID(),
          createdAt: now(),
          modifiedAt: now(),
          name,
          description: null,
          layers: [],
          palettes: [],
          assets: [],
          animation: null,
          videoLayerTracks: [],
        };
        set({ manifest, savedHash: null, filePath: null, offlineAssets: [] });
      },

      loadProject: async (path) => {
        const result = await safeTauriInvoke<LoadProjectResult>("load_project", { path });
        if (!result) throw new Error("Failed to load project");
        const hash = hashManifest(result.manifest);
        set({
          manifest: result.manifest,
          savedHash: hash,
          filePath: path,
          offlineAssets: result.offlineAssets,
        });
        return { offlineAssets: result.offlineAssets, timelineData: result.timelineData ?? null };
      },

      saveProject: async (path, timelineData = null) => {
        const { manifest } = get();
        if (!manifest) throw new Error("No project open");
        const updated: DyprojManifest = { ...manifest, modifiedAt: now() };
        // Use direct invoke so errors propagate instead of silently returning null.
        const { invoke } = await import("@tauri-apps/api/core");
        try {
          await invoke("save_project", { path, manifest: updated, timelineData });
        } catch (err) {
          throw new Error(`Rust save_project failed: ${err}`);
        }
        const hash = hashManifest(updated);
        set({ manifest: updated, savedHash: hash, filePath: path });
      },

      updateManifest: (updater) => {
        const { manifest } = get();
        if (!manifest) return;
        set({ manifest: updater(manifest) });
      },

      isDirty: () => {
        const { manifest, savedHash } = get();
        if (!manifest) return false;
        if (!savedHash) return true;
        return hashManifest(manifest) !== savedHash;
      },
    }),
    {
      // Exclude non-serializable / heavy fields from undo history
      partialize: (state) => ({
        manifest: state.manifest,
      }),
    }
  )
);

// ────────────────────────────────────────────────────────────────────────────
// Dirty-check hook
// ────────────────────────────────────────────────────────────────────────────

export function useDirtyCheck(): boolean {
  return useProjectStore((s) => s.isDirty());
}

// ────────────────────────────────────────────────────────────────────────────
// Auto-save every 5 minutes to the OS temp directory via the Tauri command
// ────────────────────────────────────────────────────────────────────────────

const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000;

if (typeof window !== "undefined") {
  setInterval(async () => {
    const state = useProjectStore.getState();
    if (!state.manifest || !state.isDirty()) return;
    try {
      const tmpPath = await safeTauriInvoke<string>("get_default_output_path", {
        fileName: `autosave_${state.manifest.id}.dyproj`,
      });
      if (tmpPath) {
        await state.saveProject(tmpPath);
        console.info("[autosave] saved to", tmpPath);
      }
    } catch (err) {
      console.warn("[autosave] failed:", err);
    }
  }, AUTO_SAVE_INTERVAL_MS);
}
