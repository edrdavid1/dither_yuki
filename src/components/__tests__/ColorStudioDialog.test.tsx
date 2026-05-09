import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColorStudioDialog } from "@/components/ColorStudioDialog";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!("ResizeObserver" in globalThis)) {
  (globalThis as { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock;
}

const baseProps = {
  quantizationMethod: "median-cut",
  setQuantizationMethod: vi.fn(),
  quantizationColorCount: 8,
  setQuantizationColorCount: vi.fn(),
  canAutoQuantize: true,
  canExtractFromOriginal: true,
  isQuantizing: false,
  onExtractFromImage: vi.fn(async () => null),
  onExtractFromOriginal: vi.fn(async () => null),
  onImportPalette: vi.fn(async () => null),
  onExportPalette: vi.fn(async () => {}),
  onSave: vi.fn(),
  onClose: vi.fn(),
};

describe("ColorStudioDialog", () => {
  it("syncs manual editor values when initialColors prop changes", () => {
    const { rerender } = render(
      <ColorStudioDialog
        {...baseProps}
        initialColors={["#000000", "#FFFFFF"]}
      />,
    );

    expect(screen.getByDisplayValue("#000000")).toBeTruthy();
    expect(screen.getByDisplayValue("#FFFFFF")).toBeTruthy();

    rerender(
      <ColorStudioDialog
        {...baseProps}
        initialColors={["#0F380F", "#306230", "#8BAC0F", "#9BBC0F"]}
      />,
    );

    expect(screen.getByDisplayValue("#0F380F")).toBeTruthy();
    expect(screen.getByDisplayValue("#306230")).toBeTruthy();
    expect(screen.getByDisplayValue("#8BAC0F")).toBeTruthy();
    expect(screen.getByDisplayValue("#9BBC0F")).toBeTruthy();
  });
});

