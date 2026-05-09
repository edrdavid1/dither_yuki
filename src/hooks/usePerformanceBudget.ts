import { useCallback, useRef } from "react";

interface UsePerformanceBudgetArgs {
  setStatus: (status: string) => void;
  previewBudgetMs?: number;
  exportBudgetMs?: number;
}

type BudgetKind = "preview" | "export";

export function usePerformanceBudget({
  setStatus,
  previewBudgetMs = 120,
  exportBudgetMs = 1200,
}: UsePerformanceBudgetArgs) {
  const startedAtRef = useRef<Record<BudgetKind, number>>({
    preview: 0,
    export: 0,
  });

  const beginBudget = useCallback((kind: BudgetKind) => {
    startedAtRef.current[kind] = performance.now();
  }, []);

  const endBudget = useCallback((kind: BudgetKind) => {
    const startedAt = startedAtRef.current[kind];
    if (!startedAt) return 0;
    const elapsedMs = Math.round(performance.now() - startedAt);
    const budgetMs = kind === "preview" ? previewBudgetMs : exportBudgetMs;
    if (elapsedMs > budgetMs) {
      setStatus(
        `${kind === "preview" ? "Preview" : "Export"} budget exceeded (${elapsedMs}ms > ${budgetMs}ms)`,
      );
    }
    return elapsedMs;
  }, [exportBudgetMs, previewBudgetMs, setStatus]);

  const measureBudget = useCallback(async <T,>(kind: BudgetKind, operation: () => Promise<T>) => {
    beginBudget(kind);
    try {
      return await operation();
    } finally {
      endBudget(kind);
    }
  }, [beginBudget, endBudget]);

  return {
    beginBudget,
    endBudget,
    measureBudget,
  };
}

