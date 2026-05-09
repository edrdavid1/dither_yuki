import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePerformanceBudget } from "@/hooks/usePerformanceBudget";

describe("usePerformanceBudget", () => {
  it("reports when preview budget is exceeded", async () => {
    const setStatus = vi.fn();
    const { result } = renderHook(() =>
      usePerformanceBudget({ setStatus, previewBudgetMs: 1, exportBudgetMs: 1 }),
    );

    await act(async () => {
      await result.current.measureBudget("preview", async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
    });

    expect(setStatus).toHaveBeenCalledWith(expect.stringContaining("Preview budget exceeded"));
  });
});

