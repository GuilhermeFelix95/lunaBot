import { execFile } from "node:child_process";
import { randomUUID, type UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { promisify } from "node:util";
import {
  type CanUseTool,
  createSdkMcpServer,
  getSessionMessages,
  type ModelInfo,
  type PermissionResult,
  query,
  type SDKUserMessage,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { INPUT_LIMITS } from "@lunabot/contracts/input-limits";
import { type DynamicRecord, isNumber, isOneOf, isString } from "@lunabot/contracts/runtime-values";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { nativeMessage } from "../main/native-messages";
import type { AgentProvider } from "./agent-client";
import type { ClaudeCliInfo } from "./cli";
import { LUNABOT_ROOM_NAMESPACE } from "./lunabot-room-tools";
import { withTimeout } from "./promise-timeout";
import {
  type AccountReadResult,
  type AppServerNotification,
  type AppServerRequest,
  getString,
  isRecord,
  type RequestId,
  type ResponseDecoder,
  type RpcError,
  type ThreadResponse,
  type TurnResponse,
} from "./protocol";
import { routineScheduleZodSchema } from "./routine-tool-schema";

const execFileAsync = promisify(execFile);
const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
type ClaudeEffort = (typeof CLAUDE_EFFORTS)[number];

interface ClientEvents {
  notification: [notification: AppServerNotification];
  request: [request: AppServerRequest];
  exit: [error: Error];
  diagnostic: [message: string];
}

interface ThreadConfig {
  cwd: string;
  model?: string;
  effort?: string;
  developerInstructions: string;
  additionalDirectories: string[];
  persistSession: boolean;
  roomManagerTools: boolean;
  allowSubagents: boolean;
}

// Agent is the current name of the subagent tool; Task is the name older Claude Code builds use.
const SUBAGENT_TOOL_NAMES = ["Agent", "Task"];
const TASK_DESCRIPTION_LIMIT = 120;
/** A question nobody answers must not hold the bot's queue forever. */
const USER_QUESTION_TIMEOUT_MS = 30 * 60_000;
const SET_MODEL_TIMEOUT_MS = 30_000;
/** Context window assumed when the SDK has not reported one yet. */
const FALLBACK_CONTEXT_WINDOW = 200_000;
const TERMINAL_TASK_STATUSES = new Set(["completed", "failed", "killed"]);

interface ActiveTurn {
  id: string;
  itemId: string;
  text: string;
  assistantMessages: Map<string, string>;
  /** Opened by background work that answered with no user turn in flight. It has no user bubble and closes on the next result. */
  autonomous: boolean;
  /** A housekeeping turn such as /compact: it runs, but its reply never reaches the conversation. */
  silent?: boolean;
}

interface ThreadRuntime {
  id: string;
  config: ThreadConfig;
  appliedEffort?: string;
  input: AsyncMessageQueue;
  query: ClaudeQuery;
  activeTurn: ActiveTurn | null;
  consume: Promise<void>;
  /** Running SDK tasks by task id. The SDK's background_tasks_changed level signal replaces this set. */
  backgroundTasks: Map<string, string>;
  reportedBackgroundTasks: string;
  /** Tokens the conversation held at its latest model call, and the window the SDK reported for the model. */
  contextTokens: number;
  contextWindow: number | null;
}

interface PendingServerRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface ClaudeStreamMessage {
  type: string;
  parent_tool_use_id?: string | null;
  event?: unknown;
  message?: unknown;
  uuid?: string;
  session_id?: string;
  subtype?: string;
  result?: string;
  errors?: string[];
  terminal_reason?: string;
  task_id?: string;
  description?: string;
  is_backgrounded?: boolean;
  patch?: unknown;
  tasks?: unknown;
  modelUsage?: unknown;
}

interface ClaudeQuery extends AsyncIterable<ClaudeStreamMessage> {
  interrupt(): Promise<unknown>;
  supportedModels(): Promise<ModelInfo[]>;
  setModel(model?: string): Promise<void>;
  applyFlagSettings(settings: { effortLevel?: ClaudeEffort | null }): Promise<void>;
  close(): void;
}

type QueryFactory = (params: Parameters<typeof query>[0]) => ClaudeQuery;
type ClaudeEffortCapability = { supported: ClaudeEffort[]; defaultEffort: ClaudeEffort } | null;

export class ClaudeAgentClient extends EventEmitter<ClientEvents> {
  readonly provider: AgentProvider = "claude";
  readonly #cli: ClaudeCliInfo;
  readonly #createQuery: QueryFactory;
  readonly #claudeCompactWindow: () => number | null;
  readonly #threads = new Map<string, ThreadRuntime>();
  readonly #pendingServerRequests = new Map<RequestId, PendingServerRequest>();
  readonly #modelEffortCapabilities = new Map<string, ClaudeEffortCapability>();
  readonly #modelSdkValues = new Map<string, string>();
  #running = false;

  constructor(
    cli: ClaudeCliInfo,
    createQuery: QueryFactory = query,
    claudeCompactWindow: () => number | null = () => null,
  ) {
    super();
    this.#cli = cli;
    this.#createQuery = createQuery;
    this.#claudeCompactWindow = claudeCompactWindow;
  }

  get running(): boolean {
    return this.#running;
  }

  start(): void {
    this.#running = true;
  }

  async stop(): Promise<void> {
    this.#running = false;
    for (const runtime of this.#threads.values()) {
      runtime.input.close();
      runtime.query.close();
    }
    await Promise.allSettled([...this.#threads.values()].map((runtime) => runtime.consume));
    this.#threads.clear();
    for (const pending of this.#pendingServerRequests.values()) {
      pending.reject(new Error("Claude session stopped."));
    }
    this.#pendingServerRequests.clear();
  }

  request<T>(method: string, params: unknown, decoder: ResponseDecoder<T>, _timeoutMs?: number): Promise<T>;
  async request<T>(method: string, params: unknown, decoder: ResponseDecoder<T>, _timeoutMs?: number): Promise<T> {
    if (!this.#running) throw new Error(nativeMessage("errors.claude.sdkStopped"));

    switch (method) {
      case "initialize":
        return decoder({});
      case "account/read":
        return decoder(await this.#readAccount());
      case "account/rateLimits/read":
        return decoder({ rateLimits: null, rateLimitsByLimitId: null });
      case "model/list":
        return decoder({ data: await this.#listModels(_timeoutMs) });
      case "plugin/list":
        return decoder({ marketplaces: [] });
      case "thread/start": {
        const threadId = randomUUID();
        await this.#startThread(threadId, readThreadConfig(params), false);
        return decoder({ thread: { id: threadId } });
      }
      case "thread/resume": {
        const threadId = requiredString(params, "threadId");
        const config = readThreadConfig(params);
        const current = this.#threads.get(threadId);
        if (current && JSON.stringify(current.config) !== JSON.stringify(config)) {
          if (current.activeTurn) throw new Error("Finish the running Claude turn, then refresh the context.");
          this.#threads.delete(threadId);
          current.input.close();
          current.query.close();
          await current.consume;
          // The restarted process cannot reach the background tasks of the one it replaces.
          current.backgroundTasks.clear();
          this.#reportBackgroundTasks(current);
        }
        if (!this.#threads.has(threadId)) {
          await this.#startThread(threadId, config, true);
        }
        return decoder({ thread: { id: threadId } });
      }
      case "thread/read":
        return decoder(await this.#readThread(requiredString(params, "threadId")));
      case "turn/start":
        return decoder(await this.#startTurn(params));
      case "turn/steer":
        return decoder(await this.#steerTurn(params));
      case "turn/interrupt": {
        const runtime = this.#requireThread(requiredString(params, "threadId"));
        await runtime.query.interrupt();
        return decoder({});
      }
      case "thread/compact/start": {
        // Claude Code compacts through its own /compact command, which runs as a turn of its own.
        const threadId = requiredString(params, "threadId");
        await this.#startTurn({ threadId, silentTurn: "true", input: [{ type: "text", text: "/compact" }] });
        return decoder({});
      }
      default:
        throw new Error(`Claude adapter does not implement ${method}.`);
    }
  }

  notify(): void {
    // Claude Agent SDK has no initialize notification.
  }

  respond(id: RequestId, result: unknown): void {
    const pending = this.#pendingServerRequests.get(id);
    if (!pending) return;
    this.#pendingServerRequests.delete(id);
    pending.resolve(result);
  }

  respondError(id: RequestId, error: RpcError): void {
    const pending = this.#pendingServerRequests.get(id);
    if (!pending) return;
    this.#pendingServerRequests.delete(id);
    pending.reject(new Error(error.message));
  }

  async #listModels(timeoutMs?: number): Promise<unknown[]> {
    const input = new AsyncMessageQueue();
    const claudeQuery = this.#createQuery({
      prompt: input,
      options: {
        cwd: process.cwd(),
        pathToClaudeCodeExecutable: this.#cli.executable,
        settingSources: ["user", "project", "local"],
        persistSession: false,
        env: { ...claudeEnvironment(this.#cli), CLAUDE_AGENT_SDK_CLIENT_APP: "lunabot/0.1.0" },
      },
    });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const discovery = claudeQuery.supportedModels();
      const discovered =
        timeoutMs === undefined
          ? await discovery
          : await Promise.race([
              discovery,
              new Promise<ModelInfo[]>((_, reject) => {
                timeout = setTimeout(() => {
                  input.close();
                  claudeQuery.close();
                  reject(new Error("Claude request timed out: model/list"));
                }, timeoutMs);
              }),
            ]);
      const models = new Map<string, (typeof discovered)[number]>();
      for (const model of discovered) {
        // The "default" alias only points at the CLI's pick; it must not shadow that model's own row.
        if (model.value.trim() === "default") continue;
        const id = model.resolvedModel?.trim() || model.value.trim();
        if (!id || models.has(id)) continue;
        models.set(id, model);
      }
      const effortCapabilities = new Map<string, ClaudeEffortCapability>();
      const sdkValues = new Map<string, string>();
      const result = [...models.entries()].map(([id, model]) => {
        const discoveredReasoningEfforts = [
          ...new Set((model.supportedEffortLevels ?? []).filter((effort) => isOneOf(CLAUDE_EFFORTS, effort))),
        ];
        const supportedReasoningEfforts =
          discoveredReasoningEfforts.length > 0 ? discoveredReasoningEfforts : ["medium" as const];
        const defaultReasoningEffort = supportedReasoningEfforts.includes("high")
          ? "high"
          : (supportedReasoningEfforts[0] ?? "medium");
        effortCapabilities.set(
          id,
          model.supportsEffort === false
            ? null
            : { supported: supportedReasoningEfforts, defaultEffort: defaultReasoningEffort },
        );
        sdkValues.set(id, model.value.trim() || id);
        return {
          model: id,
          displayName: model.displayName,
          defaultReasoningEffort,
          supportedReasoningEfforts: supportedReasoningEfforts.map((reasoningEffort) => ({ reasoningEffort })),
        };
      });
      this.#modelEffortCapabilities.clear();
      this.#modelSdkValues.clear();
      for (const [id, capability] of effortCapabilities) this.#modelEffortCapabilities.set(id, capability);
      for (const [id, value] of sdkValues) this.#modelSdkValues.set(id, value);
      return result;
    } finally {
      if (timeout) clearTimeout(timeout);
      input.close();
      claudeQuery.close();
    }
  }

  async #readAccount(): Promise<AccountReadResult> {
    try {
      const { stdout } = await execFileAsync(this.#cli.executable, ["auth", "status", "--json"], {
        timeout: 5_000,
        maxBuffer: 64 * 1024,
        shell: process.platform === "win32",
        env: claudeEnvironment(this.#cli),
      });
      const status = JSON.parse(stdout);
      if (!isRecord(status) || status.loggedIn !== true) {
        return { account: null, requiresOpenaiAuth: false };
      }
      return {
        account: {
          type: "claude",
          email: isString(status.email) ? status.email : null,
          planType: isString(status.subscriptionType) ? status.subscriptionType : null,
        },
        requiresOpenaiAuth: false,
      };
    } catch {
      return { account: null, requiresOpenaiAuth: false };
    }
  }

  async #startThread(threadId: string, config: ThreadConfig, resume: boolean): Promise<void> {
    const input = new AsyncMessageQueue();
    const appliedEffort = this.#resolveEffort(config.model, config.effort);
    const canUseTool: CanUseTool = async (toolName, toolInput, options) => {
      if (toolName !== "AskUserQuestion") {
        return { behavior: "allow", updatedInput: toolInput } satisfies PermissionResult;
      }
      return this.#requestUserInput(threadId, toolInput, options.toolUseID ?? randomUUID());
    };
    const mcpServers = {
      ...this.#createLunaBotServers(threadId),
      ...(config.roomManagerTools ? { lunabot_room: this.#createRoomManagerServer(threadId) } : {}),
    };
    const claudeQuery = this.#createQuery({
      prompt: input,
      options: {
        cwd: config.cwd,
        pathToClaudeCodeExecutable: this.#cli.executable,
        ...(config.model ? { model: this.#sdkModel(config.model) } : {}),
        ...(appliedEffort ? { effort: appliedEffort } : {}),
        ...(resume ? { resume: threadId } : { sessionId: threadId }),
        ...(config.allowSubagents ? {} : { disallowedTools: SUBAGENT_TOOL_NAMES }),
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: config.developerInstructions,
        },
        settingSources: ["user", "project", "local"],
        permissionMode: "default",
        includePartialMessages: true,
        persistSession: config.persistSession,
        additionalDirectories: config.additionalDirectories,
        canUseTool,
        mcpServers,
        env: {
          ...claudeEnvironment(this.#cli, this.#claudeCompactWindow()),
          CLAUDE_AGENT_SDK_CLIENT_APP: "lunabot/0.1.0",
        },
      },
    });
    const runtime: ThreadRuntime = {
      id: threadId,
      config,
      appliedEffort,
      input,
      query: claudeQuery,
      activeTurn: null,
      consume: Promise.resolve(),
      backgroundTasks: new Map(),
      reportedBackgroundTasks: "[]",
      contextTokens: 0,
      contextWindow: null,
    };
    runtime.consume = this.#consume(runtime);
    this.#threads.set(threadId, runtime);
  }

  async #startTurn(params: unknown): Promise<TurnResponse> {
    const threadId = requiredString(params, "threadId");
    const runtime = this.#requireThread(threadId);
    if (runtime.activeTurn) throw new Error("This Claude thread is busy with another turn.");

    const requestedModel = getString(params, "model");
    const modelChanged = Boolean(requestedModel && requestedModel !== runtime.config.model);
    if (requestedModel && modelChanged) {
      await withTimeout(
        runtime.query.setModel(this.#sdkModel(requestedModel)),
        SET_MODEL_TIMEOUT_MS,
        nativeMessage("errors.claude.setModelTimedOut"),
      );
      runtime.config.model = requestedModel;
    }
    const requestedEffort = getString(params, "effort");
    const selectedEffort = requestedEffort ?? runtime.config.effort;
    const appliedEffort = this.#resolveEffort(runtime.config.model, selectedEffort);
    if (!appliedEffort) {
      if (runtime.appliedEffort !== undefined) await runtime.query.applyFlagSettings({ effortLevel: null });
      runtime.appliedEffort = undefined;
    } else if (modelChanged || appliedEffort !== runtime.appliedEffort) {
      await runtime.query.applyFlagSettings({ effortLevel: appliedEffort });
      runtime.appliedEffort = appliedEffort;
    }
    if (requestedEffort) runtime.config.effort = requestedEffort;

    const clientId = getString(params, "clientUserMessageId");
    const turnId = clientId && isUuid(clientId) ? clientId : randomUUID();
    const text = readInputText(params);
    const activeTurn = {
      id: turnId,
      itemId: `${turnId}:assistant`,
      text: "",
      assistantMessages: new Map<string, string>(),
      autonomous: false,
      silent: getString(params, "silentTurn") === "true",
    };
    runtime.activeTurn = activeTurn;
    this.emit("notification", {
      method: "turn/started",
      params: { threadId, turn: { id: turnId, status: "inProgress" } },
    });
    runtime.input.push({
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
      uuid: turnId,
      session_id: threadId,
    });
    return { turn: { id: turnId, status: "inProgress" } };
  }

  async #steerTurn(params: unknown): Promise<{ turnId: string }> {
    const threadId = requiredString(params, "threadId");
    const runtime = this.#requireThread(threadId);
    const expectedTurnId = requiredString(params, "expectedTurnId");
    if (!runtime.activeTurn || runtime.activeTurn.id !== expectedTurnId) {
      throw new Error("The running Claude turn shifted before the steer took effect.");
    }
    const clientId = getString(params, "clientUserMessageId");
    const messageId = clientId && isUuid(clientId) ? clientId : randomUUID();
    runtime.input.push({
      type: "user",
      message: { role: "user", content: readInputText(params) },
      parent_tool_use_id: null,
      uuid: messageId,
      session_id: threadId,
    });
    return { turnId: runtime.activeTurn.id };
  }

  async #consume(runtime: ThreadRuntime): Promise<void> {
    try {
      for await (const message of runtime.query) this.#handleMessage(runtime, message);
      if (this.#running && this.#threads.get(runtime.id) === runtime) {
        this.#fail(new Error(nativeMessage("errors.claude.streamEnded")));
      }
    } catch (error) {
      if (!this.#running || this.#threads.get(runtime.id) !== runtime) return;
      const activeTurn = runtime.activeTurn;
      if (activeTurn) this.#completeTurn(runtime, "failed", error);
      this.#fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  #fail(error: Error): void {
    if (!this.#running) return;
    this.#running = false;
    this.emit("exit", error);
  }

  #handleMessage(runtime: ThreadRuntime, message: ClaudeStreamMessage): void {
    if (message.type === "stream_event" && message.parent_tool_use_id === null) {
      const event = message.event;
      const delta = isRecord(event) ? event.delta : null;
      if (
        event &&
        isRecord(event) &&
        event.type === "content_block_delta" &&
        isRecord(delta) &&
        delta.type === "text_delta" &&
        isString(delta.text)
      ) {
        this.#appendDelta(runtime, delta.text);
      }
      return;
    }

    if (message.type === "assistant") {
      if (message.parent_tool_use_id !== null) return;
      this.#reportContextUsage(runtime, message.message);
      const text = messageText(message.message);
      if (!text || !message.uuid) return;
      const turn = runtime.activeTurn ?? this.#openAutonomousTurn(runtime);
      turn.assistantMessages.set(message.uuid, text);
      const completeText = [...turn.assistantMessages.values()].join("");
      if (completeText.startsWith(turn.text)) {
        this.#appendDelta(runtime, completeText.slice(turn.text.length));
      }
      return;
    }

    if (message.type === "system") {
      this.#handleBackgroundTaskMessage(runtime, message);
      return;
    }

    if (message.type !== "result") return;
    this.#rememberContextWindow(runtime, message.modelUsage);
    const fallback = message.subtype === "success" ? message.result : "";
    const errors = message.errors ?? [];
    const turn = runtime.activeTurn;
    if (turn) {
      const completeText = [...turn.assistantMessages.values()].join("");
      if (completeText) turn.text = completeText;
      else if (!turn.text && fallback) this.#appendDelta(runtime, fallback);
    }
    const interrupted =
      message.terminal_reason === "aborted_streaming" ||
      message.terminal_reason === "aborted_tools" ||
      errors.some((error) => /interrupt|abort/i.test(error));
    const status = interrupted ? "interrupted" : message.subtype === "success" ? "completed" : "failed";
    this.#completeTurn(runtime, status, errors.length > 0 ? errors.join("\n") : null);
  }

  // The usage of a model call is the conversation size at that call: fresh input plus everything read from or written to the cache.
  #reportContextUsage(runtime: ThreadRuntime, message: unknown): void {
    const usage = isRecord(message) && isRecord(message.usage) ? message.usage : null;
    if (!usage) return;
    const count = (value: unknown) => (isNumber(value) && Number.isFinite(value) ? value : 0);
    const tokens =
      count(usage.input_tokens) +
      count(usage.cache_creation_input_tokens) +
      count(usage.cache_read_input_tokens) +
      count(usage.output_tokens);
    if (tokens <= 0) return;
    runtime.contextTokens = tokens;
    const compactAtTokens = this.#claudeCompactWindow();
    this.emit("notification", {
      method: "thread/tokenUsage/updated",
      params: {
        threadId: runtime.id,
        tokenUsage: {
          last: { totalTokens: tokens },
          modelContextWindow: runtime.contextWindow ?? FALLBACK_CONTEXT_WINDOW,
          ...(compactAtTokens === null ? {} : { compactAtTokens }),
        },
      },
    });
  }

  #rememberContextWindow(runtime: ThreadRuntime, modelUsage: unknown): void {
    if (!isRecord(modelUsage)) return;
    for (const entry of Object.values(modelUsage)) {
      if (isRecord(entry) && isNumber(entry.contextWindow) && entry.contextWindow > 0) {
        runtime.contextWindow = entry.contextWindow;
        return;
      }
    }
  }

  #appendDelta(runtime: ThreadRuntime, delta: string): void {
    if (!delta) return;
    const turn = runtime.activeTurn ?? this.#openAutonomousTurn(runtime);
    turn.text += delta;
    if (turn.silent) return;
    this.emit("notification", {
      method: "item/agentMessage/delta",
      params: {
        threadId: runtime.id,
        turnId: turn.id,
        itemId: turn.itemId,
        delta,
      },
    });
  }

  #completeTurn(runtime: ThreadRuntime, status: string, error: unknown): void {
    const turn = runtime.activeTurn;
    if (!turn) return;
    if (!turn.silent) {
      this.emit("notification", {
        method: "item/completed",
        params: {
          threadId: runtime.id,
          turnId: turn.id,
          item: { id: turn.itemId, type: "agentMessage", text: turn.text },
        },
      });
    }
    if (status === "failed" && error) {
      this.emit("notification", {
        method: "error",
        params: { threadId: runtime.id, turnId: turn.id, message: String(error) },
      });
    }
    this.emit("notification", {
      method: "turn/completed",
      params: {
        threadId: runtime.id,
        ...(turn.autonomous ? { origin: "system" } : {}),
        turn: { id: turn.id, status },
      },
    });
    runtime.activeTurn = null;
  }

  // Background work (a finished subagent, a scheduled wake-up) can make Claude answer with no user turn in flight.
  // The turn is opened only when text arrives, so it is never empty, and the next result closes it.
  #openAutonomousTurn(runtime: ThreadRuntime): ActiveTurn {
    const turnId = randomUUID();
    const turn: ActiveTurn = {
      id: turnId,
      itemId: `${turnId}:assistant`,
      text: "",
      assistantMessages: new Map<string, string>(),
      autonomous: true,
    };
    runtime.activeTurn = turn;
    this.emit("notification", {
      method: "turn/started",
      params: { threadId: runtime.id, origin: "system", turn: { id: turnId, status: "inProgress" } },
    });
    return turn;
  }

  #handleBackgroundTaskMessage(runtime: ThreadRuntime, message: ClaudeStreamMessage): void {
    if (message.subtype === "background_tasks_changed") {
      // Level signal: the list it carries is the complete set of running tasks.
      runtime.backgroundTasks.clear();
      for (const task of Array.isArray(message.tasks) ? message.tasks : []) {
        if (isRecord(task) && isString(task.task_id)) {
          runtime.backgroundTasks.set(task.task_id, taskDescription(task.description));
        }
      }
    } else if (message.subtype === "task_started" && isString(message.task_id)) {
      runtime.backgroundTasks.set(message.task_id, taskDescription(message.description));
    } else if (message.subtype === "task_notification" && isString(message.task_id)) {
      runtime.backgroundTasks.delete(message.task_id);
    } else if (message.subtype === "task_updated" && isString(message.task_id)) {
      const status = isRecord(message.patch) ? message.patch.status : undefined;
      if (isString(status) && TERMINAL_TASK_STATUSES.has(status)) runtime.backgroundTasks.delete(message.task_id);
    } else {
      return;
    }
    this.#reportBackgroundTasks(runtime);
  }

  #reportBackgroundTasks(runtime: ThreadRuntime): void {
    const tasks = [...runtime.backgroundTasks].map(([id, description]) => ({ id, description }));
    const serialized = JSON.stringify(tasks);
    if (serialized === runtime.reportedBackgroundTasks) return;
    runtime.reportedBackgroundTasks = serialized;
    this.emit("notification", {
      method: "thread/backgroundTasks",
      params: { threadId: runtime.id, tasks },
    });
  }

  async #readThread(threadId: string): Promise<ThreadResponse> {
    const runtime = this.#threads.get(threadId);
    const messages = await getSessionMessages(threadId, runtime?.config.cwd ? { dir: runtime.config.cwd } : undefined);
    const turns: NonNullable<ThreadResponse["thread"]["turns"]> = [];
    let current: (typeof turns)[number] | null = null;
    for (const message of messages) {
      if (message.parent_tool_use_id) continue;
      const text = messageText(message.message);
      if (message.type === "user") {
        if (!text) continue;
        current = {
          id: message.uuid,
          status: "completed",
          items: [
            {
              id: message.uuid,
              type: "userMessage",
              clientId: message.uuid,
              content: [{ type: "text", text }],
            },
          ],
        };
        turns.push(current);
      } else if (message.type === "assistant" && text) {
        if (!current) {
          current = { id: message.uuid, status: "completed", items: [] };
          turns.push(current);
        }
        current.items?.push({ id: message.uuid, type: "agentMessage", text });
      }
    }
    return { thread: { id: threadId, turns } };
  }

  // Claude does not read thread/start dynamicTools. Its tools are in-process MCP servers that forward each call as
  // item/tool/call to AgentService. Codex and Grok get the same namespaces from dynamicTools, so this list must stay in sync.
  #createLunaBotServers(threadId: string) {
    const call = (namespace: string, name: string, args: unknown) =>
      this.#callDynamicTool(threadId, namespace, name, args);
    return {
      lunabot_browser: createSdkMcpServer({
        name: "lunabot_browser",
        version: "0.1.0",
        tools: [
          tool("open", "Open an HTTP(S) URL in Luna Bot's private browser.", { url: z.string() }, (args) =>
            call("lunabot_browser", "open", args),
          ),
          tool("list_tabs", "List Luna Bot browser tabs.", {}, (args) => call("lunabot_browser", "list_tabs", args)),
          tool("snapshot", "Read a browser page and get element references.", { tabId: z.string() }, (args) =>
            call("lunabot_browser", "snapshot", args),
          ),
          tool(
            "act",
            "Click, type, press a key, scroll, navigate, or reload in Luna Bot's browser.",
            {
              tabId: z.string(),
              revision: z.number().int(),
              action: z.object({
                type: z.enum(["click", "type", "key", "scroll", "back", "forward", "reload"]),
                ref: z.string().optional(),
                text: z.string().optional(),
                submit: z.boolean().optional(),
                key: z.string().optional(),
                deltaY: z.number().optional(),
              }),
            },
            (args) => call("lunabot_browser", "act", args),
          ),
          tool("screenshot", "Capture the visible browser page.", { tabId: z.string() }, (args) =>
            call("lunabot_browser", "screenshot", args),
          ),
          tool("close_tab", "Close a Luna Bot browser tab.", { tabId: z.string() }, (args) =>
            call("lunabot_browser", "close_tab", args),
          ),
        ],
      }),
      lunabot: createSdkMcpServer({
        name: "lunabot",
        version: "0.1.0",
        tools: [
          tool(
            "attach_files_to_response",
            "Attach existing local files to the current response for the user. Use this for screenshots, charts, diagrams, reports, and other files that the user should receive.",
            { paths: z.array(z.string().min(1).max(INPUT_LIMITS.path)).min(1).max(INPUT_LIMITS.attachments) },
            (args) => call("lunabot", "attach_files_to_response", args),
          ),
          tool("list_agents", "List Luna Bot agents that can receive local messages.", {}, (args) =>
            call("lunabot", "list_agents", args),
          ),
          tool(
            "list_routines",
            "List routines for this agent, or for another local agent when botId is provided.",
            { botId: z.string().min(1).max(INPUT_LIMITS.identifier).optional() },
            (args) => call("lunabot", "list_routines", args),
          ),
          tool(
            "create_routine",
            "Create a scheduled routine for this agent, or for another local agent when botId is provided.",
            {
              botId: z.string().min(1).max(INPUT_LIMITS.identifier).optional(),
              name: z.string().min(1).max(INPUT_LIMITS.routineName),
              instruction: z.string().min(1).max(INPUT_LIMITS.routineInstruction),
              schedule: routineScheduleZodSchema,
              active: z.boolean().optional(),
              timezone: z.string().min(1).max(128).optional(),
            },
            (args) => call("lunabot", "create_routine", args),
          ),
          tool(
            "update_routine",
            "Update, pause, or resume an existing routine for this agent, or for another local agent when botId is provided.",
            {
              botId: z.string().min(1).max(INPUT_LIMITS.identifier).optional(),
              routineId: z.string().min(1).max(INPUT_LIMITS.identifier),
              name: z.string().min(1).max(INPUT_LIMITS.routineName).optional(),
              instruction: z.string().min(1).max(INPUT_LIMITS.routineInstruction).optional(),
              schedule: routineScheduleZodSchema.optional(),
              active: z.boolean().optional(),
            },
            (args) => call("lunabot", "update_routine", args),
          ),
          tool(
            "delete_routine",
            "Delete an existing routine for this agent, or for another local agent when botId is provided.",
            {
              botId: z.string().min(1).max(INPUT_LIMITS.identifier).optional(),
              routineId: z.string().min(1).max(INPUT_LIMITS.identifier),
            },
            (args) => call("lunabot", "delete_routine", args),
          ),
          tool(
            "test_routine",
            "Queue one manual test run of an existing routine for this agent, or for another local agent when botId is provided.",
            {
              botId: z.string().min(1).max(INPUT_LIMITS.identifier).optional(),
              routineId: z.string().min(1).max(INPUT_LIMITS.identifier),
            },
            (args) => call("lunabot", "test_routine", args),
          ),
          tool(
            "remember",
            "Stage one durable memory for this agent. Use memoryId to update an existing memory.",
            {
              text: z.string().min(1).max(500),
              memoryId: z.string().optional(),
            },
            (args) => call("lunabot", "remember", args),
          ),
          tool(
            "forget_memory",
            "Stage deletion of one saved memory when the user asks you to forget it.",
            { memoryId: z.string().min(1) },
            (args) => call("lunabot", "forget_memory", args),
          ),
          tool(
            "react_to_user_message",
            "Add one emoji reaction for an obvious positive or negative emotional moment such as a win, affection, gratitude, humor, sadness, disappointment, frustration, empathy, or strong approval. Inline emoji do not count as reactions. Skip neutral messages and always provide the same complete normal answer.",
            { emoji: z.string().min(1).max(64) },
            (args) => call("lunabot", "react_to_user_message", args),
          ),
          tool(
            "send_message",
            "Send an asynchronous message or local files to Luna Bot teammates.",
            {
              recipientBotIds: z.array(z.string()).min(1).max(32),
              text: z.string().min(1).max(100_000),
              paths: z.array(z.string()).max(10).optional(),
              replyToMessageId: z.string().nullable().optional(),
            },
            (args) => call("lunabot", "send_message", args),
          ),
        ],
      }),
    };
  }

  // Built only when AgentService lists the lunabot_room namespace for this thread (the active room manager).
  // RoomService checks the caller again on every call.
  #createRoomManagerServer(threadId: string) {
    const call = (name: string, args: unknown) => this.#callDynamicTool(threadId, LUNABOT_ROOM_NAMESPACE, name, args);
    return createSdkMcpServer({
      name: LUNABOT_ROOM_NAMESPACE,
      version: "0.1.0",
      tools: [
        tool("room_members", "List the active members of your room.", {}, (args) => call("room_members", args)),
        tool(
          "room_catalog",
          "List general agents that could be hired into your room. Use their botId to request a hire.",
          {},
          (args) => call("room_catalog", args),
        ),
        tool(
          "list_rooms",
          "List the other active rooms with their manager and members. Message a manager with send_message to ask that room for work.",
          {},
          (args) => call("list_rooms", args),
        ),
        tool(
          "request_hire",
          "Ask the user to hire a general agent into your room. Nothing changes until the user approves.",
          {
            botId: z.string().min(1).max(INPUT_LIMITS.identifier),
            reason: z.string().min(1).max(1_000),
          },
          (args) => call("request_hire", args),
        ),
        tool(
          "request_new_bot",
          "Ask the user to create a new general agent that your room needs. The user creates it; then you can request a hire.",
          {
            name: z.string().min(1).max(80),
            title: z.string().max(120).optional(),
            description: z.string().max(2_000).optional(),
            reason: z.string().min(1).max(1_000),
          },
          (args) => call("request_new_bot", args),
        ),
        tool(
          "request_dismiss",
          "Ask the user to dismiss an active member from your room. Nothing changes until the user approves.",
          {
            botId: z.string().min(1).max(INPUT_LIMITS.identifier),
            reason: z.string().min(1).max(1_000),
          },
          (args) => call("request_dismiss", args),
        ),
      ],
    });
  }

  async #callDynamicTool(threadId: string, namespace: string, name: string, args: unknown): Promise<CallToolResult> {
    const runtime = this.#requireThread(threadId);
    const result = await this.#callServerRequest("item/tool/call", {
      threadId,
      turnId: runtime.activeTurn?.id ?? randomUUID(),
      callId: randomUUID(),
      namespace,
      tool: name,
      arguments: args,
    }).promise;
    if (!isRecord(result)) return { content: [{ type: "text" as const, text: String(result) }] };
    const content: CallToolResult["content"] = [];
    if (Array.isArray(result.contentItems)) {
      for (const item of result.contentItems) content.push(...dynamicContent(item));
    }
    return { content, isError: result.success === false };
  }

  async #requestUserInput(threadId: string, input: DynamicRecord, toolUseId: string): Promise<PermissionResult> {
    const runtime = this.#requireThread(threadId);
    const rawQuestions = Array.isArray(input.questions) ? input.questions.filter(isRecord) : [];
    const questions = rawQuestions.map((question, index) => ({
      id: `question-${index}`,
      header: isString(question.header) ? question.header : "Question",
      question: isString(question.question) ? question.question : nativeMessage("errors.claude.questionFallback"),
      options: Array.isArray(question.options) ? question.options : undefined,
    }));
    const request = this.#callServerRequest("item/tool/requestUserInput", {
      threadId,
      turnId: runtime.activeTurn?.id ?? randomUUID(),
      itemId: toolUseId,
      questions,
    });
    const result = await withTimeout(
      request.promise,
      USER_QUESTION_TIMEOUT_MS,
      nativeMessage("errors.claude.questionTimedOut"),
    ).catch((error: unknown) => {
      this.#pendingServerRequests.delete(request.id);
      return error instanceof Error ? error : new Error(String(error));
    });
    if (result instanceof Error) return { behavior: "deny", message: result.message };
    const responseAnswers = isRecord(result) && isRecord(result.answers) ? result.answers : {};
    const answers = Object.fromEntries(
      questions.map((question) => {
        const entry = responseAnswers[question.id];
        const values = isRecord(entry) && Array.isArray(entry.answers) ? entry.answers : [];
        return [question.question, values.filter((value): value is string => isString(value)).join(", ")];
      }),
    );
    return { behavior: "allow", updatedInput: { questions: input.questions, answers } };
  }

  #callServerRequest(method: string, params: unknown): { id: string; promise: Promise<unknown> } {
    const id = randomUUID();
    const promise = new Promise<unknown>((resolve, reject) => {
      this.#pendingServerRequests.set(id, { resolve, reject });
      this.emit("request", { id, method, params });
    });
    return { id, promise };
  }

  #requireThread(threadId: string): ThreadRuntime {
    const runtime = this.#threads.get(threadId);
    if (!runtime) throw new Error(`Unknown Claude thread: ${threadId}`);
    return runtime;
  }

  #resolveEffort(model: string | undefined, effort: string | undefined): ClaudeEffort | undefined {
    if (!effort) return undefined;
    const normalized = normalizeClaudeEffort(effort);
    if (!model) return normalized;
    const capability = this.#modelEffortCapabilities.get(model);
    if (capability === null) return undefined;
    if (!capability || capability.supported.includes(normalized)) return normalized;
    return capability.defaultEffort;
  }

  #sdkModel(model: string): string {
    return this.#modelSdkValues.get(model) ?? normalizeClaudeModel(model);
  }
}

function claudeEnvironment(cli: ClaudeCliInfo, compactWindow: number | null = null): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(cli.source === "managed" ? { DISABLE_AUTOUPDATER: "1" } : {}),
    ...(compactWindow === null ? {} : { CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(compactWindow) }),
  };
}

class AsyncMessageQueue implements AsyncIterable<SDKUserMessage> {
  readonly #values: SDKUserMessage[] = [];
  readonly #waiters: Array<(result: IteratorResult<SDKUserMessage>) => void> = [];
  #closed = false;

  push(value: SDKUserMessage): void {
    if (this.#closed) throw new Error("Claude's input queue has shut down.");
    const waiter = this.#waiters.shift();
    if (waiter) waiter({ done: false, value });
    else this.#values.push(value);
  }

  close(): void {
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) waiter({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
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

function readThreadConfig(params: unknown): ThreadConfig {
  const roots =
    isRecord(params) && Array.isArray(params.runtimeWorkspaceRoots)
      ? params.runtimeWorkspaceRoots.filter((value): value is string => isString(value))
      : [];
  const cwd = requiredString(params, "cwd");
  return {
    cwd,
    model: getString(params, "model") ?? undefined,
    effort: getString(params, "effort") ?? undefined,
    developerInstructions: getString(params, "developerInstructions") ?? "",
    additionalDirectories: [...new Set([cwd, ...roots])],
    persistSession: !isRecord(params) || params.persistSession !== false,
    roomManagerTools:
      isRecord(params) &&
      Array.isArray(params.dynamicTools) &&
      params.dynamicTools.some(
        (entry) => isRecord(entry) && entry.type === "namespace" && entry.name === LUNABOT_ROOM_NAMESPACE,
      ),
    allowSubagents: !isRecord(params) || params.allowSubagents !== false,
  };
}

function taskDescription(value: unknown): string {
  return isString(value) ? value.trim().slice(0, TASK_DESCRIPTION_LIMIT) : "";
}

function requiredString(value: unknown, key: string): string {
  const result = getString(value, key);
  if (!result) throw new Error(`${key} is required.`);
  return result;
}

function readInputText(params: unknown): string {
  if (!isRecord(params) || !Array.isArray(params.input)) return "";
  return params.input
    .filter(isRecord)
    .filter((item) => item.type === "text" && isString(item.text))
    .map((item) => item.text)
    .join("\n");
}

function messageText(message: unknown): string {
  if (!isRecord(message)) return "";
  if (isString(message.content)) return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .filter(isRecord)
    .filter((block) => block.type === "text" && isString(block.text))
    .map((block) => block.text)
    .join("\n");
}

function dynamicContent(value: unknown): CallToolResult["content"] {
  if (!isRecord(value)) return [];
  if (value.type === "inputText" && isString(value.text)) {
    return [{ type: "text" as const, text: value.text }];
  }
  if (value.type === "inputImage" && isString(value.imageUrl)) {
    const match = value.imageUrl.match(/^data:([^;]+);base64,(.+)$/s);
    if (match) return [{ type: "image" as const, mimeType: match[1], data: match[2] }];
  }
  return [];
}

function normalizeClaudeModel(model: string): string {
  return model.startsWith("claude-") ? model : "claude-haiku-5-5";
}

function normalizeClaudeEffort(effort: string): ClaudeEffort {
  return isOneOf(CLAUDE_EFFORTS, effort) ? effort : "high";
}

function isUuid(value: string): value is UUID {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
