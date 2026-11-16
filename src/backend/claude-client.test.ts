// @vitest-environment node

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelInfo, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { type DynamicRecord, isDynamicRecord, isString } from "@lunabot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { removeDirectory, writeNodeExecutable } from "../test-utils/fs";
import { ClaudeAgentClient } from "./claude-client";
import { LUNABOT_ROOM_DYNAMIC_TOOLS } from "./lunabot-room-tools";
import {
  decodeAccountReadResult,
  decodeModelListResponse,
  decodeRecordResponse,
  decodeThreadResponse,
  decodeTurnResponse,
  getRecord,
  getString,
} from "./protocol";

type TestStreamMessage =
  | {
      type: "stream_event";
      parent_tool_use_id: null;
      session_id: string;
      uuid: string;
      event: {
        type: "content_block_delta";
        index: number;
        delta: { type: "text_delta"; text: string };
      };
    }
  | {
      type: "assistant";
      parent_tool_use_id: string | null;
      session_id: string;
      uuid: string;
      message: { content: Array<{ type: "text"; text: string }>; usage?: Record<string, number> };
    }
  | {
      type: "result";
      subtype: "success";
      result: string;
      terminal_reason: "completed";
      errors: string[];
      modelUsage?: Record<string, { contextWindow: number }>;
      session_id: string;
      uuid: string;
    }
  | {
      type: "system";
      subtype: "task_started" | "task_updated" | "task_notification" | "background_tasks_changed";
      session_id: string;
      uuid: string;
      task_id?: string;
      description?: string;
      status?: "completed" | "failed" | "stopped";
      patch?: { status: string };
      tasks?: Array<{ task_id: string; task_type: string; description: string }>;
    };

let root: string | null = null;

afterEach(async () => {
  if (root) await removeDirectory(root);
  root = null;
});

describe("ClaudeAgentClient", () => {
  it("streams a Claude SDK turn through the App Server event contract", async () => {
    root = await mkdtemp(join(tmpdir(), "lunabot-claude-client-"));
    const sharedRoot = join(root, "shared");
    const executable = await writeNodeExecutable(
      root,
      "claude",
      `#!/usr/bin/env node
if (process.argv[2] === "auth") {
  process.stdout.write('{"loggedIn":true,"email":"claude@example.com","subscriptionType":"max"}');
}
`,
      "cjs",
    );

    const output = new TestQueue<TestStreamMessage>();
    let prompt: AsyncIterable<SDKUserMessage> | null = null;
    const generator = new TestQuery(output);
    const client = new ClaudeAgentClient({ executable, version: "2.1.231" }, (params) => {
      if (!isString(params.prompt)) prompt = params.prompt;
      expect(params.options).toMatchObject({
        cwd: root,
        permissionMode: "default",
        additionalDirectories: [root, sharedRoot],
      });
      const options: DynamicRecord | null = isDynamicRecord(params.options) ? params.options : null;
      const mcpServers: DynamicRecord | null = isDynamicRecord(options?.mcpServers) ? options.mcpServers : null;
      const lunabotServer = mcpServers?.lunabot;
      const serverInstance = isDynamicRecord(lunabotServer) ? lunabotServer.instance : null;
      const registeredTools = isDynamicRecord(serverInstance) ? serverInstance._registeredTools : null;
      expect(isDynamicRecord(registeredTools) ? Object.keys(registeredTools) : []).toEqual(
        expect.arrayContaining([
          "attach_files_to_response",
          "remember",
          "forget_memory",
          "list_routines",
          "create_routine",
          "update_routine",
          "delete_routine",
          "test_routine",
          "react_to_user_message",
        ]),
      );
      return generator;
    });
    const notifications: Array<{ method: string; params: unknown }> = [];
    client.on("notification", (notification) => notifications.push(notification));
    client.start();

    await expect(client.request("account/read", {}, decodeAccountReadResult)).resolves.toMatchObject({
      account: { type: "claude", email: "claude@example.com", planType: "max" },
    });
    const thread = await client.request(
      "thread/start",
      {
        cwd: root,
        model: "claude-sonnet-5-5",
        developerInstructions: "Be concise.",
        runtimeWorkspaceRoots: [root, sharedRoot],
      },
      decodeThreadResponse,
    );
    const deliveryId = "8bf58506-96a8-4d96-837c-3ab807b79d1f";
    await client.request(
      "turn/start",
      {
        threadId: thread.thread.id,
        clientUserMessageId: deliveryId,
        input: [{ type: "text", text: "Hello" }],
      },
      decodeTurnResponse,
    );

    if (prompt === null) throw new Error("Claude prompt was not initialized.");
    const promptStream: AsyncIterable<SDKUserMessage> = prompt;
    let sent: SDKUserMessage | undefined;
    for await (const message of promptStream) {
      sent = message;
      break;
    }
    expect(sent).toMatchObject({ uuid: deliveryId, message: { content: "Hello" } });
    output.push({
      type: "stream_event",
      parent_tool_use_id: null,
      session_id: thread.thread.id,
      uuid: deliveryId,
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } },
    });
    output.push({
      type: "result",
      subtype: "success",
      result: "Hi",
      terminal_reason: "completed",
      errors: [],
      session_id: thread.thread.id,
      uuid: deliveryId,
    });
    await waitFor(() => notifications.some((event) => event.method === "turn/completed"));

    expect(notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "turn/started" }),
        expect.objectContaining({
          method: "item/agentMessage/delta",
          params: expect.objectContaining({ turnId: deliveryId, delta: "Hi" }),
        }),
        expect.objectContaining({
          method: "turn/completed",
          params: expect.objectContaining({ turn: { id: deliveryId, status: "completed" } }),
        }),
      ]),
    );
    await client.stop();
  });

  it("gives a Claude room manager thread the six room tools", async () => {
    const mcpServers = await startClaudeThread([LUNABOT_ROOM_DYNAMIC_TOOLS]);

    expect(registeredToolNames(mcpServers, "lunabot_room").sort()).toEqual([
      "list_rooms",
      "request_dismiss",
      "request_hire",
      "request_new_bot",
      "room_catalog",
      "room_members",
    ]);
  });

  it("keeps room tools out of Claude threads that do not list the room namespace", async () => {
    const mcpServers = await startClaudeThread([
      { type: "namespace", name: "lunabot_browser", tools: [] },
      { type: "namespace", name: "lunabot", tools: [] },
    ]);

    expect(Object.keys(mcpServers).sort()).toEqual(["lunabot", "lunabot_browser"]);
  });

  it("keeps the CLI default alias from hiding the explicit model row", async () => {
    const query = new TestQuery(new TestQueue<TestStreamMessage>(), [
      {
        value: "default",
        resolvedModel: "claude-haiku-5-5",
        displayName: "Default (recommended)",
        description: "Default",
        supportsEffort: true,
        supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
      {
        value: "haiku",
        resolvedModel: "claude-haiku-5-5",
        displayName: "Haiku 5.5",
        description: "Quick",
        supportsEffort: true,
        supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
    ]);
    const client = new ClaudeAgentClient({ executable: "/bin/true", version: "2.1.251" }, () => query);
    client.start();

    await expect(client.request("model/list", {}, decodeModelListResponse)).resolves.toMatchObject({
      data: [
        {
          model: "claude-haiku-5-5",
          displayName: "Haiku 5.5",
          supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"].map((reasoningEffort) => ({
            reasoningEffort,
          })),
        },
      ],
    });
    await client.stop();
  });

  it("discovers each model's supported reasoning efforts from the Claude SDK", async () => {
    const query = new TestQuery(new TestQueue<TestStreamMessage>(), [
      {
        value: "opus",
        resolvedModel: "claude-opus-5-5",
        displayName: "Claude Opus 5.5",
        description: "Most capable",
        supportsEffort: true,
        supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
      {
        value: "claude-opus-5-5",
        displayName: "Claude Opus 5.5 duplicate",
        description: "Duplicate alias",
        supportsEffort: true,
        supportedEffortLevels: ["high"],
      },
      {
        value: "sonnet",
        resolvedModel: "claude-sonnet-5-5",
        displayName: "Claude Sonnet 5.5",
        description: "Balanced",
        supportsEffort: true,
        supportedEffortLevels: ["low", "medium", "max"],
      },
      {
        value: "haiku",
        resolvedModel: "claude-haiku-5",
        displayName: "Claude Haiku 5",
        description: "Fast",
        supportsEffort: false,
      },
    ]);
    const client = new ClaudeAgentClient({ executable: "/bin/true", version: "2.1.251" }, () => query);
    client.start();

    await expect(client.request("model/list", {}, decodeModelListResponse)).resolves.toEqual({
      data: [
        {
          model: "claude-opus-5-5",
          displayName: "Claude Opus 5.5",
          defaultReasoningEffort: "high",
          supportedReasoningEfforts: [
            { reasoningEffort: "low" },
            { reasoningEffort: "medium" },
            { reasoningEffort: "high" },
            { reasoningEffort: "xhigh" },
            { reasoningEffort: "max" },
          ],
        },
        {
          model: "claude-sonnet-5-5",
          displayName: "Claude Sonnet 5.5",
          defaultReasoningEffort: "low",
          supportedReasoningEfforts: [
            { reasoningEffort: "low" },
            { reasoningEffort: "medium" },
            { reasoningEffort: "max" },
          ],
        },
        {
          model: "claude-haiku-5",
          displayName: "Claude Haiku 5",
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: [{ reasoningEffort: "medium" }],
        },
      ],
    });
    expect(query.closed).toBe(true);
  });

  it("preserves discovered model capabilities when a later refresh times out", async () => {
    const discoveryQuery = new TestQuery(new TestQueue<TestStreamMessage>(), [
      {
        value: "fable",
        resolvedModel: "claude-fable-5-2",
        displayName: "Claude Fable 5.2",
        description: "Fast",
        supportsEffort: false,
      },
    ]);
    const timeoutQuery = new TestQuery(new TestQueue<TestStreamMessage>(), new Promise<ModelInfo[]>(() => {}));
    const runtimeQuery = new TestQuery(new TestQueue<TestStreamMessage>());
    const queries = [discoveryQuery, timeoutQuery, runtimeQuery];
    let runtimeOptions: DynamicRecord | null = null;
    const client = new ClaudeAgentClient({ executable: "/bin/true", version: "2.1.251" }, (params) => {
      const next = queries.shift();
      if (!next) throw new Error("Unexpected Claude query.");
      if (next === runtimeQuery && isDynamicRecord(params.options)) runtimeOptions = params.options;
      return next;
    });
    client.start();

    await client.request("model/list", {}, decodeModelListResponse);
    await expect(client.request("model/list", {}, decodeModelListResponse, 10)).rejects.toThrow(
      "Claude request timed out: model/list",
    );
    await client.request(
      "thread/start",
      { cwd: process.cwd(), model: "claude-fable-5-2", effort: "medium" },
      decodeThreadResponse,
    );

    expect(runtimeOptions).toMatchObject({ model: "fable" });
    expect(runtimeOptions).not.toHaveProperty("effort");
    expect(timeoutQuery.closed).toBe(true);
    await client.stop();
  });

  it("sets the compaction window only on Claude processes started with a configured value", async () => {
    const envs: unknown[] = [];
    let compactWindow: number | null = 400_000;
    const client = new ClaudeAgentClient(
      { executable: "/bin/true", version: "2.1.251" },
      (params) => {
        if (isDynamicRecord(params.options)) envs.push(params.options.env);
        return new TestQuery(new TestQueue<TestStreamMessage>());
      },
      () => compactWindow,
    );
    client.start();

    await client.request("thread/start", { cwd: process.cwd(), model: "claude-haiku-5-5" }, decodeThreadResponse);
    expect(envs.at(-1)).toMatchObject({ CLAUDE_CODE_AUTO_COMPACT_WINDOW: "400000" });

    compactWindow = null;
    await client.request("thread/start", { cwd: process.cwd(), model: "claude-haiku-5-5" }, decodeThreadResponse);
    expect(envs.at(-1)).not.toHaveProperty("CLAUDE_CODE_AUTO_COMPACT_WINDOW");
    await client.stop();
  });

  it("uses alias-only discovery values for Claude SDK model selection", async () => {
    root = await mkdtemp(join(tmpdir(), "lunabot-claude-model-alias-"));
    const discoveryQuery = new TestQuery(new TestQueue<TestStreamMessage>(), [
      {
        value: "sonnet",
        displayName: "Claude Sonnet",
        description: "Balanced",
        supportsEffort: true,
        supportedEffortLevels: ["medium", "high"],
      },
    ]);
    const initialQuery = new TestQuery(new TestQueue<TestStreamMessage>());
    const switchingQuery = new TestQuery(new TestQueue<TestStreamMessage>());
    const queries = [discoveryQuery, initialQuery, switchingQuery];
    let initialOptions: DynamicRecord | null = null;
    const client = new ClaudeAgentClient({ executable: "/bin/true", version: "2.1.251" }, (params) => {
      const next = queries.shift();
      if (!next) throw new Error("Unexpected Claude query.");
      if (next === initialQuery && isDynamicRecord(params.options)) initialOptions = params.options;
      return next;
    });
    client.start();

    await expect(client.request("model/list", {}, decodeModelListResponse)).resolves.toEqual({
      data: [expect.objectContaining({ model: "sonnet" })],
    });
    await client.request("thread/start", { cwd: root, model: "sonnet", effort: "medium" }, decodeThreadResponse);
    expect(initialOptions).toMatchObject({ model: "sonnet" });

    const switchingThread = await client.request(
      "thread/start",
      { cwd: root, model: "claude-opus-5-5", effort: "medium" },
      decodeThreadResponse,
    );
    await client.request(
      "turn/start",
      { threadId: switchingThread.thread.id, model: "sonnet", effort: "medium", input: [] },
      decodeTurnResponse,
    );
    expect(switchingQuery.models).toEqual(["sonnet"]);

    await client.stop();
  });

  it("keeps neutral UI effort for unsupported models without sending effort to Claude", async () => {
    root = await mkdtemp(join(tmpdir(), "lunabot-claude-effort-support-"));
    const discoveryQuery = new TestQuery(new TestQueue<TestStreamMessage>(), [
      {
        value: "haiku",
        resolvedModel: "claude-haiku-5",
        displayName: "Claude Haiku 5",
        description: "Fast",
        supportsEffort: false,
      },
      {
        value: "sonnet",
        resolvedModel: "claude-sonnet-5-5",
        displayName: "Claude Sonnet 5.5",
        description: "Balanced",
        supportsEffort: true,
        supportedEffortLevels: ["low", "medium", "max"],
      },
    ]);
    const unsupportedQuery = new TestQuery(new TestQueue<TestStreamMessage>());
    const switchingQuery = new TestQuery(new TestQueue<TestStreamMessage>());
    const effortChangingQuery = new TestQuery(new TestQueue<TestStreamMessage>());
    const clearingQuery = new TestQuery(new TestQueue<TestStreamMessage>());
    const queries = [discoveryQuery, unsupportedQuery, switchingQuery, effortChangingQuery, clearingQuery];
    const runtimeOptions: DynamicRecord[] = [];
    const client = new ClaudeAgentClient({ executable: "/bin/true", version: "2.1.251" }, (params) => {
      const next = queries.shift();
      if (!next) throw new Error("Unexpected Claude query.");
      if (next !== discoveryQuery && isDynamicRecord(params.options)) runtimeOptions.push(params.options);
      return next;
    });
    client.start();

    const models = await client.request("model/list", {}, decodeModelListResponse);
    expect(models.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          model: "claude-haiku-5",
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: [{ reasoningEffort: "medium" }],
        }),
      ]),
    );

    const unsupportedThread = await client.request(
      "thread/start",
      { cwd: root, model: "claude-haiku-5", effort: "medium" },
      decodeThreadResponse,
    );
    expect(runtimeOptions[0]).not.toHaveProperty("effort");
    await client.request(
      "turn/start",
      { threadId: unsupportedThread.thread.id, model: "claude-haiku-5", effort: "high", input: [] },
      decodeTurnResponse,
    );
    expect(unsupportedQuery.flagSettings).toEqual([]);

    const switchingThread = await client.request(
      "thread/start",
      { cwd: root, model: "claude-haiku-5", effort: "medium" },
      decodeThreadResponse,
    );
    await client.request(
      "turn/start",
      { threadId: switchingThread.thread.id, model: "claude-sonnet-5-5", effort: "high", input: [] },
      decodeTurnResponse,
    );
    expect(switchingQuery.models).toEqual(["sonnet"]);
    expect(switchingQuery.flagSettings).toEqual([{ effortLevel: "low" }]);

    const effortChangingThread = await client.request(
      "thread/start",
      { cwd: root, model: "claude-sonnet-5-5", effort: "high" },
      decodeThreadResponse,
    );
    expect(runtimeOptions[2]).toMatchObject({ effort: "low" });
    await client.request(
      "turn/start",
      { threadId: effortChangingThread.thread.id, model: "claude-sonnet-5-5", effort: "max", input: [] },
      decodeTurnResponse,
    );
    expect(effortChangingQuery.models).toEqual([]);
    expect(effortChangingQuery.flagSettings).toEqual([{ effortLevel: "max" }]);

    const clearingThread = await client.request(
      "thread/start",
      { cwd: root, model: "claude-sonnet-5-5", effort: "medium" },
      decodeThreadResponse,
    );
    await client.request(
      "turn/start",
      { threadId: clearingThread.thread.id, model: "claude-haiku-5", effort: "medium", input: [] },
      decodeTurnResponse,
    );
    expect(clearingQuery.models).toEqual(["haiku"]);
    expect(clearingQuery.flagSettings).toEqual([{ effortLevel: null }]);

    await client.stop();
  });

  it("restarts an inactive session when resumed with updated memory instructions", async () => {
    root = await mkdtemp(join(tmpdir(), "lunabot-claude-memory-resume-"));
    const instructions: string[] = [];
    const client = new ClaudeAgentClient({ executable: "/bin/true", version: "2.1.231" }, (params) => {
      const options: DynamicRecord | null = isDynamicRecord(params.options) ? params.options : null;
      const systemPrompt = options?.systemPrompt;
      if (isDynamicRecord(systemPrompt) && isString(systemPrompt.append)) instructions.push(systemPrompt.append);
      return new TestQuery(new TestQueue<TestStreamMessage>());
    });
    client.start();
    const config = {
      cwd: root,
      model: "claude-sonnet-5-5",
      developerInstructions: "<agent_memories>[]</agent_memories>",
      runtimeWorkspaceRoots: [root],
    };
    const thread = await client.request("thread/start", config, decodeThreadResponse);
    await client.request(
      "thread/resume",
      {
        ...config,
        threadId: thread.thread.id,
        developerInstructions: '<agent_memories>[{"text":"Uses metric units."}]</agent_memories>',
      },
      decodeThreadResponse,
    );

    expect(instructions).toEqual([
      "<agent_memories>[]</agent_memories>",
      '<agent_memories>[{"text":"Uses metric units."}]</agent_memories>',
    ]);
    await client.stop();
  });

  it("uses a complete assistant message when Claude omits stream deltas", async () => {
    const { client, notifications, output, threadId } = await createHarness();
    const turnId = "11111111-1111-4111-8111-111111111111";
    await startTurn(client, threadId, turnId);

    output.push(assistantMessage(threadId, "child-message", "Hidden child response", "tool-use-1"));
    output.push(assistantMessage(threadId, "main-message", "Visible without a refresh"));
    output.push(resultMessage(threadId, turnId, ""));
    await waitFor(() => notifications.some((event) => event.method === "turn/completed"));

    expect(notificationDeltas(notifications)).toEqual(["Visible without a refresh"]);
    expect(completedText(notifications)).toBe("Visible without a refresh");
    expect(JSON.stringify(notifications)).not.toContain("Hidden child response");
    await client.stop();
  });

  it("steers a second user message into the active Claude runtime", async () => {
    const { client, prompt, threadId } = await createHarness();
    const turnId = "44444444-4444-4444-8444-444444444444";
    await startTurn(client, threadId, turnId);
    const iterator = prompt[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value).toMatchObject({ uuid: turnId, message: { content: "Hello" } });

    await expect(
      client.request(
        "turn/steer",
        {
          threadId,
          expectedTurnId: turnId,
          clientUserMessageId: "55555555-5555-4555-8555-555555555555",
          input: [{ type: "text", text: "Also check the queue." }],
        },
        decodeRecordResponse,
      ),
    ).resolves.toEqual({ turnId });
    const steered = await iterator.next();
    expect(steered.value).toMatchObject({
      uuid: "55555555-5555-4555-8555-555555555555",
      message: { content: "Also check the queue." },
    });
    await client.stop();
  });

  it("reports the conversation size from each model call and the compact window", async () => {
    const { client, notifications, output, threadId } = await createHarness(200_000);
    await startTurn(client, threadId, "66666666-6666-4666-8666-666666666666");

    output.push({
      type: "assistant",
      parent_tool_use_id: null,
      session_id: threadId,
      uuid: "usage-message",
      message: {
        content: [{ type: "text", text: "Hi" }],
        usage: { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1_000, output_tokens: 5 },
      },
    });
    await waitFor(() => notifications.some((event) => event.method === "thread/tokenUsage/updated"));

    const update = notifications.find((event) => event.method === "thread/tokenUsage/updated");
    expect(update?.params).toEqual({
      threadId,
      tokenUsage: { last: { totalTokens: 1_115 }, modelContextWindow: 200_000, compactAtTokens: 200_000 },
    });
    await client.stop();
  });

  it("compacts through a /compact turn of its own", async () => {
    const { client, notifications, output, prompt, threadId } = await createHarness();

    await client.request("thread/compact/start", { threadId }, decodeRecordResponse);

    const first = await prompt[Symbol.asyncIterator]().next();
    expect(first.value).toMatchObject({ message: { content: "/compact" } });
    expect(notifications.some((event) => event.method === "turn/started")).toBe(true);

    output.push(assistantMessage(threadId, "compact-reply", "Not enough messages to compact."));
    output.push(resultMessage(threadId, "compact-turn", "Not enough messages to compact."));
    await waitFor(() => notifications.some((event) => event.method === "turn/completed"));
    expect(notifications.some((event) => event.method.startsWith("item/"))).toBe(false);
    await client.stop();
  });

  it("adds only the missing suffix from a complete assistant message", async () => {
    const { client, notifications, output, threadId } = await createHarness();
    const turnId = "22222222-2222-4222-8222-222222222222";
    await startTurn(client, threadId, turnId);

    output.push(streamDelta(threadId, turnId, "Hel"));
    output.push(assistantMessage(threadId, "main-message", "Hello"));
    output.push(resultMessage(threadId, turnId, "Hello"));
    await waitFor(() => notifications.some((event) => event.method === "turn/completed"));

    expect(notificationDeltas(notifications)).toEqual(["Hel", "lo"]);
    expect(completedText(notifications)).toBe("Hello");
    await client.stop();
  });

  it("does not duplicate a fully streamed assistant message", async () => {
    const { client, notifications, output, threadId } = await createHarness();
    const turnId = "33333333-3333-4333-8333-333333333333";
    await startTurn(client, threadId, turnId);

    output.push(streamDelta(threadId, turnId, "Hello"));
    output.push(assistantMessage(threadId, "main-message", "Hello"));
    output.push(resultMessage(threadId, turnId, "Hello"));
    await waitFor(() => notifications.some((event) => event.method === "turn/completed"));

    expect(notificationDeltas(notifications)).toEqual(["Hello"]);
    expect(completedText(notifications)).toBe("Hello");
    await client.stop();
  });

  it("opens a system turn for late background text and completes it on the next result", async () => {
    const { client, notifications, output, threadId } = await createHarness();
    const turnId = "66666666-6666-4666-8666-666666666666";
    await startTurn(client, threadId, turnId);

    output.push(assistantMessage(threadId, "main-message", "Done"));
    output.push(resultMessage(threadId, turnId, ""));
    await waitFor(() => notifications.filter((event) => event.method === "turn/completed").length === 1);

    output.push(assistantMessage(threadId, "late-message", "Background build finished"));
    output.push(resultMessage(threadId, "late-result", ""));
    await waitFor(() => notifications.filter((event) => event.method === "turn/completed").length === 2);

    expect(notifications.filter((event) => event.method === "turn/started")).toHaveLength(2);
    expect(notifications.filter((event) => event.method === "turn/started").at(-1)).toMatchObject({
      params: { origin: "system", turn: { status: "inProgress" } },
    });
    expect(notificationDeltas(notifications)).toEqual(["Done", "Background build finished"]);
    expect(notifications.filter((event) => event.method === "turn/completed").at(-1)).toMatchObject({
      params: { origin: "system", turn: { status: "completed" } },
    });
    expect(notifications.filter((event) => event.method === "item/completed").at(-1)).toMatchObject({
      params: { item: { text: "Background build finished" } },
    });
    await client.stop();
  });

  it("does not open a turn for background content without text", async () => {
    const { client, notifications, output, threadId } = await createHarness();
    output.push(streamDelta(threadId, "empty-stream", ""));
    output.push(assistantMessage(threadId, "empty-message", ""));
    output.push(resultMessage(threadId, "empty-result", ""));
    output.push(
      systemMessage(threadId, {
        subtype: "background_tasks_changed",
        tasks: [{ task_id: "task-1", task_type: "local_agent", description: "Wait" }],
      }),
    );
    // The task list is handled after the empty messages, so its notification proves they were processed.
    await waitFor(() => backgroundTaskLists(notifications).length === 1);

    expect(notifications.map((event) => event.method)).not.toContain("turn/started");
    expect(notifications.map((event) => event.method)).not.toContain("turn/completed");
    await client.stop();
  });

  it("reports SDK background tasks as they start, finish, and fail", async () => {
    const { client, notifications, output, threadId } = await createHarness();

    output.push(systemMessage(threadId, { subtype: "task_started", task_id: "task-1", description: "Index the repo" }));
    await waitFor(() => backgroundTaskLists(notifications).length === 1);
    output.push(systemMessage(threadId, { subtype: "task_started", task_id: "task-2", description: "Run tests" }));
    await waitFor(() => backgroundTaskLists(notifications).length === 2);
    expect(backgroundTaskLists(notifications).at(-1)).toEqual([
      { id: "task-1", description: "Index the repo" },
      { id: "task-2", description: "Run tests" },
    ]);

    output.push(systemMessage(threadId, { subtype: "task_notification", task_id: "task-1", status: "completed" }));
    await waitFor(() => backgroundTaskLists(notifications).length === 3);
    expect(backgroundTaskLists(notifications).at(-1)).toEqual([{ id: "task-2", description: "Run tests" }]);

    output.push(systemMessage(threadId, { subtype: "task_updated", task_id: "task-2", patch: { status: "failed" } }));
    await waitFor(() => backgroundTaskLists(notifications).length === 4);
    expect(backgroundTaskLists(notifications).at(-1)).toEqual([]);
    await client.stop();
  });

  it("replaces the background task list with the SDK's level signal", async () => {
    const { client, notifications, output, threadId } = await createHarness();

    output.push(systemMessage(threadId, { subtype: "task_started", task_id: "task-1", description: "Old task" }));
    await waitFor(() => backgroundTaskLists(notifications).length === 1);
    output.push(
      systemMessage(threadId, {
        subtype: "background_tasks_changed",
        tasks: [{ task_id: "task-2", task_type: "local_agent", description: "New task" }],
      }),
    );
    await waitFor(() => backgroundTaskLists(notifications).length === 2);

    expect(backgroundTaskLists(notifications).at(-1)).toEqual([{ id: "task-2", description: "New task" }]);
    await client.stop();
  });

  it("turns off Claude's subagent tools only for threads that opt out", async () => {
    const restricted = await startThreadOptions({ allowSubagents: false });
    expect(restricted).toMatchObject({ disallowedTools: ["Agent", "Task"] });

    const unrestricted = await startThreadOptions({});
    expect(unrestricted).not.toHaveProperty("disallowedTools");
  });
});

async function createHarness(compactWindow: number | null = null): Promise<{
  client: ClaudeAgentClient;
  notifications: Array<{ method: string; params: unknown }>;
  output: TestQueue<TestStreamMessage>;
  prompt: AsyncIterable<SDKUserMessage>;
  threadId: string;
}> {
  root = await mkdtemp(join(tmpdir(), "lunabot-claude-client-"));
  const output = new TestQueue<TestStreamMessage>();
  let prompt: AsyncIterable<SDKUserMessage> | null = null;
  const generator = new TestQuery(output);
  const client = new ClaudeAgentClient(
    { executable: "/bin/true", version: "2.1.231" },
    (params) => {
      if (!isString(params.prompt)) prompt = params.prompt;
      return generator;
    },
    () => compactWindow,
  );
  const notifications: Array<{ method: string; params: unknown }> = [];
  client.on("notification", (notification) => notifications.push(notification));
  client.start();
  const thread = await client.request(
    "thread/start",
    {
      cwd: root,
      model: "claude-sonnet-5-5",
      developerInstructions: "Be concise.",
      runtimeWorkspaceRoots: [root],
    },
    decodeThreadResponse,
  );
  if (!prompt) throw new Error("Claude prompt was not initialized.");
  return { client, notifications, output, prompt, threadId: thread.thread.id };
}

function startTurn(client: ClaudeAgentClient, threadId: string, turnId: string) {
  return client.request(
    "turn/start",
    {
      threadId,
      clientUserMessageId: turnId,
      input: [{ type: "text", text: "Hello" }],
    },
    decodeTurnResponse,
  );
}

function streamDelta(threadId: string, turnId: string, text: string): TestStreamMessage {
  return {
    type: "stream_event",
    parent_tool_use_id: null,
    session_id: threadId,
    uuid: turnId,
    event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
  };
}

function assistantMessage(
  threadId: string,
  messageId: string,
  text: string,
  parentToolUseId: string | null = null,
): TestStreamMessage {
  return {
    type: "assistant",
    parent_tool_use_id: parentToolUseId,
    session_id: threadId,
    uuid: messageId,
    message: { content: [{ type: "text", text }] },
  };
}

function systemMessage(
  threadId: string,
  message: Omit<Extract<TestStreamMessage, { type: "system" }>, "type" | "session_id" | "uuid">,
): TestStreamMessage {
  return { type: "system", session_id: threadId, uuid: "system-message", ...message };
}

function backgroundTaskLists(notifications: Array<{ method: string; params: unknown }>): unknown[] {
  return notifications
    .filter((event) => event.method === "thread/backgroundTasks")
    .map((event) => (isDynamicRecord(event.params) ? event.params.tasks : undefined));
}

function resultMessage(threadId: string, turnId: string, result: string): TestStreamMessage {
  return {
    type: "result",
    subtype: "success",
    result,
    terminal_reason: "completed",
    errors: [],
    session_id: threadId,
    uuid: turnId,
  };
}

function notificationDeltas(notifications: Array<{ method: string; params: unknown }>): string[] {
  return notifications
    .filter((event) => event.method === "item/agentMessage/delta")
    .map((event) => getString(event.params, "delta") ?? "");
}

function completedText(notifications: Array<{ method: string; params: unknown }>): string {
  const completed = notifications.find((event) => event.method === "item/completed");
  const item = getRecord(completed?.params, "item");
  return getString(item, "text") ?? "";
}

class TestQueue<T> implements AsyncIterable<T> {
  readonly #values: T[] = [];
  readonly #waiters: Array<(result: IteratorResult<T>) => void> = [];
  #closed = false;

  push(value: T): void {
    const waiter = this.#waiters.shift();
    if (waiter) waiter({ done: false, value });
    else this.#values.push(value);
  }

  close(): void {
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) waiter({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.#values.shift();
        if (value) return Promise.resolve({ done: false, value });
        if (this.#closed) return Promise.resolve({ done: true, value: undefined });
        return new Promise((resolve) => this.#waiters.push(resolve));
      },
    };
  }
}

class TestQuery implements AsyncIterable<TestStreamMessage> {
  closed = false;
  readonly models: Array<string | undefined> = [];
  readonly flagSettings: Array<{
    effortLevel?: "low" | "medium" | "high" | "xhigh" | "max" | null;
  }> = [];

  constructor(
    private readonly output: TestQueue<TestStreamMessage>,
    private readonly supportedModelList: ModelInfo[] | Promise<ModelInfo[]> = [],
  ) {}

  [Symbol.asyncIterator](): AsyncIterator<TestStreamMessage> {
    return this.output[Symbol.asyncIterator]();
  }

  async interrupt(): Promise<undefined> {
    return undefined;
  }

  async supportedModels(): Promise<ModelInfo[]> {
    return this.supportedModelList;
  }

  async setModel(model?: string): Promise<void> {
    this.models.push(model);
  }

  async applyFlagSettings(settings: {
    effortLevel?: "low" | "medium" | "high" | "xhigh" | "max" | null;
  }): Promise<void> {
    this.flagSettings.push(settings);
  }

  close(): void {
    this.closed = true;
    this.output.close();
  }
}

async function startClaudeThread(dynamicTools: unknown[]): Promise<DynamicRecord> {
  root = await mkdtemp(join(tmpdir(), "lunabot-claude-client-"));
  const executable = await writeNodeExecutable(root, "claude", "#!/usr/bin/env node\n", "cjs");
  const captured: { mcpServers: DynamicRecord | null } = { mcpServers: null };
  const client = new ClaudeAgentClient({ executable, version: "2.1.231" }, (params) => {
    const options: DynamicRecord | null = isDynamicRecord(params.options) ? params.options : null;
    captured.mcpServers = isDynamicRecord(options?.mcpServers) ? options.mcpServers : null;
    return new TestQuery(new TestQueue<TestStreamMessage>());
  });
  client.start();
  await client.request("thread/start", { cwd: root, dynamicTools }, decodeThreadResponse);
  await client.stop();
  if (captured.mcpServers === null) throw new Error("Claude query options were not captured.");
  return captured.mcpServers;
}

async function startThreadOptions(params: DynamicRecord): Promise<DynamicRecord> {
  root = await mkdtemp(join(tmpdir(), "lunabot-claude-subagents-"));
  const executable = await writeNodeExecutable(root, "claude", "#!/usr/bin/env node\n", "cjs");
  const captured: { options: DynamicRecord | null } = { options: null };
  const client = new ClaudeAgentClient({ executable, version: "2.1.231" }, (queryParams) => {
    captured.options = isDynamicRecord(queryParams.options) ? queryParams.options : null;
    return new TestQuery(new TestQueue<TestStreamMessage>());
  });
  client.start();
  await client.request("thread/start", { cwd: root, ...params }, decodeThreadResponse);
  await client.stop();
  if (captured.options === null) throw new Error("Claude query options were not captured.");
  return captured.options;
}

function registeredToolNames(mcpServers: DynamicRecord, serverName: string): string[] {
  const server = mcpServers[serverName];
  const instance = isDynamicRecord(server) ? server.instance : null;
  const registeredTools = isDynamicRecord(instance) ? instance._registeredTools : null;
  return isDynamicRecord(registeredTools) ? Object.keys(registeredTools) : [];
}

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for Claude adapter events.");
}
