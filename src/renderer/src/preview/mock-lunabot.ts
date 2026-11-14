import type {
  AccountUsage,
  AgentEvent,
  AgentMemoryLimit,
  AgentModelOption,
  AgentStatus,
  AppInfo,
  ApprovalPolicyMode,
  AppSetupState,
  AttachmentImportEvent,
  BotMemory,
  BotSummary,
  BrowserControlState,
  BrowserOpenInput,
  BrowserPictureInPictureEvent,
  BrowserPreview,
  BrowserTab,
  BusyMessageMode,
  ConversationMessage,
  ConversationSnapshot,
  DynamicIslandPreference,
  DynamicIslandPresentation,
  LunaBotDesktopApi,
  OpenAttachmentInput,
  OpenSharedFileInput,
  OpenWorkspaceFileInput,
  PinnedMessage,
  PinnedMessagesSnapshot,
  QueueDelivery,
  QueueSnapshot,
  ReorderQueueInput,
  RespondToPromptInput,
  Routine,
  RoutineRun,
  SendMessageInput,
  SetAgentAvatarInput,
  SetMessagePinnedInput,
  SetMessageReactionInput,
  SidebarLayoutAction,
  SidebarLayoutSnapshot,
  SteerQueuedMessageInput,
  UpdateBotInput,
  UpdateQueuedMessageInput,
  UpdateStatus,
  WindowCloseBehavior,
} from "@lunabot/contracts/ipc";
import {
  DEFAULT_APPROVAL_POLICY_MODE,
  DEFAULT_BUSY_MESSAGE_MODE,
  DEFAULT_DYNAMIC_ISLAND_PREFERENCE,
  DEFAULT_WINDOW_CLOSE_BEHAVIOR,
  MESSAGE_PIN_TEXT_LIMIT,
  MESSAGE_PINS_LIMIT,
  SIDEBAR_PEOPLE_SECTION_ID,
  SIDEBAR_UNASSIGNED_SECTION_ID,
} from "@lunabot/contracts/ipc";
import browserTakeoverPreviewUrl from "../../stories/assets/browser-takeover-preview.svg";
import {
  STORY_AGENT_STATUS,
  STORY_APP_INFO,
  STORY_BOT_SUMMARIES,
  STORY_BROWSER_CONTROL,
  STORY_BROWSER_TABS,
  STORY_MODELS,
  STORY_SNAPSHOTS,
  STORY_UPDATE_STATUS,
  STORY_USAGE,
} from "./fixtures";

type Listener<T> = (value: T) => void;

export interface MockLunaBotOptions {
  appInfo?: AppInfo;
  setupState?: AppSetupState;
  agentStatus?: AgentStatus;
  usage?: AccountUsage;
  bots?: BotSummary[];
  models?: AgentModelOption[];
  snapshots?: Record<string, ConversationSnapshot>;
  browserTabs?: BrowserTab[];
  browserControlState?: BrowserControlState;
  browserPreview?: BrowserPreview | null;
  updateStatus?: UpdateStatus;
  memories?: Record<string, BotMemory[]>;
  routines?: Record<string, Routine[]>;
}

export interface MockLunaBotControls {
  api: LunaBotDesktopApi;
  emitAgentEvent: (event: AgentEvent) => void;
  onLatestConversationOpened: (listener: (botId: string) => void) => () => void;
  readConversationSnapshot: (botId: string) => ConversationSnapshot;
  updateConversationSnapshot: (botId: string, update: (snapshot: ConversationSnapshot) => void) => ConversationSnapshot;
  emitConversationDelta: (
    event: Omit<Extract<AgentEvent, { type: "conversation-delta" }>, "type" | "revision">,
  ) => void;
  setQueueSnapshot: (botId: string, deliveries: QueueDelivery[]) => QueueSnapshot;
  dispose: () => void;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createMockLunaBot(options: MockLunaBotOptions = {}): MockLunaBotControls {
  const appInfo = clone(options.appInfo ?? STORY_APP_INFO);
  let setupState = clone<AppSetupState>(options.setupState ?? { completed: true, preferredProvider: "codex" });
  let dynamicIslandPreference: DynamicIslandPreference = { ...DEFAULT_DYNAMIC_ISLAND_PREFERENCE };
  let dynamicIslandPresentation: DynamicIslandPresentation = { mode: "idle" };
  const agentStatus = clone(options.agentStatus ?? STORY_AGENT_STATUS);
  let bots = clone(options.bots ?? STORY_BOT_SUMMARIES);
  let sidebarLayout: SidebarLayoutSnapshot = {
    revision: 0,
    sections: [],
    order: [SIDEBAR_PEOPLE_SECTION_ID, SIDEBAR_UNASSIGNED_SECTION_ID],
    agentAssignments: {},
    agentOrder: [],
    hiddenAgentIds: [],
  };
  const models = clone(options.models ?? STORY_MODELS);
  const snapshots = clone(options.snapshots ?? STORY_SNAPSHOTS);
  let browserTabs = clone(options.browserTabs ?? STORY_BROWSER_TABS);
  let activeBrowserTabId = browserTabs.at(-1)?.id ?? null;
  const browserControlState = clone(options.browserControlState ?? STORY_BROWSER_CONTROL);
  const browserPreview =
    options.browserPreview === undefined
      ? { dataUrl: browserTakeoverPreviewUrl, width: 960, height: 600 }
      : options.browserPreview;
  let updateStatus = clone(options.updateStatus ?? STORY_UPDATE_STATUS);
  const usage = clone(options.usage ?? STORY_USAGE);
  let agentMemoryLimit: AgentMemoryLimit = 64;
  let claudeCompactWindow: number | null = null;
  let busyMessageMode: BusyMessageMode = DEFAULT_BUSY_MESSAGE_MODE;
  let windowCloseBehavior: WindowCloseBehavior = DEFAULT_WINDOW_CLOSE_BEHAVIOR;
  const approvalPolicies = new Map<string, ApprovalPolicyMode>();
  let botCounter = bots.length;
  let messageCounter = 10;

  const agentListeners = new Set<Listener<AgentEvent>>();
  const browserDisplayListeners = new Set<Listener<{ tabs: BrowserTab[]; activeTabId: string | null }>>();
  const browserPictureInPictureListeners = new Set<Listener<BrowserPictureInPictureEvent>>();
  const updateListeners = new Set<Listener<UpdateStatus>>();
  const attachmentListeners = new Set<Listener<AttachmentImportEvent>>();
  const latestConversationListeners = new Set<Listener<string>>();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const emit = <T>(listeners: Set<Listener<T>>, value: T) => {
    for (const listener of listeners) listener(clone(value));
  };
  const schedule = (callback: () => void, delay = 24) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
  };
  const emptyQueue = (botId: string): QueueSnapshot => ({ botId, deliveries: [] });
  const queues = new Map<string, QueueSnapshot>(bots.map((bot) => [bot.id, emptyQueue(bot.id)]));
  const pins = new Map<string, PinnedMessage[]>();
  const memories = new Map<string, BotMemory[]>(Object.entries(clone(options.memories ?? {})));
  const routines = new Map<string, Routine[]>(Object.entries(clone(options.routines ?? {})));
  const routineRuns = new Map<string, RoutineRun[]>();

  function emitAgentEvent(event: AgentEvent): void {
    emit(agentListeners, event);
  }

  function getSnapshot(botId: string): ConversationSnapshot {
    return (
      snapshots[botId] ?? {
        botId,
        threadId: `thread-${botId}`,
        activeTurnId: null,
        revision: 0,
        messages: [],
      }
    );
  }

  function updateSnapshot(botId: string, update: (snapshot: ConversationSnapshot) => void): void {
    const snapshot = getSnapshot(botId);
    update(snapshot);
    snapshot.revision += 1;
    snapshots[botId] = snapshot;
    emitAgentEvent({ type: "conversation", snapshot });
  }

  function readConversationSnapshot(botId: string): ConversationSnapshot {
    return clone(getSnapshot(botId));
  }

  function updateConversationSnapshot(
    botId: string,
    update: (snapshot: ConversationSnapshot) => void,
  ): ConversationSnapshot {
    updateSnapshot(botId, update);
    return readConversationSnapshot(botId);
  }

  function emitConversationDelta(
    event: Omit<Extract<AgentEvent, { type: "conversation-delta" }>, "type" | "revision">,
  ): void {
    const snapshot = getSnapshot(event.botId);
    snapshot.revision += 1;
    snapshots[event.botId] = snapshot;
    emitAgentEvent({ ...event, type: "conversation-delta", revision: snapshot.revision });
  }

  function setQueueSnapshot(botId: string, deliveries: QueueDelivery[]): QueueSnapshot {
    const snapshot = { botId, deliveries: clone(deliveries) };
    queues.set(botId, snapshot);
    emitAgentEvent({ type: "queue-changed", snapshot });
    return clone(snapshot);
  }

  function createBotSummary(input: Partial<BotSummary> = {}): BotSummary {
    botCounter += 1;
    const id = input.id ?? `mock-agent-${botCounter}`;
    return {
      id,
      provider: input.provider ?? "codex",
      name: input.name ?? "New agent",
      title: input.title ?? "Generalist agent",
      description: input.description ?? "A new agent ready to help with focused work.",
      notifications: input.notifications ?? "all",
      model: input.model ?? "gpt-5.6-luna",
      reasoningEffort: input.reasoningEffort ?? "medium",
      threadId: input.threadId ?? `thread-${id}`,
      workspacePath: input.workspacePath ?? `/mock/LunaBot/Bots/${id}`,
      preview: input.preview ?? "No messages yet",
      updatedAt: input.updatedAt ?? null,
      avatarSeed: input.avatarSeed ?? id,
      avatarHue: input.avatarHue ?? null,
      avatarUrl: input.avatarUrl ?? null,
    };
  }

  const api: LunaBotDesktopApi = {
    getAppInfo: async () => clone(appInfo),
    getSetupState: async () => clone(setupState),
    saveSetup: async ({ preferredProvider }) => {
      setupState = { completed: true, preferredProvider };
      return clone(setupState);
    },
    app: {
      setTheme: async () => undefined,
      setLocale: async () => undefined,
    },
    dynamicIsland: {
      getPreference: async () => clone(dynamicIslandPreference),
      setPreference: async (preference) => {
        dynamicIslandPreference = { ...preference };
        return clone(dynamicIslandPreference);
      },
      publishPresentation: async (presentation) => {
        dynamicIslandPresentation = clone(presentation);
      },
      getPresentation: async () => clone(dynamicIslandPresentation),
      onPreference: () => () => undefined,
      onPresentation: () => () => undefined,
      onGeometry: () => () => undefined,
      performAction: async () => undefined,
      performHaptic: async () => undefined,
      onAction: () => () => undefined,
      setInteractive: async () => undefined,
    },
    getComputerUseMacSetupState: async () => ({
      status: "available",
      helperName: "Codex Computer Use",
      helperIconDataUrl: null,
      message: null,
    }),
    openComputerUsePermissionSetup: async () => ({
      status: "available",
      helperName: "Codex Computer Use",
      helperIconDataUrl: null,
      message: null,
    }),
    startComputerUseHelperDrag: async () => undefined,
    revealComputerUseHelper: async () => undefined,
    closeComputerUsePermissionSetup: async () => undefined,
    openExternal: async () => undefined,
    connectChatGPT: async () => clone(agentStatus),
    connectClaude: async () => clone(agentStatus),
    connectGrok: async () => clone(agentStatus),
    refreshAgentProviders: async () => clone(agentStatus),
    providerRuntimes: {
      getStatus: async () => ({
        revision: 0,
        providers: {
          codex: { phase: "not-downloaded", progress: null, message: null, version: null },
          claude: { phase: "not-downloaded", progress: null, message: null, version: null },
          grok: { phase: "not-downloaded", progress: null, message: null, version: null },
        },
      }),
      download: async () => api.providerRuntimes.getStatus(),
      cancel: async () => api.providerRuntimes.getStatus(),
      onEvent: () => () => undefined,
    },
    openUrl: async () => undefined,
    voice: {
      getModelStatus: async () => ({ phase: "ready", progress: 100, message: null }),
      prepareModel: async () => ({ phase: "ready", progress: 100, message: null }),
      transcribe: async () => ({ text: "Mock voice transcript" }),
      onModelStatus: () => () => undefined,
    },
    agent: {
      getStatus: async () => clone(agentStatus),
      getUsage: async () => clone(usage),
      listModels: async () => clone(models),
      listBots: async () => clone(bots),
      getSidebarLayout: async () => clone(sidebarLayout),
      mutateSidebarLayout: async (action) => {
        sidebarLayout = applySidebarLayoutAction(sidebarLayout, action);
        emitAgentEvent({ type: "sidebar-layout-changed", layout: sidebarLayout });
        return clone(sidebarLayout);
      },
      createBot: async (input) => {
        const bot = createBotSummary({
          name: input.name,
          title: "",
          description: input.description,
          avatarSeed: input.avatarSeed,
          avatarHue: input.avatarHue,
        });
        bots = [...bots, bot];
        queues.set(bot.id, emptyQueue(bot.id));
        emitAgentEvent({ type: "bots-changed", bots });
        try {
          await api.agent.sendMessage({ botId: bot.id, text: input.initialMessage, attachmentDraftIds: [] });
          return clone(bot);
        } catch (error) {
          bots = bots.filter((candidate) => candidate.id !== bot.id);
          queues.delete(bot.id);
          delete snapshots[bot.id];
          emitAgentEvent({ type: "bots-changed", bots });
          throw error;
        }
      },
      duplicateBot: async (botId) => {
        const source = bots.find((bot) => bot.id === botId);
        if (!source) throw new Error("Agent not found");
        const bot = {
          ...createBotSummary({
            ...source,
            id: undefined,
            name: `${source.name} copy`,
            preview: "",
            updatedAt: null,
            workspacePath: undefined,
          }),
          threadId: null,
        };
        bots = [...bots, bot];
        queues.set(bot.id, emptyQueue(bot.id));
        snapshots[bot.id] = {
          botId: bot.id,
          threadId: null,
          messages: [],
          activeTurnId: null,
          revision: 0,
        };
        memories.set(
          bot.id,
          (memories.get(botId) ?? []).map((memory) => ({
            ...memory,
            id: crypto.randomUUID(),
            botId: bot.id,
            sourceTurnId: null,
          })),
        );
        routines.set(
          bot.id,
          (routines.get(botId) ?? []).map((routine) => {
            const routineId = crypto.randomUUID();
            return {
              ...routine,
              id: routineId,
              botId: bot.id,
              trigger: {
                ...routine.trigger,
                id: crypto.randomUUID(),
                routineId,
                nextRunAt: new Date().toISOString(),
              },
            };
          }),
        );
        const sourceSectionId = sidebarLayout.agentAssignments[botId] ?? null;
        const orderWithoutBot = sidebarLayout.agentOrder.filter((agentId) => agentId !== bot.id);
        const sourceIndex = orderWithoutBot.indexOf(botId);
        const beforeAgentId = sourceIndex < 0 ? null : (orderWithoutBot[sourceIndex + 1] ?? null);
        sidebarLayout = applySidebarLayoutAction(sidebarLayout, {
          type: "move-agent",
          agentId: bot.id,
          sectionId: sourceSectionId,
          beforeAgentId,
        });
        emitAgentEvent({ type: "bots-changed", bots });
        emitAgentEvent({ type: "sidebar-layout-changed", layout: sidebarLayout });
        return clone({ bot, layout: sidebarLayout });
      },
      updateBot: async (input: UpdateBotInput) => {
        const current = bots.find((bot) => bot.id === input.botId);
        if (!current) throw new Error("Agent not found");
        const { botId: _botId, ...updates } = input;
        const updated = { ...current, ...updates };
        bots = bots.map((bot) => (bot.id === updated.id ? updated : bot));
        emitAgentEvent({ type: "bots-changed", bots });
        return clone(updated);
      },
      setAvatar: async (input: SetAgentAvatarInput) => {
        const current = bots.find((bot) => bot.id === input.botId);
        if (!current) throw new Error("Agent not found");
        const updated = {
          ...current,
          avatarUrl: input.image ? `mock-avatar://${input.botId}` : null,
        };
        bots = bots.map((bot) => (bot.id === updated.id ? updated : bot));
        emitAgentEvent({ type: "bots-changed", bots });
        return clone(updated);
      },
      deleteBot: async (botId) => {
        bots = bots.filter((bot) => bot.id !== botId);
        queues.delete(botId);
        memories.delete(botId);
        routines.delete(botId);
        emitAgentEvent({ type: "bots-changed", bots });
      },
      exportAgent: async () => false,
      importAgent: async () => null,
      listMemories: async (botId) => clone(memories.get(botId) ?? []),
      createMemory: async (input) => {
        const now = new Date().toISOString();
        const memory: BotMemory = {
          id: crypto.randomUUID(),
          botId: input.botId,
          text: input.text.trim(),
          origin: "manual",
          sourceTurnId: null,
          createdAt: now,
          updatedAt: now,
        };
        memories.set(input.botId, [...(memories.get(input.botId) ?? []), memory]);
        emitAgentEvent({ type: "memories-changed", botId: input.botId });
        return clone(memory);
      },
      updateMemory: async (input) => {
        const current = memories.get(input.botId)?.find((memory) => memory.id === input.memoryId);
        if (!current) throw new Error("Memory not found");
        const updated = { ...current, text: input.text.trim(), updatedAt: new Date().toISOString() };
        memories.set(
          input.botId,
          (memories.get(input.botId) ?? []).map((memory) => (memory.id === input.memoryId ? updated : memory)),
        );
        emitAgentEvent({ type: "memories-changed", botId: input.botId });
        return clone(updated);
      },
      deleteMemory: async (input) => {
        memories.set(
          input.botId,
          (memories.get(input.botId) ?? []).filter((memory) => memory.id !== input.memoryId),
        );
        emitAgentEvent({ type: "memories-changed", botId: input.botId });
      },
      clearMemories: async (botId) => {
        memories.delete(botId);
        emitAgentEvent({ type: "memories-changed", botId });
      },
      listRoutines: async (botId) => clone(routines.get(botId) ?? []),
      createRoutine: async (input) => {
        const now = new Date().toISOString();
        const routineId = crypto.randomUUID();
        const routine: Routine = {
          id: routineId,
          botId: input.botId,
          name: input.name.trim(),
          instruction: input.instruction.trim(),
          active: input.active,
          timezone: input.timezone,
          trigger: {
            id: crypto.randomUUID(),
            routineId,
            schedule: input.schedule,
            nextRunAt: new Date(Date.now() + 3_600_000).toISOString(),
            createdAt: now,
            updatedAt: now,
          },
          createdAt: now,
          updatedAt: now,
        };
        routines.set(input.botId, [routine, ...(routines.get(input.botId) ?? [])]);
        emitAgentEvent({ type: "routines-changed", botId: input.botId });
        return clone(routine);
      },
      updateRoutine: async (input) => {
        const current = routines.get(input.botId)?.find((routine) => routine.id === input.routineId);
        if (!current) throw new Error("Routine not found");
        const updated: Routine = {
          ...current,
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.instruction === undefined ? {} : { instruction: input.instruction.trim() }),
          ...(input.active === undefined ? {} : { active: input.active }),
          ...(input.schedule === undefined
            ? {}
            : {
                trigger: {
                  id: crypto.randomUUID(),
                  routineId: current.id,
                  schedule: input.schedule,
                  nextRunAt: new Date(Date.now() + 3_600_000).toISOString(),
                  createdAt: current.createdAt,
                  updatedAt: new Date().toISOString(),
                },
              }),
          updatedAt: new Date().toISOString(),
        };
        routines.set(
          input.botId,
          (routines.get(input.botId) ?? []).map((routine) => (routine.id === current.id ? updated : routine)),
        );
        emitAgentEvent({ type: "routines-changed", botId: input.botId });
        return clone(updated);
      },
      deleteRoutine: async (input) => {
        routines.set(
          input.botId,
          (routines.get(input.botId) ?? []).filter((routine) => routine.id !== input.routineId),
        );
        emitAgentEvent({ type: "routines-changed", botId: input.botId });
      },
      testRoutine: async (input) => {
        const routine = routines.get(input.botId)?.find((candidate) => candidate.id === input.routineId);
        if (!routine) throw new Error("Routine not found");
        const now = new Date().toISOString();
        const run: RoutineRun = {
          id: crypto.randomUUID(),
          routineId: routine.id,
          botId: input.botId,
          triggerId: null,
          kind: "manual",
          scheduledFor: now,
          routineName: routine.name,
          instruction: routine.instruction,
          deliveryId: crypto.randomUUID(),
          status: "queued",
          error: null,
          createdAt: now,
          updatedAt: now,
        };
        routineRuns.set(routine.id, [run, ...(routineRuns.get(routine.id) ?? [])]);
        emitAgentEvent({ type: "routines-changed", botId: input.botId });
        return clone(run);
      },
      listRoutineRuns: async (input) => clone((routineRuns.get(input.routineId) ?? []).slice(0, input.limit)),
      readConversation: async (botId) => ({
        ...clone(getSnapshot(botId)),
        readState: { unreadCount: 0, firstUnreadMessageId: null, throughMessageId: null },
      }),
      readConversationPage: async (input) => {
        if (!input.anchor || input.anchor.type === "latest") {
          emit(latestConversationListeners, input.botId);
        }
        const snapshot = clone(getSnapshot(input.botId));
        const messages = snapshot.messages.slice(-Math.min(input.limit ?? 50, 100));
        return {
          ...snapshot,
          messages,
          references: {},
          pageInfo: { hasOlder: snapshot.messages.length > messages.length, olderCursor: null },
          readState: { unreadCount: 0, firstUnreadMessageId: null, throughMessageId: null },
        };
      },
      searchConversationMessages: async (input) => {
        const query = input.query.trim().toLocaleLowerCase();
        const results = bots.flatMap((bot) =>
          getSnapshot(bot.id)
            .messages.filter((message) => message.text.toLocaleLowerCase().includes(query))
            .map((message) => ({ botId: bot.id, message: clone(message) })),
        );
        return { results: results.slice(0, input.limit ?? 100), total: results.length, nextCursor: null };
      },
      listConversationReads: async () => ({}),
      markConversationRead: async (input) => ({
        unreadCount: 0,
        firstUnreadMessageId: null,
        throughMessageId: input.throughMessageId,
      }),
      chooseAttachments: async (_input) => [],
      onAttachmentImport: (listener) => {
        attachmentListeners.add(listener);
        return () => attachmentListeners.delete(listener);
      },
      discardDraftAttachment: async () => undefined,
      openAttachment: async (_input: OpenAttachmentInput) => undefined,
      openSharedFile: async (_input: OpenSharedFileInput) => undefined,
      openWorkspaceFile: async (_input: OpenWorkspaceFileInput) => undefined,
      previewSharedFile: async (input: OpenSharedFileInput) => ({
        name: input.path.split("/").at(-1) ?? "shared-file",
        size: 0,
        mimeType: "application/octet-stream",
        previewKind: "none",
        bytes: null,
      }),
      previewWorkspaceFile: async (input: OpenWorkspaceFileInput) => ({
        name: input.path.split("/").at(-1) ?? "workspace-file",
        size: 0,
        mimeType: "application/octet-stream",
        previewKind: "none",
        bytes: null,
      }),
      sendMessage: async (input: SendMessageInput) => {
        const messageId = `mock-message-${messageCounter++}`;
        const deliveryId = `mock-delivery-${messageCounter++}`;
        const turnId = `mock-turn-${messageCounter++}`;
        const createdAt = new Date().toISOString();
        const userMessage: ConversationMessage = {
          id: messageId,
          turnId,
          author: "user",
          source: "user",
          text: input.text,
          createdAt,
          status: "completed",
          replyToMessageId: input.replyToMessageId ?? null,
        };
        const delivery: QueueDelivery = {
          id: deliveryId,
          messageId,
          recipientBotId: input.botId,
          sender: { kind: "user" },
          text: input.text,
          attachments: [],
          replyToMessageId: input.replyToMessageId ?? null,
          status: "running",
          position: null,
          turnId,
          error: null,
          createdAt,
        };
        updateSnapshot(input.botId, (snapshot) => {
          snapshot.activeTurnId = turnId;
          snapshot.messages = [...snapshot.messages, userMessage];
        });
        queues.set(input.botId, { botId: input.botId, deliveries: [delivery] });
        emitAgentEvent({
          type: "queue-changed",
          snapshot: queues.get(input.botId) ?? emptyQueue(input.botId),
        });
        emitAgentEvent({
          type: "turn-started",
          botId: input.botId,
          threadId: getSnapshot(input.botId).threadId ?? `thread-${input.botId}`,
          turnId,
        });

        schedule(() => {
          const assistantMessage: ConversationMessage = {
            id: `mock-reply-${messageCounter++}`,
            turnId,
            author: "assistant",
            source: "assistant",
            text: `Mock reply from ${bots.find((bot) => bot.id === input.botId)?.name ?? "agent"}: I received “${input.text}” and added it to the working context.`,
            createdAt: new Date().toISOString(),
            status: "completed",
          };
          updateSnapshot(input.botId, (snapshot) => {
            snapshot.activeTurnId = null;
            snapshot.messages = [...snapshot.messages, assistantMessage];
          });
          queues.set(input.botId, {
            botId: input.botId,
            deliveries: [{ ...delivery, status: "completed" }],
          });
          emitAgentEvent({
            type: "queue-changed",
            snapshot: queues.get(input.botId) ?? emptyQueue(input.botId),
          });
          emitAgentEvent({
            type: "turn-completed",
            botId: input.botId,
            threadId: getSnapshot(input.botId).threadId ?? `thread-${input.botId}`,
            turnId,
            status: "completed",
          });
        }, 80);

        return {
          messageId,
          deliveries: [{ id: deliveryId, recipientBotId: input.botId, status: "running", position: null }],
        };
      },
      setMessageReaction: async (input: SetMessageReactionInput) => {
        updateSnapshot(input.botId, (snapshot) => {
          const message = snapshot.messages.find((candidate) => candidate.id === input.messageId);
          if (message) {
            message.reaction = input.emoji;
            message.reactions = [
              ...(message.reactions ?? []).filter((reaction) => reaction.actor.kind !== "user"),
              ...(input.emoji ? [{ emoji: input.emoji, actor: { kind: "user" as const } }] : []),
            ];
          }
        });
      },
      listPinnedMessages: async (botId): Promise<PinnedMessagesSnapshot> => ({
        botId,
        pins: clone(pins.get(botId) ?? []),
      }),
      setMessagePinned: async (input: SetMessagePinnedInput): Promise<PinnedMessagesSnapshot> => {
        const current = pins.get(input.botId) ?? [];
        const others = current.filter((pin) => pin.messageId !== input.messageId);
        if (!input.pinned) {
          pins.set(input.botId, others);
        } else {
          const message = getSnapshot(input.botId).messages.find((candidate) => candidate.id === input.messageId);
          if (
            message &&
            !current.some((pin) => pin.messageId === input.messageId) &&
            current.length < MESSAGE_PINS_LIMIT
          ) {
            const text = Array.from(message.text.trim()).slice(0, MESSAGE_PIN_TEXT_LIMIT).join("");
            pins.set(input.botId, [
              { messageId: input.messageId, text, pinnedAt: new Date().toISOString() },
              ...current,
            ]);
          }
        }
        return { botId: input.botId, pins: clone(pins.get(input.botId) ?? []) };
      },
      listQueue: async (botId) => clone(queues.get(botId) ?? emptyQueue(botId)),
      acknowledgeFailedTurn: async () => undefined,
      cancelQueuedMessage: async (input) => {
        const queue = queues.get(input.botId) ?? emptyQueue(input.botId);
        queue.deliveries = queue.deliveries.map((delivery) =>
          delivery.id === input.deliveryId ? { ...delivery, status: "cancelled" } : delivery,
        );
        queues.set(input.botId, queue);
        emitAgentEvent({ type: "queue-changed", snapshot: queue });
      },
      steerQueuedMessage: async (input: SteerQueuedMessageInput) => {
        const queue = queues.get(input.botId) ?? emptyQueue(input.botId);
        queue.deliveries = queue.deliveries.map((delivery) =>
          delivery.id === input.deliveryId
            ? { ...delivery, status: "running", turnId: input.expectedTurnId, position: null }
            : delivery,
        );
        queues.set(input.botId, queue);
        emitAgentEvent({ type: "queue-changed", snapshot: queue });
      },
      updateQueuedMessage: async (input: UpdateQueuedMessageInput) => {
        const queue = queues.get(input.botId) ?? emptyQueue(input.botId);
        queue.deliveries = queue.deliveries.map((delivery) =>
          delivery.id === input.deliveryId ? { ...delivery, text: input.text } : delivery,
        );
        queues.set(input.botId, queue);
        emitAgentEvent({ type: "queue-changed", snapshot: queue });
      },
      reorderQueue: async (input: ReorderQueueInput) => {
        const queue = queues.get(input.botId) ?? emptyQueue(input.botId);
        const byId = new Map(queue.deliveries.map((delivery) => [delivery.id, delivery]));
        queue.deliveries = input.deliveryIds.flatMap((deliveryId, index) => {
          const delivery = byId.get(deliveryId);
          return delivery ? [{ ...delivery, position: index + 1 }] : [];
        });
        queues.set(input.botId, queue);
        emitAgentEvent({ type: "queue-changed", snapshot: queue });
      },
      interrupt: async (input) => {
        emitAgentEvent({
          type: "turn-completed",
          botId: input.botId,
          threadId: getSnapshot(input.botId).threadId ?? `thread-${input.botId}`,
          turnId: input.turnId,
          status: "interrupted",
        });
      },
      respondToPrompt: async (_input: RespondToPromptInput) => undefined,
      respondToApproval: async () => undefined,
      respondToBrowserTakeover: async () => undefined,
      onEvent: (listener) => {
        agentListeners.add(listener);
        return () => agentListeners.delete(listener);
      },
    },
    browser: {
      open: async (input: BrowserOpenInput) => {
        const tab: BrowserTab = {
          id: `browser-tab-${browserTabs.length + 1}`,
          title: input.url,
          url: input.url,
          loading: false,
          ownerThreadId: input.ownerThreadId ?? null,
          ownerBotId: input.ownerBotId ?? null,
        };
        browserTabs = [...browserTabs, tab];
        activeBrowserTabId = tab.id;
        emit(browserDisplayListeners, { tabs: browserTabs, activeTabId: tab.id });
        emitAgentEvent({ type: "browser-changed", tabs: browserTabs, activeTabId: tab.id });
        return clone(tab);
      },
      activate: async (tabId) => {
        activeBrowserTabId = tabId;
        emit(browserDisplayListeners, { tabs: browserTabs, activeTabId: activeBrowserTabId });
      },
      navigate: async () => undefined,
      reload: async () => undefined,
      close: async (tabId) => {
        browserTabs = browserTabs.filter((tab) => tab.id !== tabId);
        activeBrowserTabId = browserTabs[0]?.id ?? null;
        emit(browserDisplayListeners, { tabs: browserTabs, activeTabId: activeBrowserTabId });
        emitAgentEvent({
          type: "browser-changed",
          tabs: browserTabs,
          activeTabId: activeBrowserTabId,
        });
      },
      listTabs: async () => clone(browserTabs),
      getDisplayState: async () => ({ tabs: clone(browserTabs), activeTabId: activeBrowserTabId }),
      getControlState: async () => clone(browserControlState),
      capturePreview: async () => {
        if (!browserPreview) throw new Error("Browser preview is unavailable.");
        return clone(browserPreview);
      },
      setVisible: async () => undefined,
      onDisplayState: (listener) => {
        browserDisplayListeners.add(listener);
        return () => browserDisplayListeners.delete(listener);
      },
      openPictureInPicture: async (bounds) => bounds ?? { x: 16, y: 16, width: 420, height: 300 },
      closePictureInPicture: async () => undefined,
      dockPictureInPicture: async () => {
        emit(browserPictureInPictureListeners, { type: "dock" });
      },
      hidePictureInPicture: async () => {
        emit(browserPictureInPictureListeners, { type: "hide" });
      },
      onPictureInPictureEvent: (listener) => {
        browserPictureInPictureListeners.add(listener);
        return () => browserPictureInPictureListeners.delete(listener);
      },
    },
    update: {
      getStatus: async () => clone(updateStatus),
      check: async () => {
        updateStatus = { ...updateStatus, phase: "up-to-date", availableVersion: null };
        emit(updateListeners, updateStatus);
        return clone(updateStatus);
      },
      download: async () => {
        updateStatus = { ...updateStatus, phase: "downloading", progress: 0 };
        emit(updateListeners, updateStatus);
        const downloadSteps = [
          { delay: 350, expectedPhase: "downloading", phase: "downloading", progress: 28 },
          { delay: 700, expectedPhase: "downloading", phase: "downloading", progress: 64 },
          { delay: 1_050, expectedPhase: "downloading", phase: "ready", progress: 100 },
        ] as const;
        for (const step of downloadSteps) {
          schedule(() => {
            if (updateStatus.phase !== step.expectedPhase) return;
            updateStatus = { ...updateStatus, phase: step.phase, progress: step.progress };
            emit(updateListeners, updateStatus);
          }, step.delay);
        }
        return clone(updateStatus);
      },
      install: async () => {
        updateStatus = { ...updateStatus, phase: "installing" };
        emit(updateListeners, updateStatus);
      },
      getPreference: async () => ({ autoDownload: true }),
      setPreference: async (input) => ({ ...input }),
      onEvent: (listener) => {
        updateListeners.add(listener);
        return () => updateListeners.delete(listener);
      },
    },
    agentPreferences: {
      getMemoryLimit: async () => agentMemoryLimit,
      setMemoryLimit: async (limit) => {
        agentMemoryLimit = limit;
        return agentMemoryLimit;
      },
      getClaudeCompactWindow: async () => claudeCompactWindow,
      setClaudeCompactWindow: async (tokens) => {
        claudeCompactWindow = tokens;
        return claudeCompactWindow;
      },
      getBusyMessageMode: async () => busyMessageMode,
      setBusyMessageMode: async (mode) => {
        busyMessageMode = mode;
        return busyMessageMode;
      },
      getWindowCloseBehavior: async () => windowCloseBehavior,
      setWindowCloseBehavior: async (behavior) => {
        windowCloseBehavior = behavior;
        return windowCloseBehavior;
      },
      getApprovalPolicy: async (botId) => approvalPolicies.get(botId) ?? DEFAULT_APPROVAL_POLICY_MODE,
      setApprovalPolicy: async ({ botId, mode }) => {
        approvalPolicies.set(botId, mode);
        return mode;
      },
    },
    maintenance: {
      exportData: async () => ({ saved: true }),
      exportDiagnostics: async () => ({ saved: true }),
    },
  };

  return {
    api,
    emitAgentEvent,
    onLatestConversationOpened: (listener) => {
      latestConversationListeners.add(listener);
      return () => latestConversationListeners.delete(listener);
    },
    readConversationSnapshot,
    updateConversationSnapshot,
    emitConversationDelta,
    setQueueSnapshot,
    dispose: () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      agentListeners.clear();
      updateListeners.clear();
      attachmentListeners.clear();
      latestConversationListeners.clear();
      void appInfo;
    },
  };
}

function applySidebarLayoutAction(layout: SidebarLayoutSnapshot, action: SidebarLayoutAction): SidebarLayoutSnapshot {
  const revision = layout.revision + 1;
  if (action.type === "hide-agent") {
    if (layout.hiddenAgentIds.includes(action.agentId)) return layout;
    return { ...layout, revision, hiddenAgentIds: [...layout.hiddenAgentIds, action.agentId] };
  }
  if (action.type === "show-agent") {
    return {
      ...layout,
      revision,
      hiddenAgentIds: layout.hiddenAgentIds.filter((agentId) => agentId !== action.agentId),
    };
  }
  if (action.type === "create") {
    const id = crypto.randomUUID();
    return {
      ...layout,
      revision,
      sections: [...layout.sections, { id, name: action.name.trim() }],
      order: [...layout.order, id],
      agentAssignments: action.agentId
        ? { ...layout.agentAssignments, [action.agentId]: id }
        : { ...layout.agentAssignments },
      agentOrder: [...layout.agentOrder],
    };
  }
  if (action.type === "rename") {
    return {
      ...layout,
      revision,
      sections: layout.sections.map((section) =>
        section.id === action.sectionId ? { ...section, name: action.name.trim() } : section,
      ),
    };
  }
  if (action.type === "delete") {
    return {
      ...layout,
      revision,
      sections: layout.sections.filter((section) => section.id !== action.sectionId),
      order: layout.order.filter((sectionId) => sectionId !== action.sectionId),
      agentAssignments: Object.fromEntries(
        Object.entries(layout.agentAssignments).filter(([, sectionId]) => sectionId !== action.sectionId),
      ),
      agentOrder: [...layout.agentOrder],
    };
  }
  if (action.type === "move") {
    const order = [...layout.order];
    const index = order.indexOf(action.sectionId);
    const target = index + (action.direction === "up" ? -1 : 1) * (action.steps ?? 1);
    if (index >= 0 && target >= 0 && target < order.length) {
      const [movedSectionId] = order.splice(index, 1);
      if (movedSectionId) order.splice(target, 0, movedSectionId);
    }
    return { ...layout, revision, order };
  }
  if (action.type === "move-agent") {
    const agentOrder = layout.agentOrder.filter((agentId) => agentId !== action.agentId);
    const insertionIndex = action.beforeAgentId === null ? agentOrder.length : agentOrder.indexOf(action.beforeAgentId);
    agentOrder.splice(insertionIndex < 0 ? agentOrder.length : insertionIndex, 0, action.agentId);
    const agentAssignments = { ...layout.agentAssignments };
    if (action.sectionId === null) delete agentAssignments[action.agentId];
    else agentAssignments[action.agentId] = action.sectionId;
    return { ...layout, revision, agentAssignments, agentOrder };
  }
  const agentAssignments = { ...layout.agentAssignments };
  if (action.sectionId === null) delete agentAssignments[action.agentId];
  else agentAssignments[action.agentId] = action.sectionId;
  return { ...layout, revision, agentAssignments };
}
