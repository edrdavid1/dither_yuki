import { useEffect, useState } from "react";
import type { Layer } from "@/types/layers";
import type { LayerTrack, LayerRange } from "@/lib/videoRuntime/layerTracks";
import { cloneLayerTrack } from "@/lib/videoRuntime/layerTracks";

// ─── Validation ───────────────────────────────────────────────────────────────

interface FieldErrors {
  startFrame?: string;
  endFrame?: string;
  opacity01?: string;
  intensity?: string;
  sourceInFrame?: string;
  sourceOutFrame?: string;
}

interface DraftRange {
  startFrame: number;
  endFrame: number;
  enabled: boolean;
  opacity01: number;
  intensity: number;
  sourceInFrame: number | undefined;
  sourceOutFrame: number | undefined;
}

export function validateRange(draft: DraftRange): FieldErrors {
  const errors: FieldErrors = {};
  if (draft.startFrame > draft.endFrame) {
    errors.startFrame = "Start > End";
    errors.endFrame = "End < Start";
  }
  if (draft.opacity01 < 0 || draft.opacity01 > 1) {
    errors.opacity01 = "Must be 0–1";
  }
  if (
    draft.sourceInFrame !== undefined &&
    draft.sourceOutFrame !== undefined &&
    draft.sourceInFrame > draft.sourceOutFrame
  ) {
    errors.sourceInFrame = "In > Out";
    errors.sourceOutFrame = "Out < In";
  }
  return errors;
}

function rangeToDraft(range: LayerRange): DraftRange {
  return {
    startFrame: range.startFrame,
    endFrame: range.endFrame,
    enabled: range.enabled ?? true,
    opacity01: range.opacity01 ?? 1,
    intensity: range.intensity ?? 1,
    sourceInFrame: range.sourceInFrame,
    sourceOutFrame: range.sourceOutFrame,
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TrackBlockInspectorProps {
  selectedLayerId: string | null;
  selectedRangeIndex: number | null;
  layers: Layer[];
  tracks: LayerTrack[];
  onUpdateTrack: (track: LayerTrack) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TrackBlockInspector({
  selectedLayerId,
  selectedRangeIndex,
  layers,
  tracks,
  onUpdateTrack,
}: TrackBlockInspectorProps) {
  const track = selectedLayerId ? tracks.find((t) => t.layerId === selectedLayerId) ?? null : null;
  const layer = selectedLayerId ? layers.find((l) => l.id === selectedLayerId) ?? null : null;

  const [activeRangeIndex, setActiveRangeIndex] = useState<number | null>(selectedRangeIndex);

  useEffect(() => {
    if (selectedLayerId === null) { setActiveRangeIndex(null); return; }
    const t = tracks.find((tr) => tr.layerId === selectedLayerId) ?? null;
    setActiveRangeIndex(t && t.ranges.length > 0 ? 0 : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLayerId]);

  useEffect(() => {
    if (selectedRangeIndex !== null) setActiveRangeIndex(selectedRangeIndex);
  }, [selectedRangeIndex]);

  const range = track && activeRangeIndex !== null ? (track.ranges[activeRangeIndex] ?? null) : null;

  const [draft, setDraft] = useState<DraftRange | null>(range ? rangeToDraft(range) : null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [committed, setCommitted] = useState(false);

  useEffect(() => {
    if (range) {
      const d = rangeToDraft(range);
      setDraft(d);
      setErrors(validateRange(d));
    } else {
      setDraft(null);
      setErrors({});
    }
    setCommitted(false);
  }, [range]);

  const hasErrors = Object.keys(errors).length > 0;

  function updateField<K extends keyof DraftRange>(key: K, value: DraftRange[K]) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      setErrors(validateRange(next));
      setCommitted(false);
      return next;
    });
  }

  function handleCommit() {
    if (!draft || !track || activeRangeIndex === null || hasErrors) return;
    const updatedRange: LayerRange = {
      startFrame: draft.startFrame,
      endFrame: draft.endFrame,
      enabled: draft.enabled,
      opacity01: draft.opacity01,
      intensity: draft.intensity,
      ...(draft.sourceInFrame !== undefined ? { sourceInFrame: draft.sourceInFrame } : {}),
      ...(draft.sourceOutFrame !== undefined ? { sourceOutFrame: draft.sourceOutFrame } : {}),
    };
    const updatedTrack = cloneLayerTrack(track);
    updatedTrack.ranges[activeRangeIndex] = updatedRange;
    onUpdateTrack(updatedTrack);
    setCommitted(true);
  }

  // ── Placeholder ─────────────────────────────────────────────────────────────
  if (!selectedLayerId || !track || activeRangeIndex === null || !range || !draft) {
    return (
      <div
        className="flex items-center justify-center text-[#555]"
        style={{
          fontFamily: "var(--app-font-mono)",
          fontSize: 10,
          height: 48,
          background: "#111",
          borderTop: "1px solid #222",
        }}
      >
        Select a block to inspect
      </div>
    );
  }

  // ── Inspector ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        background: "#141414",
        borderTop: "1px solid #2a2a2a",
        fontFamily: "var(--app-font-mono)",
        fontSize: 10,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ background: "#1a1a1a", borderBottom: "1px solid #2a2a2a" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[#888] uppercase tracking-widest" style={{ fontSize: 9 }}>Block</span>
          <span className="text-[#ccc] font-bold truncate" style={{ maxWidth: 120 }}>
            {layer?.name ?? selectedLayerId}
          </span>
          <span className="text-[#555]">#{activeRangeIndex}</span>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <span className="text-[#666]">Active</span>
          <ToggleSwitch
            checked={draft.enabled}
            onChange={(v) => updateField("enabled", v)}
          />
        </label>
      </div>

      {/* Fields grid */}
      <div className="grid grid-cols-2 gap-px" style={{ background: "#2a2a2a" }}>
        {/* Timing */}
        <InspectorSection label="Timing" cols={2}>
          <InspectorRow label="In" error={errors.startFrame}>
            <FrameInput
              value={draft.startFrame}
              onChange={(v) => updateField("startFrame", v)}
              hasError={!!errors.startFrame}
            />
          </InspectorRow>
          <InspectorRow label="Out" error={errors.endFrame}>
            <FrameInput
              value={draft.endFrame}
              onChange={(v) => updateField("endFrame", v)}
              hasError={!!errors.endFrame}
            />
          </InspectorRow>
          <InspectorRow label="Duration">
            <span className="text-[#888] px-2" style={{ fontSize: 10 }}>
              {Math.max(0, draft.endFrame - draft.startFrame + 1)} fr
            </span>
          </InspectorRow>
        </InspectorSection>

        {/* Appearance */}
        <InspectorSection label="Appearance" cols={2}>
          <InspectorRow label="Opacity" error={errors.opacity01}>
            <SliderInput
              value={draft.opacity01}
              min={0} max={1} step={0.01}
              onChange={(v) => updateField("opacity01", v)}
              hasError={!!errors.opacity01}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </InspectorRow>
          <InspectorRow label="Intensity" error={errors.intensity}>
            <SliderInput
              value={draft.intensity}
              min={0} max={2} step={0.01}
              onChange={(v) => updateField("intensity", v)}
              hasError={!!errors.intensity}
              format={(v) => v.toFixed(2)}
            />
          </InspectorRow>
        </InspectorSection>

        {/* Source range */}
        <InspectorSection label="Source Range" cols={2}>
          <InspectorRow label="Src In" error={errors.sourceInFrame}>
            <FrameInput
              value={draft.sourceInFrame ?? 0}
              onChange={(v) => updateField("sourceInFrame", v)}
              hasError={!!errors.sourceInFrame}
              placeholder="—"
            />
          </InspectorRow>
          <InspectorRow label="Src Out" error={errors.sourceOutFrame}>
            <FrameInput
              value={draft.sourceOutFrame ?? 0}
              onChange={(v) => updateField("sourceOutFrame", v)}
              hasError={!!errors.sourceOutFrame}
              placeholder="—"
            />
          </InspectorRow>
        </InspectorSection>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ borderTop: "1px solid #2a2a2a" }}
      >
        {hasErrors ? (
          <span className="text-[#e05050]" style={{ fontSize: 9 }}>
            Fix errors before applying
          </span>
        ) : committed ? (
          <span className="text-[#4caf50]" style={{ fontSize: 9 }}>✓ Applied</span>
        ) : (
          <span className="text-[#555]" style={{ fontSize: 9 }}>Unsaved changes</span>
        )}
        <button
          type="button"
          onClick={handleCommit}
          disabled={hasErrors}
          style={{
            background: hasErrors ? "#2a2a2a" : "#1e3a5f",
            border: `1px solid ${hasErrors ? "#333" : "#4a90d9"}`,
            color: hasErrors ? "#555" : "#a8d4ff",
            padding: "2px 12px",
            fontSize: 10,
            cursor: hasErrors ? "not-allowed" : "pointer",
            fontFamily: "var(--app-font-mono)",
            letterSpacing: "0.05em",
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InspectorSection({
  label,
  children,
  cols = 1,
}: {
  label: string;
  children: React.ReactNode;
  cols?: number;
}) {
  return (
    <div
      className="flex flex-col"
      style={{
        gridColumn: cols === 2 ? "span 2" : undefined,
        background: "#141414",
      }}
    >
      <div
        className="px-3 py-0.5 uppercase tracking-widest text-[#555]"
        style={{ fontSize: 8, borderBottom: "1px solid #1e1e1e" }}
      >
        {label}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function InspectorRow({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div
      className="flex items-center"
      style={{ borderBottom: "1px solid #1e1e1e", minHeight: 24 }}
    >
      <div
        className="shrink-0 px-3 text-[#666]"
        style={{ width: 72, fontSize: 10 }}
      >
        {label}
      </div>
      <div className="flex-1 flex items-center">
        {children}
        {error && (
          <span className="ml-1 text-[#e05050]" style={{ fontSize: 9 }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

function FrameInput({
  value,
  onChange,
  hasError,
  placeholder,
}: {
  value: number;
  onChange: (v: number) => void;
  hasError?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      step={1}
      min={0}
      placeholder={placeholder}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10);
        if (!Number.isNaN(v)) onChange(v);
      }}
      style={{
        background: "transparent",
        border: "none",
        borderLeft: `2px solid ${hasError ? "#e05050" : "transparent"}`,
        color: hasError ? "#e05050" : "#ddd",
        fontFamily: "var(--app-font-mono)",
        fontSize: 10,
        padding: "2px 8px",
        width: "100%",
        outline: "none",
      }}
      onFocus={(e) => { e.currentTarget.style.background = "#1e1e1e"; }}
      onBlur={(e) => { e.currentTarget.style.background = "transparent"; }}
    />
  );
}

function SliderInput({
  value,
  min,
  max,
  step,
  onChange,
  hasError,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  hasError?: boolean;
  format: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-1 flex-1 px-2">
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: hasError ? "#e05050" : "#4a90d9", height: 2 }}
      />
      <span
        style={{
          color: hasError ? "#e05050" : "#888",
          fontSize: 10,
          minWidth: 36,
          textAlign: "right",
          fontFamily: "var(--app-font-mono)",
        }}
      >
        {format(value)}
      </span>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 28,
        height: 14,
        borderRadius: 7,
        background: checked ? "#4a90d9" : "#333",
        border: `1px solid ${checked ? "#4a90d9" : "#444"}`,
        position: "relative",
        cursor: "pointer",
        transition: "background 0.15s",
        padding: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 14 : 2,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}
