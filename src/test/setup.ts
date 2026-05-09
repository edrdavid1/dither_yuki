// Vitest test setup
import { vi } from "vitest";

// Mock crypto.randomUUID for consistent tests
Object.defineProperty(globalThis, "crypto", {
  value: {
    randomUUID: () => "test-uuid-12345",
  },
});

// Suppress console warnings during tests unless explicitly needed
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  // Filter out expected errors in tests
  if (typeof args[0] === "string" && args[0].includes("[layer-validation]")) {
    return;
  }
  originalConsoleError.apply(console, args);
};
