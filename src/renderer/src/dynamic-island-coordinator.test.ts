import type { AgentEvent, AgentRuntimeSnapshot, BotSummary } from "@lunabot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { DynamicIslandCoordinator } from "./dynamic-island-coordinator";

describe("DynamicIslandCoordinator", () => {
  it("shows the first pending request and advances after each resolution", () => {
    const coordinator = new DynamicIslandCoordinator();
    seedBots(coordinator, [bot("research", "Research")]);
    coordinator.applyEvent(prompt("research", "question-1"));
    coordinator.applyEvent(approval("research", "approval-1"));

    expect(coordinator.presentation()).toMatchObject({
      mode: "question",
      remainingCount: 1,
      item: { requestId: "question-1" },
    });

    coordinator.applyEvent({
      type: "agent-input-resolved",
      kind: "prompt",
      requestId: "question-1",
      botId: "research",
    });

    expect(coordinator.presentation()).toMatchObject({
      mode: "approval",
      item: { requestId: "approval-1" },
    });

    coordinator.applyEvent({
      type: "agent-input-resolved",
      kind: "approval",
      requestId: "approval-1",
      botId: "research",
    });
    expect(coordinator.presentation().mode).toBe("idle");
  });

  it("keeps simultaneous requests from different bots and advances after each answer", () => {
    const coordinator = new DynamicIslandCoordinator();
    seedBots(coordinator, [bot("chief", "Chief"), bot("research", "Research")]);
    coordinator.applyEvent(prompt("chief", "question-chief"));
    coordinator.applyEvent(prompt("research", "question-research"));

    expect(coordinator.presentation()).toMatchObject({
      mode: "question",
      remainingCount: 1,
      item: { requestId: "question-chief" },
    });

    coordinator.resolveAction({
      type: "answer-prompt",
      botId: "chief",
      requestId: "question-chief",
      answers: { source: ["Official data"] },
    });

    expect(coordinator.presentation()).toMatchObject({
      mode: "question",
      remainingCount: 0,
      item: { requestId: "question-research" },
    });
  });

  it("removes only the matching failure after it is opened", () => {
    const coordinator = new DynamicIslandCoordinator();
    seedBots(coordinator, [bot("chief", "Chief")]);
    coordinator.applyEvent({
      type: "turn-completed",
      botId: "chief",
      threadId: "thread-chief",
      turnId: "turn-failed",
      status: "failed",
    });

    coordinator.resolveAction({
      type: "open-failure",
      botId: "chief",
      turnId: "another-turn",
    });
    expect(coordinator.presentation().mode).toBe("failed");

    coordinator.resolveAction({
      type: "open-failure",
      botId: "chief",
      turnId: "turn-failed",
    });
    expect(coordinator.presentation().mode).toBe("idle");
  });

  it("shows working while a turn runs and clears it when the turn completes", () => {
    const coordinator = new DynamicIslandCoordinator();
    seedBots(coordinator, [bot("research", "Research")]);
    coordinator.applyEvent({
      type: "turn-started",
      botId: "research",
      threadId: "thread-1",
      turnId: "turn-1",
    });
    expect(coordinator.presentation().mode).toBe("working");

    coordinator.applyEvent({
      type: "turn-completed",
      botId: "research",
      threadId: "thread-1",
      turnId: "turn-1",
      status: "completed",
    });
    expect(coordinator.presentation().mode).toBe("idle");
  });

  it("counts failures hidden behind a takeover", () => {
    const coordinator = new DynamicIslandCoordinator();
    seedBots(coordinator, [bot("browser", "Browser"), bot("failed", "Failed"), bot("research", "Research")]);
    coordinator.applyEvent({
      type: "browser-takeover-requested",
      request: {
        requestId: "takeover-1",
        botId: "browser",
        threadId: "thread-browser",
        turnId: "turn-browser",
        tabId: "tab-1",
      },
    });
    coordinator.applyEvent({
      type: "turn-completed",
      botId: "failed",
      threadId: "thread-failed",
      turnId: "turn-failed",
      status: "failed",
    });
    coordinator.applyEvent(prompt("research", "question-1"));

    expect(coordinator.presentation()).toMatchObject({
      mode: "question",
      remainingCount: 2,
    });
  });

  it("repairs stale state from a runtime snapshot", () => {
    const coordinator = new DynamicIslandCoordinator();
    const localBot = bot("research", "Research");
    seedBots(coordinator, [localBot]);
    coordinator.applyEvent(prompt("research", "stale-question"));
    coordinator.applyEvent({
      type: "turn-started",
      botId: "research",
      threadId: "thread-research",
      turnId: "stale-turn",
    });

    coordinator.applyEvent(
      runtimeSnapshot({
        bots: [localBot],
        latestMessages: [runtimeMessage("historical")],
        attentionComplete: false,
      }),
    );
    expect(coordinator.presentation()).toMatchObject({
      mode: "question",
      item: { requestId: "stale-question" },
    });

    coordinator.applyEvent(
      runtimeSnapshot({
        bots: [localBot],
        activeTurns: [{ botId: "research", threadId: "thread-research", turnId: "turn-current" }],
        work: [
          {
            id: "delivery-current",
            botId: "research",
            turnId: "turn-current",
            status: "running",
            text: "Review sources",
            error: null,
          },
        ],
        latestMessages: [runtimeMessage("historical")],
      }),
    );
    expect(coordinator.presentation()).toMatchObject({
      mode: "working",
      working: [{ task: "Review sources" }],
    });
  });
});

function seedBots(coordinator: DynamicIslandCoordinator, bots: BotSummary[]): void {
  coordinator.applyEvent({ type: "bots-changed", bots });
}

function prompt(botId: string, requestId: string): Extract<AgentEvent, { type: "prompt" }> {
  return {
    type: "prompt",
    requestId,
    botId,
    threadId: `thread-${botId}`,
    turnId: `turn-${botId}`,
    questions: [
      {
        id: "source",
        header: "Choose a source",
        question: "Which source should I use?",
        isSecret: false,
        options: [{ label: "Official data", description: "Use the public dataset" }],
      },
    ],
  };
}

function approval(botId: string, requestId: string): Extract<AgentEvent, { type: "approval" }> {
  return {
    type: "approval",
    approval: {
      requestId,
      botId,
      threadId: `thread-${botId}`,
      turnId: `turn-${botId}`,
      kind: "permissions",
      command: null,
      cwd: null,
      reason: "Access the project files.",
      grantRoot: "/workspace",
      permissions: { fileSystem: { read: ["/workspace"], write: ["/workspace"] }, network: false },
    },
  };
}

function runtimeSnapshot(
  overrides: Partial<AgentRuntimeSnapshot> = {},
): Extract<AgentEvent, { type: "runtime-snapshot" }> {
  return {
    type: "runtime-snapshot",
    snapshot: {
      bots: [],
      activeTurns: [],
      work: [],
      latestMessages: [],
      attentionComplete: true,
      pendingPrompts: [],
      pendingApprovals: [],
      pendingBrowserTakeovers: [],
      failedTurns: [],
      ...overrides,
    },
  };
}

function runtimeMessage(id: string): AgentRuntimeSnapshot["latestMessages"][number] {
  return { botId: "research", id, text: id, createdAt: "2026-08-29T10:00:00.000Z" };
}

function bot(id: string, name: string): BotSummary {
  return {
    id,
    name,
    title: "Agent",
    description: "Agent",
    notifications: "all",
    provider: "codex",
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    threadId: `thread-${id}`,
    workspacePath: `/workspace/${id}`,
    preview: "",
    updatedAt: null,
    avatarSeed: id,
    avatarHue: null,
    avatarUrl: null,
  };
}
