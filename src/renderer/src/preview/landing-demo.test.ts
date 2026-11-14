import type { AgentEvent, ConversationMessage } from "@lunabot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLandingDemoController } from "./landing-demo";
import { LANDING_SCRIPT_MESSAGE_PREFIX } from "./landing-demo-scripts";
import { LANDING_PREVIEW_OPTIONS } from "./landing-fixtures";
import { createMockLunaBot } from "./mock-lunabot";

describe("landing demo controller", () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs the prompt, thinking, streaming, files, reaction, and handoff stages", async () => {
    const mock = createMockLunaBot(LANDING_PREVIEW_OPTIONS);
    const events: AgentEvent[] = [];
    const unsubscribe = mock.api.agent.onEvent((event) => events.push(event));
    const controller = createLandingDemoController(mock);
    await mock.api.agent.readConversationPage({ botId: "chief", anchor: { type: "latest" }, limit: 50 });

    controller.activate();
    vi.advanceTimersByTime(249);
    expect(mock.readConversationSnapshot("chief").messages.at(-1)?.id).toBe("landing-chief-ready");

    vi.advanceTimersByTime(1);
    let snapshot = mock.readConversationSnapshot("chief");
    expect(snapshot.activeTurnId).toContain(LANDING_SCRIPT_MESSAGE_PREFIX);
    expect(snapshot.messages.at(-1)).toMatchObject({ author: "user", status: "completed" });
    expect((await mock.api.agent.listQueue("chief")).deliveries).toHaveLength(1);
    expect(events.some((event) => event.type === "turn-started")).toBe(true);

    vi.advanceTimersByTime(200);
    snapshot = mock.readConversationSnapshot("chief");
    expect(snapshot.messages.at(-1)).toMatchObject({ itemType: "commentary", status: "streaming" });

    vi.advanceTimersByTime(400);
    snapshot = mock.readConversationSnapshot("chief");
    expect(snapshot.messages.filter((message) => message.itemType === "commentary").slice(-2)).toMatchObject([
      { status: "completed" },
      { status: "streaming" },
    ]);

    vi.advanceTimersByTime(400);
    expect(events.some((event) => event.type === "conversation-delta")).toBe(true);

    vi.advanceTimersByTime(3_000);
    snapshot = mock.readConversationSnapshot("chief");
    const answer = snapshot.messages.find((message) => message.id.endsWith(":answer"));
    const handoff = snapshot.messages.find((message) => message.id.endsWith(":handoff"));
    expect(answer?.text).toContain("| Workstream | Owner | Status |");
    expect(answer?.attachments?.map((attachment) => attachment.name)).toEqual([
      "launch-brief.md",
      "launch-metrics.csv",
    ]);
    expect(answer?.reaction).toBe("✅");
    expect(handoff?.exchange?.recipientBotIds).toEqual(["launch"]);
    expect(snapshot.activeTurnId).toBeNull();
    expect((await mock.api.agent.listQueue("chief")).deliveries).toHaveLength(0);
    expect(events.some((event) => event.type === "turn-completed" && event.status === "completed")).toBe(true);

    controller.dispose();
    unsubscribe();
    mock.dispose();
  });

  it("cancels the current run and preserves manual messages when an agent restarts", async () => {
    const mock = createMockLunaBot(LANDING_PREVIEW_OPTIONS);
    const events: AgentEvent[] = [];
    const unsubscribe = mock.api.agent.onEvent((event) => events.push(event));
    const controller = createLandingDemoController(mock);
    await mock.api.agent.readConversationPage({ botId: "chief", anchor: { type: "latest" }, limit: 50 });
    controller.activate();
    vi.advanceTimersByTime(500);

    await mock.api.agent.readConversationPage({ botId: "builder", anchor: { type: "latest" }, limit: 50 });
    expect(mock.readConversationSnapshot("chief").activeTurnId).toBeNull();
    expect((await mock.api.agent.listQueue("chief")).deliveries).toHaveLength(0);
    expect(events.some((event) => event.type === "turn-completed" && event.status === "interrupted")).toBe(true);

    vi.advanceTimersByTime(3_500);
    expect(
      mock.readConversationSnapshot("builder").messages.find((message) => message.id.endsWith(":answer"))?.text,
    ).toContain("bun run check");

    const manualMessage: ConversationMessage = {
      id: "manual-chief-message",
      author: "user",
      source: "user",
      text: "Keep this manual note.",
      createdAt: "2026-08-21T10:05:00.000Z",
      status: "completed",
    };
    mock.updateConversationSnapshot("chief", (snapshot) => {
      snapshot.messages = [...snapshot.messages, manualMessage];
    });
    await mock.api.agent.readConversationPage({ botId: "chief", anchor: { type: "latest" }, limit: 50 });
    expect(
      mock
        .readConversationSnapshot("chief")
        .messages.filter((message) => message.id.startsWith(LANDING_SCRIPT_MESSAGE_PREFIX)),
    ).toHaveLength(0);

    vi.advanceTimersByTime(3_500);
    const chiefMessages = mock.readConversationSnapshot("chief").messages;
    expect(chiefMessages.some((message) => message.id === manualMessage.id)).toBe(true);
    expect(chiefMessages.filter((message) => message.id.endsWith(":prompt"))).toHaveLength(1);

    controller.dispose();
    unsubscribe();
    mock.dispose();
  });

  it.each([
    ["chief", ["launch-brief.md", "launch-metrics.csv"]],
    ["research", ["launch-brief.md", "launch-metrics.csv", "evidence-map.md"]],
    ["builder", ["evidence-map.md", "rollout-checklist.md"]],
    ["launch", ["release-note.md"]],
  ])("commits the complete %s story in one update for reduced motion", async (botId, files) => {
    const mock = createMockLunaBot(LANDING_PREVIEW_OPTIONS);
    const events: AgentEvent[] = [];
    const unsubscribe = mock.api.agent.onEvent((event) => events.push(event));
    const controller = createLandingDemoController(mock, { reducedMotion: true });
    await mock.api.agent.readConversationPage({ botId, anchor: { type: "latest" }, limit: 50 });

    controller.activate();
    const snapshot = mock.readConversationSnapshot(botId);
    const answer = snapshot.messages.find((message) => message.id.endsWith(":answer"));
    expect(answer?.attachments?.map((attachment) => attachment.name)).toEqual(files);
    expect(snapshot.messages.some((message) => message.id.endsWith(":handoff"))).toBe(true);
    expect(snapshot.activeTurnId).toBeNull();
    expect(events.some((event) => event.type === "conversation-delta")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    controller.dispose();
    unsubscribe();
    mock.dispose();
  });
});
