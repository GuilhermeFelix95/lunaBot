// @vitest-environment node

import type { AgentEvent, BotSummary } from "@lunabot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { notificationForAgentEvent, notificationLevelAllows } from "./agent-notifications";

const bot = {
  id: "chief",
  provider: "codex",
  name: "Chief",
  notifications: "all",
  title: "Lead",
  description: "",
  model: "gpt-5.6-luna",
  reasoningEffort: "medium",
  threadId: "thread-chief",
  workspacePath: "/tmp/chief",
  preview: "",
  updatedAt: null,
  avatarSeed: "chief",
  avatarHue: null,
  avatarUrl: null,
} satisfies BotSummary;

describe("notificationForAgentEvent", () => {
  it("surfaces completed work and prompts for enabled agents", () => {
    expect(notificationForAgentEvent(completed("completed"), [bot])).toEqual({
      title: "Chief",
      body: "Finished working.",
      silent: true,
    });
    expect(
      notificationForAgentEvent(
        {
          type: "prompt",
          botId: "chief",
          threadId: "thread-chief",
          turnId: "turn-1",
          requestId: 1,
          questions: [],
        },
        [bot],
      ),
    ).toEqual({ title: "Chief", body: "Needs your input." });
  });

  it("ignores muted agents, non-successful turns, and unrelated events", () => {
    expect(notificationForAgentEvent(completed("failed"), [bot])).toBeNull();
    expect(notificationForAgentEvent(completed("completed"), [{ ...bot, notifications: "nothing" }])).toBeNull();
    expect(notificationForAgentEvent({ type: "bots-changed", bots: [] }, [bot])).toBeNull();
  });

  it("limits a needs-me agent to prompts and approvals", () => {
    const needsMe = [{ ...bot, notifications: "needs-me" as const }];
    expect(notificationForAgentEvent(completed("completed"), needsMe)).toBeNull();
    expect(notificationForAgentEvent(prompt(), needsMe)).toEqual({ title: "Chief", body: "Needs your input." });
    expect(notificationForAgentEvent(approval(), needsMe)).toEqual({
      title: "Chief",
      body: "Needs your approval.",
    });
  });

  it("decides per level and event kind", () => {
    expect(notificationLevelAllows("all", "turn-completed")).toBe(true);
    expect(notificationLevelAllows("all", "prompt")).toBe(true);
    expect(notificationLevelAllows("needs-me", "turn-completed")).toBe(false);
    expect(notificationLevelAllows("needs-me", "approval")).toBe(true);
    expect(notificationLevelAllows("nothing", "prompt")).toBe(false);
  });

  it("sends no notification for hidden agents at any level", () => {
    expect(notificationForAgentEvent(completed("completed"), [bot], new Set(["chief"]))).toBeNull();
    expect(notificationForAgentEvent(prompt(), [bot], new Set(["chief"]))).toBeNull();
    expect(notificationForAgentEvent(prompt(), [bot], new Set(["other"]))).toEqual({
      title: "Chief",
      body: "Needs your input.",
    });
  });
});

function completed(status: string): AgentEvent {
  return {
    type: "turn-completed",
    botId: "chief",
    threadId: "thread-chief",
    turnId: "turn-1",
    status,
  };
}

function prompt(): AgentEvent {
  return { type: "prompt", botId: "chief", threadId: "thread-chief", turnId: "turn-1", requestId: 1, questions: [] };
}

function approval(): AgentEvent {
  return {
    type: "approval",
    approval: {
      requestId: 2,
      botId: "chief",
      threadId: "thread-chief",
      turnId: "turn-1",
      kind: "command",
      command: "ls",
      cwd: null,
      reason: null,
      grantRoot: null,
      permissions: null,
    },
  };
}
