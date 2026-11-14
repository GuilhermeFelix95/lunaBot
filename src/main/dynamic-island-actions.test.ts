// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { performDynamicIslandCriticalAction } from "./dynamic-island-actions";

describe("performDynamicIslandCriticalAction", () => {
  it("executes a prompt answer directly", async () => {
    const local = localAgent();
    await performDynamicIslandCriticalAction(
      {
        type: "answer-prompt",
        botId: "chief",
        requestId: "prompt-local",
        answers: { source: ["Official data"] },
      },
      local,
    );

    expect(local.respondToPrompt).toHaveBeenCalledWith({
      requestId: "prompt-local",
      answers: { source: ["Official data"] },
    });
  });

  it("executes an approval decision directly", async () => {
    const local = localAgent();

    await performDynamicIslandCriticalAction(
      {
        type: "respond-approval",
        botId: "chief",
        requestId: "approval-local",
        decision: "accept",
      },
      local,
    );

    expect(local.respondToApproval).toHaveBeenCalledWith({ requestId: "approval-local", decision: "accept" });
  });
});

function localAgent() {
  return {
    respondToPrompt: vi.fn(async () => undefined),
    respondToApproval: vi.fn(async () => undefined),
  };
}
