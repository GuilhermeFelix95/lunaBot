import { describe, expect, it } from "vitest";
import { isAgentMemoryLimit, isClaudeCompactWindow } from "./ipc-agent-preferences";

describe("agent preference validators", () => {
  it("accepts only the supported memory limits", () => {
    expect([64, 128, 256, 512].every(isAgentMemoryLimit)).toBe(true);
    for (const value of [0, 63, 100, 1024, "64", null, undefined]) {
      expect(isAgentMemoryLimit(value)).toBe(false);
    }
  });

  it("accepts compaction windows from 100k to 1M tokens inclusive", () => {
    expect(isClaudeCompactWindow(100_000)).toBe(true);
    expect(isClaudeCompactWindow(1_000_000)).toBe(true);
    expect(isClaudeCompactWindow(450_000)).toBe(true);
  });

  it("rejects compaction windows outside the range or that are not whole tokens", () => {
    for (const value of [99_999, 1_000_001, 250_000.5, Number.NaN, Number.POSITIVE_INFINITY, "200000", null]) {
      expect(isClaudeCompactWindow(value)).toBe(false);
    }
  });
});
