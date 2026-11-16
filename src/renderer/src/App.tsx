import type {
  AccountUsage,
  AgentApproval,
  AgentBackgroundTask,
  AgentEvent,
  AgentModelOption,
  AgentProviderId,
  AgentRuntimeSnapshot,
  AgentStatus,
  AppInfo,
  AppSetupState,
  AvatarImageInput,
  BotSummary,
  BrowserControlState,
  BrowserTab,
  ConversationPage,
  ConversationPageInfo,
  ConversationReadState,
  ConversationSnapshot,
  DynamicIslandAction,
  ProviderRuntimeSnapshot,
  QueueSnapshot,
  RoomRequest,
  SidebarLayoutAction,
  SidebarLayoutSnapshot,
  UpdateBotInput,
  UpdateStatus,
} from "@lunabot/contracts/ipc";
import {
  ROOM_REQUEST_NOTICE_ITEM_TYPE_PREFIX,
  ROUTINE_EVENT_ITEM_TYPE_PREFIX,
  ROUTINE_RUN_EVENT_ITEM_TYPE_PREFIX,
} from "@lunabot/contracts/ipc";
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createStore,
  flush,
  onCleanup,
  onSettled,
  type ParentProps,
  useContext,
} from "solid-js";
import { AppView } from "./AppView";
import { cleanAgentMessageText } from "./agent-message-text";
import {
  botMessagesEqual,
  botProfilesEqual,
  formatTime,
  readStateForMessages,
  retainThinkingMessages,
  toBotMessage,
  toBotMessages,
  toBotProfile,
  withoutBot,
} from "./app-message-projection";
import { DEFAULT_GENERAL_SETTINGS, type GeneralSettingsValue } from "./app-settings";
import { isAppSettingsShortcut } from "./app-settings-shortcut";
import { playCompletionSoundForAgentEvent } from "./completion-sound";
import { createFirstBotDraft, type FirstBotDraft } from "./components/FirstBotSetup";
import { readPanelWidth } from "./components/PanelResizer";
import { roomIdOfBot, roomManager } from "./components/rooms/room-model";
import { createRoomsStore } from "./components/rooms/rooms-store";
import type { SidebarAgentState } from "./components/Sidebar";
import { Toaster, toast } from "./components/ui";
import type { BotMessage, BotProfile } from "./data";
import { DynamicIslandCoordinator, reconcileQueuesWithRuntimeWork } from "./dynamic-island-coordinator";
import { t } from "./i18n";
import { fallbackDesktopPlatform, platformLayout } from "./platform-layout";
import {
  MAX_SIDEBAR_PINNED_ITEMS,
  normalizeSidebarPinnedItems,
  readSidebarPins,
  type SidebarPinnedItem,
  sidebarPinnedItemKey,
  writeSidebarPins,
} from "./sidebar-pins";
import {
  defaultSidebarLayout,
  readSidebarCollapsed,
  splitHiddenAgents,
  writeSidebarCollapsed,
} from "./sidebar-sections";

const FALLBACK_STATUS: AgentStatus = {
  phase: "starting",
  cliVersion: null,
  auth: { kind: "unknown" },
  providers: [
    { id: "codex", state: "not-started", version: null, message: null },
    { id: "claude", state: "not-started", version: null, message: null },
    { id: "grok", state: "not-started", version: null, message: null },
  ],
  capabilities: {
    chat: "unavailable",
    browser: "unavailable",
    computerUse: "unavailable",
  },
  get message() {
    return t("misc.app.starting");
  },
  fullAccess: true,
};

const FALLBACK_UPDATE_STATUS: UpdateStatus = {
  phase: "unsupported",
  currentVersion: "",
  availableVersion: null,
  progress: null,
  checkedAt: null,
  message: null,
  errorCode: null,
};
const FALLBACK_PROVIDER_RUNTIMES: ProviderRuntimeSnapshot = {
  revision: -1,
  providers: {
    codex: { phase: "not-downloaded", progress: null, message: null, version: null },
    claude: { phase: "not-downloaded", progress: null, message: null, version: null },
    grok: { phase: "not-downloaded", progress: null, message: null, version: null },
  },
};
type PromptEvent = Extract<AgentEvent, { type: "prompt" }>;
type BrowserTakeoverEvent = Extract<AgentEvent, { type: "browser-takeover-requested" }>;

// Routine events and room request notes show in the chat, but they are not new messages to read.
function isEventNoteItem(message: { itemType?: string }): boolean {
  return (
    message.itemType?.startsWith(ROUTINE_EVENT_ITEM_TYPE_PREFIX) === true ||
    message.itemType?.startsWith(ROUTINE_RUN_EVENT_ITEM_TYPE_PREFIX) === true ||
    message.itemType?.startsWith(ROOM_REQUEST_NOTICE_ITEM_TYPE_PREFIX) === true
  );
}

function preserveKnownAgentUnread(
  state: ConversationReadState,
  boundary: string | null,
  messages: BotMessage[],
): ConversationReadState {
  const throughMessageId = state.throughMessageId ?? boundary;
  const throughIndex = throughMessageId ? messages.findIndex((message) => message.id === throughMessageId) : -1;
  if (throughMessageId && throughIndex < 0) return state;
  const unread = messages
    .slice(throughIndex + 1)
    .filter(
      (message) =>
        message.author !== "you" &&
        message.itemType !== "commentary" &&
        message.itemType !== "agent_attachment" &&
        !isEventNoteItem(message) &&
        !message.id.startsWith("thinking:") &&
        !message.id.startsWith("ui-"),
    );
  if (unread.length <= state.unreadCount) return state;
  return {
    ...state,
    unreadCount: unread.length,
    firstUnreadMessageId: unread[0]?.id ?? null,
  };
}

function promptRequestKey(turnId: string | undefined, requestId: string | number | undefined): string | null {
  if (!turnId || requestId === undefined) return null;
  return JSON.stringify([turnId, String(requestId)]);
}

function messagePromptRequestKey(message: {
  turnId?: string;
  questionPrompt?: { requestId: string | number };
}): string | null {
  return promptRequestKey(message.turnId, message.questionPrompt?.requestId);
}

const LEFT_PANEL_STORAGE_KEY = "lunabot:left-panel-width";
const LEFT_PANEL_COLLAPSED_STORAGE_KEY = "lunabot:left-panel-collapsed";
const LEFT_PANEL_DEFAULT = 280;
const LEFT_PANEL_MIN = 240;
const LEFT_PANEL_MAX = 400;
const LEFT_PANEL_COMPACT = 64;
const LEFT_PANEL_COLLAPSE_THRESHOLD = 210;
const LEFT_PANEL_EXPAND_THRESHOLD = 220;
const LEFT_PANEL_NARROW_WINDOW = 960;

// A saved choice wins. Without one, a narrow window starts with the sidebar collapsed.
function readLeftPanelCollapsed(): boolean {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(LEFT_PANEL_COLLAPSED_STORAGE_KEY);
  } catch {
    // Storage unavailable: fall back to the window width.
  }
  return stored === null ? window.innerWidth < LEFT_PANEL_NARROW_WINDOW : stored === "true";
}
const CONVERSATION_MIN_WIDTH = 424;

type StoredValue = BotProfile | BotMessage;
type StoredSetter = (value: StoredValue) => void;

const storeSetters = new WeakMap<object, StoredSetter>();

function isBotProfile(value: StoredValue): value is BotProfile {
  return "avatarSeed" in value;
}

function createStoredProfile(value: BotProfile): BotProfile {
  const initial = Object.assign({}, value);
  const [store, setStore] = createStore(initial);
  storeSetters.set(store, (next) => {
    if (isBotProfile(next)) setStore(() => next);
  });
  return store;
}

function createStoredMessage(value: BotMessage): BotMessage {
  const initial = Object.assign({}, value);
  const [store, setStore] = createStore(initial);
  storeSetters.set(store, (next) => {
    if (!isBotProfile(next)) setStore(() => next);
  });
  return store;
}

function updateStored(store: StoredValue, value: StoredValue): void {
  storeSetters.get(store)?.(value);
}

function agentMessageKey(botId: string, messageId: string): string {
  return `${botId}\0${messageId}`;
}

function deleteAgentMessageBodies(messages: Map<string, string>, botId: string): void {
  const prefix = `${botId}\0`;
  for (const key of messages.keys()) {
    if (key.startsWith(prefix)) messages.delete(key);
  }
}

export function createBotInitialMessage(draft: Pick<FirstBotDraft, "purpose">): string {
  return t("onboarding.bot.initialMessage", { purpose: draft.purpose.trim() });
}

interface AppProps {
  landingPreview?: boolean;
}

export function createAppController(props: AppProps = {}) {
  const [botList, setBotList] = createSignal<BotProfile[]>([]);
  const [duplicatingBotIds, setDuplicatingBotIds] = createSignal<Set<string>>(new Set());
  const [modelOptions, setModelOptions] = createSignal<AgentModelOption[]>([]);
  const [activeBotId, setActiveBotId] = createSignal("");
  const [appFocused, setAppFocused] = createSignal(document.hasFocus());
  const [agentChatOpenRevision, setAgentChatOpenRevision] = createSignal(0);
  const [liveMessages, setLiveMessages] = createSignal<Record<string, BotMessage[]>>({});
  const [uiErrors, setUiErrors] = createSignal<Record<string, BotMessage[]>>({});
  const [conversationLoaded, setConversationLoaded] = createSignal<Record<string, boolean>>({});
  const [conversationRevisions, setConversationRevisions] = createSignal<Record<string, number>>({});
  const [conversationPages, setConversationPages] = createSignal<Record<string, ConversationPageInfo>>({});
  const [conversationWindowModes, setConversationWindowModes] = createSignal<Record<string, "latest" | "around">>({});
  const [conversationReferences, setConversationReferences] = createSignal<Record<string, Record<string, BotMessage>>>(
    {},
  );
  const rawAgentMessageBodies = new Map<string, string>();
  const [conversationOlderLoading, setConversationOlderLoading] = createSignal<Record<string, boolean>>({});
  const [conversationOlderErrors, setConversationOlderErrors] = createSignal<Record<string, string | null>>({});
  const [activeTurns, setActiveTurns] = createSignal<Record<string, string | null>>({});
  const [backgroundTasks, setBackgroundTasks] = createSignal<Record<string, AgentBackgroundTask[]>>({});
  const [failedTurns, setFailedTurns] = createSignal<Record<string, string | undefined>>({});
  const [unreadReplies, setUnreadReplies] = createSignal<Record<string, number>>({});
  const [conversationReads, setConversationReads] = createSignal<Record<string, ConversationReadState>>({});
  const [recentReplies, setRecentReplies] = createSignal<Record<string, boolean>>({});
  const [queues, setQueues] = createSignal<Record<string, QueueSnapshot>>({});
  const [routineIdsByConversation, setRoutineIdsByConversation] = createSignal<Record<string, string[] | undefined>>(
    {},
  );
  const [browserTabs, setBrowserTabs] = createSignal<BrowserTab[]>([]);
  const [activeBrowserTabId, setActiveBrowserTabId] = createSignal<string | null>(null);
  const [browserVisibilitySuspended] = createSignal(false);
  let browserChangeRevision = 0;
  const [browserControlState, setBrowserControlState] = createSignal<BrowserControlState>({
    sessions: [],
  });
  const [botSetupOpen, setBotSetupOpen] = createSignal(false);
  const [botSetupDraft, setBotSetupDraft] = createSignal<FirstBotDraft>(createFirstBotDraft());
  const [botSetupError, setBotSetupError] = createSignal<string | null>(null);
  const [creatingAgent, setCreatingAgent] = createSignal(false);
  const roomsStore = createRoomsStore();
  onCleanup(roomsStore.start());
  const [settingsRequest, setSettingsRequest] = createSignal<{
    botId: string;
    nonce: number;
  } | null>(null);
  const [pendingPrompts, setPendingPrompts] = createSignal<
    Record<string, PromptEvent | BrowserTakeoverEvent | undefined>
  >({});
  const [presentedPromptResolutions, setPresentedPromptResolutions] = createSignal<Record<string, string | undefined>>(
    {},
  );
  const [submittedPromptRequests, setSubmittedPromptRequests] = createSignal<Record<string, string | undefined>>({});
  const [pendingApprovals, setPendingApprovals] = createSignal<Record<string, AgentApproval | undefined>>({});
  const [appInfo, setAppInfo] = createSignal<AppInfo | null>(null);
  const [agentStatus, setAgentStatus] = createSignal<AgentStatus>(FALLBACK_STATUS);
  const [accountUsage, setAccountUsage] = createSignal<AccountUsage | null>(null);
  const [updateStatus, setUpdateStatus] = createSignal<UpdateStatus>(FALLBACK_UPDATE_STATUS);
  const [providerRuntimeSnapshot, setProviderRuntimeSnapshot] =
    createSignal<ProviderRuntimeSnapshot>(FALLBACK_PROVIDER_RUNTIMES);
  const [leftPanelWidth, setLeftPanelWidth] = createSignal(
    readPanelWidth(LEFT_PANEL_STORAGE_KEY, LEFT_PANEL_DEFAULT, LEFT_PANEL_MIN, LEFT_PANEL_MAX),
  );
  const [leftPanelCollapsed, setLeftPanelCollapsed] = createSignal(readLeftPanelCollapsed());
  const [leftPanelAutoCompact, setLeftPanelAutoCompact] = createSignal(false);
  const [sidebarPins, setSidebarPins] = createSignal<SidebarPinnedItem[]>(readSidebarPins());
  const [sidebarLayout, setSidebarLayout] = createSignal<SidebarLayoutSnapshot>(defaultSidebarLayout());
  const [sidebarCollapsedSectionIds, setSidebarCollapsedSectionIds] = createSignal<string[]>(readSidebarCollapsed());
  const [setupState, setSetupState] = createSignal<AppSetupState | null>(null);
  const [permissionsOpen, setPermissionsOpen] = createSignal(false);
  const [appSettingsOpen, setAppSettingsOpen] = createSignal(false);
  const [generalSettings, setGeneralSettings] = createSignal<GeneralSettingsValue>(DEFAULT_GENERAL_SETTINGS);
  const [globalSearchOpen, setGlobalSearchOpen] = createSignal(false);
  const [messageFocusRequest, setMessageFocusRequest] = createSignal<{
    botId: string;
    messageId: string;
    nonce: number;
  } | null>(null);
  const pendingConversationSnapshots = new Map<string, ConversationSnapshot>();
  const agentChatsToMarkRead = new Set<string>();
  const agentChatsRetriedOnOpen = new Set<string>();
  let explicitlyOpenedAgentChatId: string | null = null;
  const autoReadAgentMessages = new Map<
    string,
    | { messageId: string; status: "pending"; optimisticState: ConversationReadState | null }
    | { messageId: string; status: "succeeded"; state: ConversationReadState }
  >();
  const agentChatsToRetryRead = new Set<string>();
  const conversationPageRequests = new Map<string, number>();
  const conversationReadOperations = new Map<string, Promise<void>>();
  const browserTabActivationOperations = new Map<string, Promise<void>>();
  const queueSnapshotRequests = new Map<string, number>();
  const routineSnapshotRequests = new Map<string, number>();
  const completedTurnByBot = new Map<string, string>();
  const dynamicIslandCoordinator = new DynamicIslandCoordinator();
  let conversationFrame: number | undefined;
  let dynamicIslandPresentationScheduled = false;
  let appSettingsRestoreTarget: HTMLElement | null = null;
  let autoDownloadUpdatesChanged = false;

  function updateGeneralSettings(value: GeneralSettingsValue): void {
    const previous = generalSettings();
    setGeneralSettings(value);
    if (previous.autoDownloadUpdates !== value.autoDownloadUpdates) {
      autoDownloadUpdatesChanged = true;
      void window.lunabot.update
        .setPreference({ autoDownload: value.autoDownloadUpdates })
        .then((preference) =>
          setGeneralSettings((current) => ({ ...current, autoDownloadUpdates: preference.autoDownload })),
        )
        .catch(() =>
          setGeneralSettings((current) => ({ ...current, autoDownloadUpdates: previous.autoDownloadUpdates })),
        );
    }
    if (previous.agentMemoryLimit !== value.agentMemoryLimit) {
      void window.lunabot.agentPreferences
        .setMemoryLimit(value.agentMemoryLimit)
        .then((limit) => setGeneralSettings((current) => ({ ...current, agentMemoryLimit: limit })))
        .catch(() => setGeneralSettings((current) => ({ ...current, agentMemoryLimit: previous.agentMemoryLimit })));
    }
    if (previous.claudeCompactWindow !== value.claudeCompactWindow) {
      void window.lunabot.agentPreferences
        .setClaudeCompactWindow(value.claudeCompactWindow)
        .then((tokens) => setGeneralSettings((current) => ({ ...current, claudeCompactWindow: tokens })))
        .catch(() =>
          setGeneralSettings((current) => ({ ...current, claudeCompactWindow: previous.claudeCompactWindow })),
        );
    }
    if (previous.busyMessageMode !== value.busyMessageMode) {
      void window.lunabot.agentPreferences
        .setBusyMessageMode(value.busyMessageMode)
        .then((mode) => setGeneralSettings((current) => ({ ...current, busyMessageMode: mode })))
        .catch(() => setGeneralSettings((current) => ({ ...current, busyMessageMode: previous.busyMessageMode })));
    }
    if (previous.windowCloseBehavior !== value.windowCloseBehavior) {
      void window.lunabot.agentPreferences
        .setWindowCloseBehavior(value.windowCloseBehavior)
        .then((behavior) => setGeneralSettings((current) => ({ ...current, windowCloseBehavior: behavior })))
        .catch(() =>
          setGeneralSettings((current) => ({ ...current, windowCloseBehavior: previous.windowCloseBehavior })),
        );
    }
    if (
      previous.macBookNotch !== value.macBookNotch ||
      previous.macBookNotchHaptics !== value.macBookNotchHaptics ||
      previous.macBookNotchIdle !== value.macBookNotchIdle ||
      previous.macBookNotchAdditionalDisplays !== value.macBookNotchAdditionalDisplays
    ) {
      void window.lunabot.dynamicIsland
        .setPreference({
          enabled: value.macBookNotch,
          hapticsEnabled: value.macBookNotchHaptics,
          idleVisible: value.macBookNotchIdle,
          additionalDisplaysEnabled: value.macBookNotchAdditionalDisplays,
        })
        .then((preference) =>
          setGeneralSettings((current) => ({
            ...current,
            macBookNotch: preference.enabled,
            macBookNotchHaptics: preference.hapticsEnabled,
            macBookNotchIdle: preference.idleVisible,
            macBookNotchAdditionalDisplays: preference.additionalDisplaysEnabled,
          })),
        )
        .catch(() =>
          setGeneralSettings((current) => ({
            ...current,
            macBookNotch: previous.macBookNotch,
            macBookNotchHaptics: previous.macBookNotchHaptics,
            macBookNotchIdle: previous.macBookNotchIdle,
            macBookNotchAdditionalDisplays: previous.macBookNotchAdditionalDisplays,
          })),
        );
    }
  }

  const leftPanelCompact = createMemo(() => leftPanelCollapsed() || leftPanelAutoCompact());

  function shouldAutoCompactSidebar(panelWidth: number) {
    return window.innerWidth - panelWidth < CONVERSATION_MIN_WIDTH;
  }

  function updateResponsiveSidebar(): void {
    setLeftPanelAutoCompact(shouldAutoCompactSidebar(leftPanelWidth()));
  }

  createEffect(
    () => leftPanelWidth(),
    (panelWidth) => {
      setLeftPanelAutoCompact(shouldAutoCompactSidebar(panelWidth));
    },
  );

  onSettled(() => {
    window.addEventListener("resize", updateResponsiveSidebar);
    return () => window.removeEventListener("resize", updateResponsiveSidebar);
  });

  // Room bots never appear in botList, so a room's manager is resolved from the room's own profiles.
  const [roomRequestCreation, setRoomRequestCreation] = createSignal<{ requestId: string; roomId: string } | null>(
    null,
  );
  const selectedRoomManagerId = createMemo(() => {
    const roomId = roomsStore.selectedRoomId();
    const room = roomId ? roomsStore.rooms().find((item) => item.id === roomId) : undefined;
    return room ? (roomManager(room)?.botId ?? null) : null;
  });
  const roomManagerProfile = createMemo(() => {
    const roomId = roomsStore.selectedRoomId();
    const managerId = selectedRoomManagerId();
    if (!roomId || !managerId) return undefined;
    const stored = roomsStore.profiles(roomId).find((bot) => bot.id === managerId);
    return stored ? toBotProfile(stored) : undefined;
  });
  // A room shows only the manager's conversation, but any active member can ask the user to take over the browser
  // (for a login, say). That request has to reach the room's screen, so look at the whole room, not only the manager.
  const browserTakeoverBotId = createMemo(() => {
    const prompts = pendingPrompts();
    const candidates = [activeBotId()];
    const roomId = roomsStore.selectedRoomId();
    const room = roomId ? roomsStore.rooms().find((item) => item.id === roomId) : undefined;
    for (const member of room?.members ?? []) if (member.status === "active") candidates.push(member.botId);
    return candidates.find((botId) => prompts[botId]?.type === "browser-takeover-requested");
  });
  // The shared conversation loads and sends through activeBotId, so it follows the room's manager.
  createEffect(
    () => ({ managerId: selectedRoomManagerId(), currentId: activeBotId() }),
    ({ managerId }) => {
      if (managerId && activeBotId() !== managerId) setActiveBotId(managerId);
    },
  );

  const activeBot = createMemo(() => {
    if (roomsStore.selectedRoomId()) return roomManagerProfile();
    return botList().find((bot) => bot.id === activeBotId()) ?? botList()[0];
  });
  const activeMessages = createMemo(() => {
    const bot = activeBot();
    if (!bot) return [];
    const prompt = pendingPrompts()[bot.id];
    const requestKey = prompt?.type === "prompt" ? promptRequestKey(prompt.turnId, prompt.requestId) : null;
    const messages = (liveMessages()[bot.id] ?? []).filter(
      (message) =>
        message.questionPrompt?.resolution !== null && (!requestKey || messagePromptRequestKey(message) !== requestKey),
    );
    return [...messages, ...(uiErrors()[bot.id] ?? [])];
  });

  onSettled(() => {
    const unsubscribe = window.lunabot.agent.onEvent((event) => {
      flush(() => handleAgentEvent(event));
    });
    const unsubscribeUpdate = window.lunabot.update.onEvent((status) => {
      flush(() => setUpdateStatus(status));
    });
    const unsubscribeProviderRuntimes =
      window.lunabot.providerRuntimes?.onEvent((snapshot) => {
        flush(() => applyProviderRuntimeSnapshot(snapshot));
      }) ?? (() => undefined);
    const handleGlobalSearchShortcut = (event: KeyboardEvent) => {
      if (
        event.key.toLocaleLowerCase() !== "k" ||
        (!event.metaKey && !event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        setupState()?.completed !== true
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      setGlobalSearchVisibility(!globalSearchOpen());
    };
    window.addEventListener("keydown", handleGlobalSearchShortcut);
    const handleAppSettingsShortcut = (event: KeyboardEvent) => {
      const macOS = platformLayout(appInfo()?.platform ?? fallbackDesktopPlatform()).macOSChrome;
      if (!isAppSettingsShortcut(event, macOS) || setupState()?.completed !== true || appSettingsOpen()) return;
      event.preventDefault();
      openAppSettings(null);
    };
    window.addEventListener("keydown", handleAppSettingsShortcut);
    const handleWindowBlur = () => flush(() => setAppFocused(false));
    const handleWindowFocus = () => {
      flush(() => {
        setAppFocused(true);
        setRecentReplies({});
        const botId = activeBot()?.id;
        if (botId && isAgentChatOpen(botId) && (conversationReads()[botId]?.unreadCount ?? 0) > 0) {
          agentChatsToMarkRead.add(botId);
          agentChatsRetriedOnOpen.delete(botId);
          setAgentChatOpenRevision((current) => current + 1);
        }
      });
    };
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    const cleanup = () => {
      unsubscribe();
      unsubscribeUpdate();
      unsubscribeProviderRuntimes();
      window.removeEventListener("keydown", handleGlobalSearchShortcut);
      window.removeEventListener("keydown", handleAppSettingsShortcut);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      if (conversationFrame !== undefined) cancelAnimationFrame(conversationFrame);
      completedTurnByBot.clear();
    };
    void window.lunabot.update
      .getStatus()
      .then(setUpdateStatus)
      .catch(() => undefined);
    void window.lunabot.providerRuntimes
      ?.getStatus()
      .then(applyProviderRuntimeSnapshot)
      .catch(() => undefined);
    void window.lunabot.getSetupState().then(setSetupState);
    void window.lunabot.update
      .getPreference()
      .then((preference) => {
        // A toggle made before this read resolves has already been persisted, so the older value
        // must not be painted back over it.
        if (autoDownloadUpdatesChanged) return;
        setGeneralSettings((current) => ({ ...current, autoDownloadUpdates: preference.autoDownload }));
      })
      .catch(() => undefined);
    void window.lunabot.dynamicIsland
      .getPreference()
      .then((preference) =>
        setGeneralSettings((current) => ({
          ...current,
          macBookNotch: preference.enabled,
          macBookNotchHaptics: preference.hapticsEnabled,
          macBookNotchIdle: preference.idleVisible,
          macBookNotchAdditionalDisplays: preference.additionalDisplaysEnabled,
        })),
      )
      .catch(() => undefined);
    void window.lunabot.agentPreferences
      .getMemoryLimit()
      .then((limit) => setGeneralSettings((current) => ({ ...current, agentMemoryLimit: limit })))
      .catch(() => undefined);
    void window.lunabot.agentPreferences
      .getClaudeCompactWindow()
      .then((tokens) => setGeneralSettings((current) => ({ ...current, claudeCompactWindow: tokens })))
      .catch(() => undefined);
    void window.lunabot.agentPreferences
      .getBusyMessageMode()
      .then((mode) => setGeneralSettings((current) => ({ ...current, busyMessageMode: mode })))
      .catch(() => undefined);
    void window.lunabot.agentPreferences
      .getWindowCloseBehavior()
      .then((behavior) => setGeneralSettings((current) => ({ ...current, windowCloseBehavior: behavior })))
      .catch(() => undefined);
    void window.lunabot
      .getAppInfo()
      .then((info) => {
        setAppInfo(info);
      })
      .catch(() =>
        setAppInfo({
          name: "Luna Bot",
          version: "unavailable",
          platform: fallbackDesktopPlatform(),
          variant: "production",
        }),
      );
    void Promise.all([
      window.lunabot.agent
        .getStatus()
        .then(setAgentStatus)
        .catch(() => undefined),
      window.lunabot.agent
        .listModels()
        .then(setModelOptions)
        .catch(() => undefined),
      window.lunabot.agent
        .listBots()
        .then(applyStoredBots)
        .catch((error) => {
          setAgentStatus((current) => ({ ...current, message: String(error) }));
        }),
      window.lunabot.agent
        .getSidebarLayout()
        .then(setSidebarLayout)
        .catch(() => setSidebarLayout(defaultSidebarLayout())),
      window.lunabot.agent
        .listConversationReads()
        .then(applyConversationReads)
        .catch(() => undefined),
    ]);
    if (!props.landingPreview) {
      const requestedAtRevision = browserChangeRevision;
      void window.lunabot.browser
        .getDisplayState()
        .then((state) => {
          if (browserChangeRevision !== requestedAtRevision) return;
          setBrowserTabs(state.tabs);
          setActiveBrowserTabId(state.activeTabId ?? state.tabs[0]?.id ?? null);
        })
        .catch(() => undefined);
      void window.lunabot.browser
        .getControlState()
        .then(setBrowserControlState)
        .catch(() => undefined);
    }
    return cleanup;
  });

  createEffect(
    () => ({ botId: activeBotId(), agentPhase: agentStatus().phase, openRevision: agentChatOpenRevision() }),
    ({ botId }) => {
      if (!botId) return;
      const trackingKey = botId;
      const pageRequest = (conversationPageRequests.get(botId) ?? 0) + 1;
      conversationPageRequests.set(botId, pageRequest);
      void window.lunabot.agent
        .readConversationPage({ botId, anchor: { type: "latest" }, limit: 50 })
        .then((page) => {
          if (conversationPageRequests.get(botId) !== pageRequest) return;
          const pageApplied = applyConversationPage(page, "replace", "latest");
          if (!pageApplied) {
            if (agentChatsToMarkRead.has(trackingKey)) {
              if (!agentChatsRetriedOnOpen.has(botId)) {
                agentChatsRetriedOnOpen.add(botId);
                setAgentChatOpenRevision((current) => current + 1);
              } else {
                agentChatsToMarkRead.delete(trackingKey);
                markLatestVisibleAgentMessageRead(botId);
              }
            }
            return;
          }
          agentChatsRetriedOnOpen.delete(botId);
          const markReadOnOpen = agentChatsToMarkRead.delete(trackingKey);
          if (markReadOnOpen && (page.readState?.unreadCount ?? 0) > 0) {
            void markAgentMessagesRead(botId, page.messages.at(-1)?.id ?? null).catch((error) =>
              appendUiError(botId, error, t("misc.app.status.readStateFailed")),
            );
          } else if (agentChatsToRetryRead.has(trackingKey) && (page.readState?.unreadCount ?? 0) > 0) {
            const latestIncomingMessage = [...page.messages]
              .reverse()
              .find(
                (message) =>
                  message.author !== "user" &&
                  message.itemType !== "commentary" &&
                  message.itemType !== "agent_attachment" &&
                  !isEventNoteItem(message),
              );
            if (latestIncomingMessage) autoMarkAgentMessageRead(botId, latestIncomingMessage.id);
          }
        })
        .catch((error) => {
          if (conversationPageRequests.get(botId) !== pageRequest) return;
          appendUiError(botId, error, t("misc.app.status.loadFailed"));
          if (agentChatsToMarkRead.delete(trackingKey)) markLatestVisibleAgentMessageRead(botId);
        });
    },
  );

  createEffect(
    () => ({ botId: activeBotId(), agentPhase: agentStatus().phase }),
    ({ botId }) => {
      if (!botId) return;
      const queueRequest = (queueSnapshotRequests.get(botId) ?? 0) + 1;
      queueSnapshotRequests.set(botId, queueRequest);
      void window.lunabot.agent
        .listQueue(botId)
        .then((queue) => {
          if (queueSnapshotRequests.get(botId) !== queueRequest) return;
          setQueues((current) => ({ ...current, [botId]: queue }));
        })
        .catch((error) => {
          appendUiError(botId, error, t("misc.app.status.queueLoadFailed"));
        });
    },
  );

  function refreshRoutineIds(botId: string): void {
    const key = botId;
    const request = (routineSnapshotRequests.get(key) ?? 0) + 1;
    routineSnapshotRequests.set(key, request);
    setRoutineIdsByConversation((current) => ({ ...current, [key]: undefined }));
    void window.lunabot.agent
      .listRoutines(botId)
      .then((routines) => {
        if (routineSnapshotRequests.get(key) !== request) return;
        setRoutineIdsByConversation((current) => ({ ...current, [key]: routines.map((routine) => routine.id) }));
      })
      .catch(() => undefined);
  }

  createEffect(
    () => ({ botId: activeBotId(), agentPhase: agentStatus().phase }),
    ({ botId }) => {
      if (botId) refreshRoutineIds(botId);
    },
  );

  function handleAgentEvent(event: AgentEvent) {
    switch (event.type) {
      case "status":
        applyAgentStatus(event.status);
        if (event.status.phase === "ready") {
          void window.lunabot.agent
            .listModels()
            .then(setModelOptions)
            .catch(() => undefined);
        }
        return;
      case "usage-changed":
        setAccountUsage(event.usage);
        return;
      case "bots-changed":
        applyStoredBots(event.bots);
        return;
      case "sidebar-layout-changed":
        setSidebarLayout(event.layout);
        return;
      case "conversation":
        scheduleConversation(event.snapshot);
        return;
      case "conversation-page":
        {
          const existingUnreadCount = conversationReads()[event.page.botId]?.unreadCount ?? 0;
          const trackingKey = event.page.botId;
          const markNewMessagesRead =
            isAgentChatReadable(event.page.botId) &&
            (event.page.readState === undefined || event.page.readState.unreadCount > 0) &&
            (existingUnreadCount === 0 ||
              explicitlyOpenedAgentChatId === event.page.botId ||
              agentChatsToRetryRead.has(trackingKey));
          const pageApplied = applyConversationPage(event.page, "latest", "latest");
          const latestIncomingMessage = markNewMessagesRead
            ? [...event.page.messages]
                .reverse()
                .find(
                  (message) =>
                    message.author !== "user" &&
                    message.itemType !== "commentary" &&
                    message.itemType !== "agent_attachment" &&
                    !isEventNoteItem(message),
                )
            : undefined;
          if (pageApplied && latestIncomingMessage) {
            autoMarkAgentMessageRead(event.page.botId, latestIncomingMessage.id, existingUnreadCount === 0);
          }
        }
        return;
      case "conversation-invalidated":
        return;
      case "conversation-delta":
        applyConversationDelta(event);
        return;
      case "queue-changed":
        queueSnapshotRequests.set(event.snapshot.botId, (queueSnapshotRequests.get(event.snapshot.botId) ?? 0) + 1);
        setQueues((current) => ({
          ...current,
          [event.snapshot.botId]: event.snapshot,
        }));
        return;
      case "routines-changed":
        refreshRoutineIds(event.botId);
        return;
      case "browser-changed":
        if (props.landingPreview) return;
        browserChangeRevision += 1;
        setBrowserTabs(event.tabs);
        setActiveBrowserTabId(event.activeTabId);
        return;
      case "browser-control-changed":
        if (props.landingPreview) return;
        setBrowserControlState(event.state);
        return;
      case "background-tasks-changed":
        setBackgroundTasks((current) => ({ ...current, [event.botId]: event.tasks }));
        return;
      case "turn-started":
        completedTurnByBot.delete(event.botId);
        clearRecentReply(event.botId);
        setFailedTurns((current) => withoutBot(current, event.botId));
        setActiveTurns((current) => ({
          ...current,
          [event.botId]: event.turnId,
        }));
        return;
      case "turn-completed":
        completedTurnByBot.set(event.botId, event.turnId);
        setFailedTurns((current) =>
          event.status === "failed" ? { ...current, [event.botId]: event.turnId } : withoutBot(current, event.botId),
        );
        setActiveTurns((current) => ({ ...current, [event.botId]: null }));
        setQueues((current) => {
          const snapshot = current[event.botId];
          if (!snapshot) return current;
          const deliveries = snapshot.deliveries.filter(
            (delivery) =>
              !(
                (delivery.status === "starting" || delivery.status === "running") &&
                (delivery.turnId === null || delivery.turnId === event.turnId)
              ),
          );
          if (deliveries.length === snapshot.deliveries.length) return current;
          return { ...current, [event.botId]: { ...snapshot, deliveries } };
        });
        setPendingPrompts((current) => {
          const pending = current[event.botId];
          const submittedRequestKey = submittedPromptRequests()[event.botId];
          if (
            pending?.type === "prompt" &&
            promptRequestKey(pending.turnId, pending.requestId) === submittedRequestKey
          ) {
            return current;
          }
          return { ...current, [event.botId]: undefined };
        });
        setPendingApprovals((current) => ({ ...current, [event.botId]: undefined }));
        if (event.status === "completed") {
          markReplyCompleted(event.botId);
          playCompletionSoundForAgentEvent(event, splitHiddenAgents(botList(), sidebarLayout().hiddenAgentIds).visible);
        }
        return;
      case "prompt":
        setPendingPrompts((current) => ({ ...current, [event.botId]: event }));
        setPresentedPromptResolutions((current) => ({ ...current, [event.botId]: undefined }));
        setSubmittedPromptRequests((current) => ({ ...current, [event.botId]: undefined }));
        return;
      case "agent-input-resolved":
        if (event.kind === "prompt") {
          setPendingPrompts((current) => {
            const prompt = current[event.botId];
            return prompt?.type === "prompt" && String(prompt.requestId) === String(event.requestId)
              ? { ...current, [event.botId]: undefined }
              : current;
          });
        } else {
          setPendingApprovals((current) => {
            const approval = current[event.botId];
            return approval && String(approval.requestId) === String(event.requestId)
              ? { ...current, [event.botId]: undefined }
              : current;
          });
        }
        return;
      case "approval":
        setPendingApprovals((current) => ({
          ...current,
          [event.approval.botId]: event.approval,
        }));
        return;
      case "runtime-snapshot":
        applyAgentRuntimeSnapshot(event.snapshot);
        return;
      case "browser-takeover-requested":
        setPendingPrompts((current) => ({
          ...current,
          [event.request.botId]: event,
        }));
        return;
      case "browser-takeover-resolved":
        setPendingPrompts((current) => {
          const pending = current[event.botId];
          return pending?.type === "browser-takeover-requested" && pending.request.requestId === event.requestId
            ? { ...current, [event.botId]: undefined }
            : current;
        });
        return;
      case "error":
        if (event.botId) appendUiError(event.botId, event.message, t("misc.app.status.error"));
    }
  }

  function applyAgentRuntimeSnapshot(snapshot: AgentRuntimeSnapshot): void {
    setActiveTurns(Object.fromEntries(snapshot.activeTurns.map((turn) => [turn.botId, turn.turnId])));
    setBackgroundTasks(Object.fromEntries((snapshot.backgroundTasks ?? []).map((entry) => [entry.botId, entry.tasks])));
    setFailedTurns(Object.fromEntries(snapshot.failedTurns.map((turn) => [turn.botId, turn.turnId])));
    setQueues((current) =>
      reconcileQueuesWithRuntimeWork(
        current,
        snapshot.work,
        new Map(snapshot.activeTurns.map((turn) => [turn.botId, turn.turnId])),
      ),
    );
    setPendingPrompts((current) => {
      const next = snapshot.attentionComplete ? {} : { ...current };
      const submitted = submittedPromptRequests();
      for (const prompt of snapshot.pendingPrompts) {
        if (promptRequestKey(prompt.turnId, prompt.requestId) !== submitted[prompt.botId]) {
          next[prompt.botId] = { type: "prompt", ...prompt };
        }
      }
      for (const request of snapshot.pendingBrowserTakeovers) {
        next[request.botId] = { type: "browser-takeover-requested", request };
      }
      return next;
    });
    setPendingApprovals((current) => ({
      ...(snapshot.attentionComplete ? {} : current),
      ...Object.fromEntries(snapshot.pendingApprovals.map((approval) => [approval.botId, approval])),
    }));
    for (const botId of new Set(snapshot.latestMessages.map((message) => message.botId))) {
      deleteAgentMessageBodies(rawAgentMessageBodies, botId);
    }
    for (const message of snapshot.latestMessages) {
      rawAgentMessageBodies.set(agentMessageKey(message.botId, message.id), message.text);
    }
    setLiveMessages((current) => {
      const next = { ...current };
      for (const message of snapshot.latestMessages) {
        const messages = next[message.botId] ?? [];
        if (messages.some((candidate) => candidate.id === message.id)) continue;
        next[message.botId] = [
          ...messages,
          {
            id: message.id,
            author: "bot",
            body: cleanAgentMessageText(message.text),
            time: message.createdAt,
            createdAt: message.createdAt,
          },
        ];
      }
      return next;
    });
  }

  function applyAgentStatus(status: AgentStatus): void {
    setAgentStatus(status);
  }

  function applyStoredBots(storedBots: BotSummary[]) {
    const currentById = new Map(botList().map((bot) => [bot.id, bot]));
    const profiles = storedBots.map((stored) => {
      const next = toBotProfile(stored);
      const existing = currentById.get(next.id);
      if (!existing) return createStoredProfile(next);
      if (!botProfilesEqual(existing, next)) updateStored(existing, next);
      return existing;
    });
    setBotList(profiles);
    setActiveBotId((current) => (profiles.some((bot) => bot.id === current) ? current : (profiles[0]?.id ?? "")));
    if (profiles.length === 0 && !botSetupOpen()) {
      setBotSetupDraft(createFirstBotDraft());
      setBotSetupError(null);
      setBotSetupOpen(true);
    }
  }

  function applyConversationReads(reads: Record<string, ConversationReadState>): void {
    setConversationReads(reads);
    setUnreadReplies(Object.fromEntries(Object.entries(reads).map(([botId, state]) => [botId, state.unreadCount])));
  }

  function applyConversationReadState(botId: string, state: ConversationReadState): void {
    setConversationReads((current) => ({ ...current, [botId]: state }));
    setUnreadReplies((current) => ({ ...current, [botId]: state.unreadCount }));
  }

  function scheduleConversation(snapshot: ConversationSnapshot) {
    const botId = snapshot.botId;
    const appliedRevision = conversationRevisions()[botId] ?? -1;
    const pending = pendingConversationSnapshots.get(botId);
    const pendingRevision = pending?.revision ?? -1;
    if (snapshot.revision < Math.max(appliedRevision, pendingRevision)) return;
    for (const message of snapshot.messages) {
      const key = agentMessageKey(botId, message.id);
      if (message.author !== "user" && message.status === "streaming") rawAgentMessageBodies.set(key, message.text);
      else rawAgentMessageBodies.delete(key);
    }
    pendingConversationSnapshots.set(botId, snapshot);
    if (conversationFrame !== undefined) return;
    conversationFrame = requestAnimationFrame(() => {
      conversationFrame = undefined;
      const snapshots = [...pendingConversationSnapshots.values()];
      pendingConversationSnapshots.clear();
      for (const pendingSnapshot of snapshots) {
        applyConversation(pendingSnapshot, isAgentChatReadable(pendingSnapshot.botId));
      }
    });
  }

  function isAgentChatOpen(botId: string): boolean {
    return !botSetupOpen() && activeBot()?.id === botId;
  }

  function isAgentChatReadable(botId: string): boolean {
    return appFocused() && isAgentChatOpen(botId);
  }

  function latestVisibleAgentMessageId(botId: string): string | null {
    return (
      liveMessages()
        [botId]?.filter(
          (message) =>
            message.author !== "you" &&
            message.itemType !== "commentary" &&
            message.itemType !== "agent_attachment" &&
            !isEventNoteItem(message) &&
            !message.id.startsWith("thinking:") &&
            !message.id.startsWith("ui-"),
        )
        .at(-1)?.id ?? null
    );
  }

  function markLatestVisibleAgentMessageRead(botId: string): void {
    const latestMessageId = latestVisibleAgentMessageId(botId);
    if (!latestMessageId) return;
    void markAgentMessagesRead(botId, latestMessageId).catch((error) =>
      appendUiError(botId, error, t("misc.app.status.readStateFailed")),
    );
  }

  function refreshAgentReadStateAfterFailure(
    botId: string,
    messageId: string,
    minimumRevision: number,
    fallbackState: ConversationReadState | null,
  ): void {
    const trackingKey = botId;
    const applyFallback = () => {
      if (autoReadAgentMessages.has(trackingKey) || !fallbackState) return;
      const latest = conversationReads()[botId];
      if (latest?.unreadCount === 0 && latest.throughMessageId === messageId) {
        applyConversationReadState(botId, fallbackState);
      }
    };
    void window.lunabot.agent
      .readConversationPage({ botId, anchor: { type: "latest" }, limit: 1 })
      .then((page) => {
        if (autoReadAgentMessages.has(trackingKey) || page.revision < minimumRevision || !page.readState) {
          applyFallback();
          return;
        }
        applyConversationReadState(botId, page.readState);
      })
      .catch(applyFallback);
  }

  function autoMarkAgentMessageRead(botId: string, messageId: string, optimisticallyClearUnread = false): void {
    const trackingKey = botId;
    const current = conversationReads()[botId];
    const previousAutoRead = autoReadAgentMessages.get(trackingKey);
    if (previousAutoRead?.messageId === messageId) {
      const retainedState =
        previousAutoRead.status === "succeeded" ? previousAutoRead.state : previousAutoRead.optimisticState;
      if (retainedState) applyConversationReadState(botId, retainedState);
      return;
    }
    const hasUnread = Boolean(current && current.unreadCount > 0);
    const retryingRead = agentChatsToRetryRead.delete(trackingKey);
    if (!optimisticallyClearUnread && explicitlyOpenedAgentChatId !== botId && !retryingRead && hasUnread) return;
    const optimisticallyCleared = Boolean(current && (!hasUnread || optimisticallyClearUnread));
    const optimisticState: ConversationReadState | null =
      current && optimisticallyCleared
        ? { unreadCount: 0, firstUnreadMessageId: null, throughMessageId: messageId }
        : null;
    autoReadAgentMessages.set(trackingKey, { messageId, status: "pending", optimisticState });
    const rollbackState = current
      ? hasUnread
        ? current
        : { ...current, unreadCount: 1, firstUnreadMessageId: messageId }
      : null;
    if (optimisticState) applyConversationReadState(botId, optimisticState);
    void markAgentMessagesRead(botId, messageId, (state) => {
      if (autoReadAgentMessages.get(trackingKey)?.messageId !== messageId) return;
      autoReadAgentMessages.set(trackingKey, { messageId, status: "succeeded", state });
    }).catch((error) => {
      if (autoReadAgentMessages.get(trackingKey)?.messageId !== messageId) return;
      autoReadAgentMessages.delete(trackingKey);
      agentChatsToRetryRead.add(trackingKey);
      refreshAgentReadStateAfterFailure(
        botId,
        messageId,
        conversationRevisions()[botId] ?? -1,
        optimisticallyCleared ? rollbackState : null,
      );
      appendUiError(botId, error, t("misc.app.status.readStateFailed"));
    });
  }

  function applyConversationDelta(event: Extract<AgentEvent, { type: "conversation-delta" }>) {
    if (event.revision <= (conversationRevisions()[event.botId] ?? -1)) return;
    pendingConversationSnapshots.delete(event.botId);
    setConversationRevisions((current) => ({
      ...current,
      [event.botId]: event.revision,
    }));

    const existing = liveMessages()[event.botId]?.find((message) => message.id === event.messageId);
    const messageKey = agentMessageKey(event.botId, event.messageId);
    const rawBody = (rawAgentMessageBodies.get(messageKey) ?? existing?.body ?? "") + event.delta;
    rawAgentMessageBodies.set(messageKey, rawBody);
    if (existing) {
      updateStored(existing, {
        ...existing,
        body: cleanAgentMessageText(rawBody),
        streaming: true,
      });
    } else {
      const message = createStoredMessage({
        id: event.messageId,
        turnId: event.turnId,
        author: "bot",
        body: cleanAgentMessageText(rawBody),
        time: formatTime(event.createdAt),
        createdAt: event.createdAt,
        streaming: true,
        animate: conversationLoaded()[event.botId] === true,
        kind: "text",
      });
      setLiveMessages((current) => ({
        ...current,
        [event.botId]: [...(current[event.botId] ?? []), message],
      }));
      const readState = conversationReads()[event.botId];
      if (isAgentChatReadable(event.botId)) {
        autoMarkAgentMessageRead(event.botId, event.messageId);
      } else if (readState) {
        applyConversationReadState(event.botId, {
          ...readState,
          unreadCount: readState.unreadCount + 1,
          firstUnreadMessageId: readState.firstUnreadMessageId ?? event.messageId,
        });
      }
    }
    setConversationLoaded((current) => ({ ...current, [event.botId]: true }));
  }

  function applyConversation(snapshot: ConversationSnapshot, markNewMessagesRead = false) {
    const botId = snapshot.botId;
    if (snapshot.revision < (conversationRevisions()[botId] ?? -1)) return;
    const initialLoad = conversationLoaded()[botId] !== true;
    setConversationRevisions((current) => ({
      ...current,
      [botId]: snapshot.revision,
    }));
    setLiveMessages((current) => {
      const previous = current[botId] ?? [];
      const previousById = new Map(previous.map((message) => [message.id, message]));
      const allMappedMessages = toBotMessages(snapshot.messages, snapshot.botId);
      const pageInfo = conversationPages()[botId];
      const windowMode = conversationWindowModes()[botId] ?? "latest";
      const mappedMessages = retainThinkingMessages(
        previous,
        pageInfo?.hasOlder
          ? (() => {
              const loadedIds = new Set(previous.map((message) => message.id));
              if (windowMode === "around") {
                return allMappedMessages.filter((message) => loadedIds.has(message.id));
              }
              const lastLoadedIndex = [...allMappedMessages]
                .map((message) => message.id)
                .reduce((last, id, index) => (loadedIds.has(id) ? index : last), -1);
              return allMappedMessages.filter((message, index) => loadedIds.has(message.id) || index > lastLoadedIndex);
            })()
          : allMappedMessages,
      );
      const next = mappedMessages.map((mapped) => {
        const existing = previousById.get(mapped.id);
        if (!existing) return createStoredMessage({ ...mapped, animate: !initialLoad });
        if (!botMessagesEqual(existing, mapped)) updateStored(existing, mapped);
        return existing;
      });
      if (previous.length === next.length && previous.every((message, index) => message === next[index])) {
        return current;
      }
      return { ...current, [botId]: next };
    });
    setConversationLoaded((current) => ({ ...current, [botId]: true }));
    const presentedRequestKey = presentedPromptResolutions()[botId];
    const pendingPrompt = pendingPrompts()[botId];
    const pendingRequestKey =
      pendingPrompt?.type === "prompt" ? promptRequestKey(pendingPrompt.turnId, pendingPrompt.requestId) : null;
    const submittedRequestKey = submittedPromptRequests()[botId];
    const resolvedPendingPrompt =
      pendingRequestKey !== null &&
      snapshot.messages.some(
        (message) =>
          messagePromptRequestKey(message) === pendingRequestKey && message.questionPrompt?.resolution !== null,
      );
    if (
      presentedRequestKey &&
      snapshot.messages.some(
        (message) =>
          messagePromptRequestKey(message) === presentedRequestKey && message.questionPrompt?.resolution !== null,
      )
    ) {
      setPendingPrompts((current) => ({ ...current, [botId]: undefined }));
      setPresentedPromptResolutions((current) => ({ ...current, [botId]: undefined }));
      setSubmittedPromptRequests((current) => ({ ...current, [botId]: undefined }));
    } else if (
      resolvedPendingPrompt &&
      (activeBot()?.id !== botId || !submittedRequestKey || submittedRequestKey !== pendingRequestKey)
    ) {
      setPendingPrompts((current) => ({ ...current, [botId]: undefined }));
      setPresentedPromptResolutions((current) => ({ ...current, [botId]: undefined }));
      setSubmittedPromptRequests((current) => ({ ...current, [botId]: undefined }));
    }
    setActiveTurns((current) => ({
      ...current,
      [botId]: completedTurnByBot.get(botId) === snapshot.activeTurnId ? null : snapshot.activeTurnId,
    }));
    const readState = conversationReads()[botId];
    const latestIncomingMessage = markNewMessagesRead
      ? [...snapshot.messages]
          .reverse()
          .find(
            (message) =>
              message.author !== "user" &&
              message.itemType !== "commentary" &&
              message.itemType !== "agent_attachment" &&
              !isEventNoteItem(message),
          )
      : undefined;
    if (latestIncomingMessage) {
      autoMarkAgentMessageRead(botId, latestIncomingMessage.id);
    } else if (readState) {
      applyConversationReadState(botId, readStateForMessages(readState, snapshot.messages));
    }
  }

  function applyConversationPage(
    page: ConversationPage,
    merge: "replace" | "older" | "latest",
    windowMode?: "latest" | "around",
  ): boolean {
    if (page.revision < (conversationRevisions()[page.botId] ?? -1)) return false;
    for (const message of page.messages) {
      const key = agentMessageKey(page.botId, message.id);
      if (message.author !== "user" && message.status === "streaming") rawAgentMessageBodies.set(key, message.text);
      else rawAgentMessageBodies.delete(key);
    }
    const mapped = toBotMessages(page.messages, page.botId);
    setLiveMessages((current) => {
      const currentMessages = current[page.botId] ?? [];
      const currentById = new Map(currentMessages.map((message) => [message.id, message]));
      const pageMessages = mapped.map((message) => {
        const stored = currentById.get(message.id);
        if (!stored) return createStoredMessage({ ...message, animate: false });
        if (!botMessagesEqual(stored, message)) updateStored(stored, { ...message, animate: stored.animate });
        return stored;
      });
      const existing = merge === "replace" ? [] : currentMessages;
      const ids = new Set(mapped.map((message) => message.id));
      return {
        ...current,
        [page.botId]:
          merge === "replace"
            ? pageMessages
            : merge === "older"
              ? [...pageMessages, ...existing.filter((message) => !ids.has(message.id))]
              : [...existing.filter((message) => !ids.has(message.id)), ...pageMessages],
      };
    });
    setConversationReferences((current) => ({
      ...current,
      [page.botId]: {
        ...(merge === "replace" ? {} : current[page.botId]),
        ...Object.fromEntries(
          Object.entries(page.references).map(([id, message]) => [id, toBotMessage(message, page.botId)]),
        ),
      },
    }));
    setConversationPages((current) => ({ ...current, [page.botId]: page.pageInfo }));
    if (windowMode) setConversationWindowModes((current) => ({ ...current, [page.botId]: windowMode }));
    setConversationRevisions((current) => ({ ...current, [page.botId]: page.revision }));
    setConversationLoaded((current) => ({ ...current, [page.botId]: true }));
    setActiveTurns((current) => ({
      ...current,
      [page.botId]: completedTurnByBot.get(page.botId) === page.activeTurnId ? null : page.activeTurnId,
    }));
    if (page.readState && merge !== "older") {
      const trackedAutoRead = autoReadAgentMessages.get(page.botId);
      const latestIncomingMessage = [...page.messages]
        .reverse()
        .find(
          (message) =>
            message.author !== "user" &&
            message.itemType !== "commentary" &&
            message.itemType !== "agent_attachment" &&
            !isEventNoteItem(message),
        );
      let retainedState: ConversationReadState | null = null;
      if (trackedAutoRead && trackedAutoRead.messageId === latestIncomingMessage?.id) {
        retainedState =
          trackedAutoRead.status === "succeeded" ? trackedAutoRead.state : trackedAutoRead.optimisticState;
      }
      applyConversationReadState(page.botId, retainedState ?? page.readState);
    }
    return true;
  }

  function pruneInactiveAgentHistory(botId: string): void {
    const messages = liveMessages()[botId];
    if (!messages || messages.length <= 50) return;
    setLiveMessages((current) => {
      const currentMessages = current[botId];
      if (!currentMessages || currentMessages.length <= 50) return current;
      return { ...current, [botId]: currentMessages.slice(-50) };
    });
    setConversationReferences((current) => ({ ...current, [botId]: {} }));
    setConversationPages((current) => ({
      ...current,
      [botId]: { hasOlder: true, olderCursor: null },
    }));
  }

  async function loadLatestAgentMessages(botId: string): Promise<void> {
    const request = (conversationPageRequests.get(botId) ?? 0) + 1;
    conversationPageRequests.set(botId, request);
    const page = await window.lunabot.agent.readConversationPage({
      botId,
      anchor: { type: "latest" },
      limit: 50,
    });
    if (conversationPageRequests.get(botId) !== request) return;
    applyConversationPage(page, "replace", "latest");
  }

  async function loadOlderAgentMessages(botId = activeBot()?.id): Promise<void> {
    if (!botId || conversationOlderLoading()[botId]) return;
    const pageInfo = conversationPages()[botId];
    if (!pageInfo?.hasOlder || !pageInfo.olderCursor) return;
    const cursor = pageInfo.olderCursor;
    const requestVersion = conversationPageRequests.get(botId) ?? 0;
    setConversationOlderLoading((current) => ({ ...current, [botId]: true }));
    setConversationOlderErrors((current) => ({ ...current, [botId]: null }));
    try {
      const page = await window.lunabot.agent.readConversationPage({
        botId,
        anchor: { type: "before", cursor },
        limit: 50,
      });
      if (conversationPageRequests.get(botId) !== requestVersion) return;
      if (conversationPages()[botId]?.olderCursor !== cursor) return;
      applyConversationPage(page, "older");
    } catch (error) {
      setConversationOlderErrors((current) => ({
        ...current,
        [botId]: error instanceof Error ? error.message : t("misc.app.olderMessagesFailed"),
      }));
    } finally {
      setConversationOlderLoading((current) => ({ ...current, [botId]: false }));
    }
  }

  async function createAgent(draft: FirstBotDraft = botSetupDraft()) {
    if (creatingAgent()) return;
    const submitted = { ...draft };
    setCreatingAgent(true);
    setBotSetupError(null);
    try {
      const stored = await window.lunabot.agent.createBot({
        name: submitted.name.trim(),
        description: submitted.purpose.trim(),
        avatarSeed: submitted.avatarSeed,
        avatarHue: submitted.avatarHue,
        initialMessage: createBotInitialMessage(submitted),
      });
      const newAgent = createStoredProfile(toBotProfile(stored));
      setBotList((current) => [newAgent, ...current.filter((item) => item.id !== newAgent.id)]);
      setLiveMessages((current) => (current[newAgent.id] ? current : { ...current, [newAgent.id]: [] }));
      setConversationLoaded((current) => ({ ...current, [newAgent.id]: true }));
      setBotSetupOpen(false);
      const link = roomRequestCreation();
      if (link) {
        await completeRoomRequest(link, newAgent);
      } else {
        roomsStore.selectRoom(null);
        setActiveBotId(newAgent.id);
      }
    } catch (error) {
      setBotSetupError(error instanceof Error ? error.message : t("misc.app.botCreateFailed"));
    } finally {
      setCreatingAgent(false);
    }
  }

  // Answers the room's new_bot request with the bot just created. The backend tells the manager.
  async function completeRoomRequest(link: { requestId: string; roomId: string }, bot: BotProfile) {
    await roomsStore.resolveRequest(link.requestId, "approve", bot.id);
    setRoomRequestCreation(null);
  }

  function openLunaBotSetup() {
    if (botSetupOpen()) return;
    setRoomRequestCreation(null);
    setBotSetupDraft(createFirstBotDraft());
    setBotSetupError(null);
    explicitlyOpenedAgentChatId = null;
    setBotSetupOpen(true);
  }

  function cancelBotSetup() {
    if (creatingAgent() || botList().length === 0) return;
    setRoomRequestCreation(null);
    setBotSetupOpen(false);
    setBotSetupError(null);
    setBotSetupDraft(createFirstBotDraft());
  }

  function openNewBotFromRoomRequest(request: RoomRequest) {
    if (!request.profile) return;
    setRoomRequestCreation({ requestId: request.id, roomId: request.roomId });
    setBotSetupDraft({ ...createFirstBotDraft(), name: request.profile.name, purpose: request.profile.description });
    setBotSetupError(null);
    explicitlyOpenedAgentChatId = null;
    setBotSetupOpen(true);
  }

  function selectBot(botId: string) {
    if (botSetupOpen() && creatingAgent()) return;
    roomsStore.selectRoom(null);
    setRoomRequestCreation(null);
    const previousBotId = activeBotId();
    if (previousBotId && previousBotId !== botId) pruneInactiveAgentHistory(previousBotId);
    setBotSetupOpen(false);
    setBotSetupError(null);
    clearReplyIndicators(botId);
    const trackingKey = botId;
    autoReadAgentMessages.delete(trackingKey);
    agentChatsToMarkRead.add(trackingKey);
    agentChatsRetriedOnOpen.delete(botId);
    explicitlyOpenedAgentChatId = botId;
    setActiveBotId(botId);
    setAgentChatOpenRevision((current) => current + 1);
  }

  function setGlobalSearchVisibility(open: boolean): void {
    setGlobalSearchOpen(open);
  }

  async function searchGlobalMessages(query: string): Promise<Array<{ botId: string; message: BotMessage }>> {
    const page = await window.lunabot.agent.searchConversationMessages({ query, limit: 100 });
    return page.results.map((result) => ({
      botId: result.botId,
      message: toBotMessage(result.message, result.botId),
    }));
  }

  async function searchAgentMessages(botId: string, query: string): Promise<{ messageIds: string[]; total: number }> {
    const page = await window.lunabot.agent.searchConversationMessages({ query, botId, limit: 100 });
    return { messageIds: page.results.map((result) => result.message.id), total: page.total };
  }

  function selectGlobalSearchMessage(botId: string, messageId: string): void {
    selectBot(botId);
    void openAgentMessage(botId, messageId);
  }

  async function openAgentMessage(botId: string, messageId: string): Promise<void> {
    await Promise.resolve();
    const request = (conversationPageRequests.get(botId) ?? 0) + 1;
    conversationPageRequests.set(botId, request);
    try {
      const page = await window.lunabot.agent.readConversationPage({
        botId,
        anchor: { type: "around", messageId },
        limit: 50,
      });
      if (conversationPageRequests.get(botId) !== request) return;
      if (!page.messages.some((message) => message.id === messageId)) {
        throw new Error(t("misc.app.messageUnavailable"));
      }
      applyConversationPage(page, "replace", "around");
      setMessageFocusRequest({ botId, messageId, nonce: Date.now() });
      try {
        let readBoundary = page.messages.at(-1)?.id ?? messageId;
        try {
          const latestPage = await window.lunabot.agent.readConversationPage({
            botId,
            anchor: { type: "latest" },
            limit: 1,
          });
          readBoundary = latestPage.messages.at(-1)?.id ?? readBoundary;
        } catch {
          // The focused page still gives us a safe read boundary when the latest-page refresh fails.
        }
        await markAgentMessagesRead(botId, readBoundary);
      } catch (error) {
        appendUiError(botId, error, t("misc.app.status.readStateFailed"));
      }
    } catch (error) {
      appendUiError(botId, error, t("misc.app.status.messageLoadFailed"));
    }
  }

  function markReplyCompleted(botId: string) {
    clearRecentReply(botId);
    if (appFocused()) return;
    setRecentReplies((current) => ({ ...current, [botId]: true }));
  }

  function clearRecentReply(botId: string) {
    setRecentReplies((current) => (current[botId] ? { ...current, [botId]: false } : current));
  }

  function clearReplyIndicators(botId: string) {
    clearRecentReply(botId);
  }

  function activateBrowserTab(tabId: string) {
    const operation = window.lunabot.browser.activate(tabId);
    browserTabActivationOperations.set(tabId, operation);
    void operation.finally(() => {
      if (browserTabActivationOperations.get(tabId) === operation) {
        browserTabActivationOperations.delete(tabId);
      }
    });
  }

  async function closeBrowserTab(tabId: string) {
    await browserTabActivationOperations.get(tabId)?.catch(() => undefined);
    if (browserVisibilitySuspended()) {
      return;
    }
    await window.lunabot.browser.close(tabId);
    {
      browserChangeRevision += 1;
      const currentTabs = browserTabs();
      const closedIndex = currentTabs.findIndex((tab) => tab.id === tabId);
      const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
      setBrowserTabs(nextTabs);
      setActiveBrowserTabId((current) =>
        current === tabId ? (nextTabs[closedIndex]?.id ?? nextTabs[closedIndex - 1]?.id ?? null) : current,
      );
    }
  }

  async function updateBot(botId: string, updates: Omit<UpdateBotInput, "botId">) {
    try {
      const stored = await window.lunabot.agent.updateBot({
        botId,
        ...updates,
      });
      // A room bot belongs to its room's profiles, not the general list. Adding it here would leak it into the sidebar.
      const roomId = roomIdOfBot(roomsStore.rooms(), botId);
      if (roomId) {
        await roomsStore.refreshProfiles(roomId);
        return;
      }
      const next = toBotProfile(stored);
      setBotList((current) => {
        const existingIndex = current.findIndex((bot) => bot.id === botId);
        if (existingIndex === -1) return [...current, createStoredProfile(next)];
        const existing = current[existingIndex];
        if (existing) updateStored(existing, next);
        return current;
      });
    } catch (error) {
      appendUiError(botId, error, t("misc.app.status.settingsFailed"));
      throw error;
    }
  }

  async function setAgentAvatar(botId: string, image: AvatarImageInput | null): Promise<void> {
    try {
      const stored = await window.lunabot.agent.setAvatar({ botId, image });
      const roomId = roomIdOfBot(roomsStore.rooms(), botId);
      if (roomId) {
        await roomsStore.refreshProfiles(roomId);
        return;
      }
      const next = toBotProfile(stored);
      setBotList((current) => {
        const existing = current.find((bot) => bot.id === botId);
        if (!existing) return [...current, createStoredProfile(next)];
        updateStored(existing, next);
        return current;
      });
    } catch (error) {
      appendUiError(botId, error, t("misc.app.status.avatarUpdateFailed"));
      throw error;
    }
  }

  function editBot(botId: string) {
    if (botSetupOpen() && creatingAgent()) return;
    selectBot(botId);
    setSettingsRequest({ botId, nonce: Date.now() });
  }

  async function duplicateBot(botId: string): Promise<void> {
    if (botSetupOpen() && creatingAgent()) return;
    if (duplicatingBotIds().has(botId)) return;
    setDuplicatingBotIds((current) => new Set(current).add(botId));
    try {
      const result = await window.lunabot.agent.duplicateBot(botId);
      const profile = toBotProfile(result.bot);
      setBotList((current) => [profile, ...current.filter((candidate) => candidate.id !== profile.id)]);
      setSidebarLayout(result.layout);
      selectBot(result.bot.id);
    } catch (error) {
      toast.error(t("misc.app.duplicateFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      setDuplicatingBotIds((current) => {
        const next = new Set(current);
        next.delete(botId);
        return next;
      });
    }
  }

  async function exportBot(botId: string): Promise<void> {
    try {
      await window.lunabot.agent.exportAgent(botId);
    } catch (error) {
      toast.error(t("misc.app.exportFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async function importBot(): Promise<void> {
    try {
      const bot = await window.lunabot.agent.importAgent();
      if (!bot) return;
      const profile = toBotProfile(bot);
      setBotList((current) => [profile, ...current.filter((candidate) => candidate.id !== profile.id)]);
      selectBot(bot.id);
    } catch (error) {
      toast.error(t("misc.app.importFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async function deleteBot(botId: string) {
    if (botSetupOpen() && creatingAgent()) return;
    try {
      await window.lunabot.agent.deleteBot(botId);
      const remaining = botList().filter((bot) => bot.id !== botId);
      setBotList(remaining);
      setActiveBotId((current) => (current === botId ? (remaining[0]?.id ?? "") : current));
      setSettingsRequest((current) => (current?.botId === botId ? null : current));
      setLiveMessages((current) => withoutBot(current, botId));
      deleteAgentMessageBodies(rawAgentMessageBodies, botId);
      setUiErrors((current) => withoutBot(current, botId));
      setConversationLoaded((current) => withoutBot(current, botId));
      setConversationRevisions((current) => withoutBot(current, botId));
      setActiveTurns((current) => withoutBot(current, botId));
      setFailedTurns((current) => withoutBot(current, botId));
      setUnreadReplies((current) => withoutBot(current, botId));
      setConversationReads((current) => withoutBot(current, botId));
      setRecentReplies((current) => withoutBot(current, botId));
      setQueues((current) => withoutBot(current, botId));
      setPendingPrompts((current) => withoutBot(current, botId));
      unpinSidebarItem({ kind: "agent", id: botId });
    } catch (error) {
      appendUiError(botId, error, t("misc.app.status.deleteFailed"));
      throw error;
    }
  }

  async function sendMessage(
    body: string,
    attachmentDraftIds: string[],
    replyToMessageId: string | null,
    target?: { botId: string },
  ): Promise<boolean> {
    const botId = target?.botId ?? activeBot()?.id;
    if (!botId || (!body.trim() && attachmentDraftIds.length === 0)) return false;
    return sendMessageToBot(botId, body, attachmentDraftIds, replyToMessageId);
  }

  async function sendMessageToBot(
    botId: string,
    body: string,
    attachmentDraftIds: string[],
    replyToMessageId: string | null = null,
  ): Promise<boolean> {
    try {
      const input = {
        botId,
        text: body.trim(),
        attachmentDraftIds,
        ...(replyToMessageId ? { replyToMessageId } : {}),
      };
      const receipt = await window.lunabot.agent.sendMessage(input);
      const errorKey = botId;
      setUiErrors((current) => ({ ...current, [errorKey]: [] }));
      try {
        await markAgentMessagesRead(botId, receipt.deliveries[0]?.id ?? receipt.messageId);
      } catch (error) {
        appendUiError(botId, error, t("misc.app.status.readStateFailed"));
      }
      return true;
    } catch (error) {
      appendUiError(botId, error, t("misc.app.status.sendFailed"));
      return false;
    }
  }

  async function markAgentMessagesRead(
    botId = activeBot()?.id,
    throughMessageId?: string | null,
    onSuccess?: (state: ConversationReadState) => void,
  ): Promise<void> {
    if (!botId) return;
    const requestKey = botId;
    const visibleMessageIdAtStart = latestVisibleAgentMessageId(botId);
    const boundary =
      throughMessageId ??
      liveMessages()
        [botId]?.filter((message) => !message.id.startsWith("thinking:") && !message.id.startsWith("ui-"))
        .at(-1)?.id ??
      null;
    const previousOperation = conversationReadOperations.get(requestKey) ?? Promise.resolve();
    const operation: Promise<void> = previousOperation
      .catch(() => undefined)
      .then(async () => {
        const state: ConversationReadState = await window.lunabot.agent.markConversationRead({
          botId,
          throughMessageId: boundary,
        });
        agentChatsToRetryRead.delete(requestKey);
        const nextState = isAgentChatReadable(botId)
          ? state
          : preserveKnownAgentUnread(state, boundary, liveMessages()[botId] ?? []);
        onSuccess?.(nextState);
        const trackedAutoRead = autoReadAgentMessages.get(requestKey);
        const supersededByAutoRead = Boolean(trackedAutoRead && trackedAutoRead.messageId !== boundary);
        if (!supersededByAutoRead) {
          applyConversationReadState(botId, nextState);
          if (nextState.unreadCount === 0) clearRecentReply(botId);
        }
        const latestMessageId = latestVisibleAgentMessageId(botId);
        if (
          conversationReadOperations.get(requestKey) === operation &&
          isAgentChatReadable(botId) &&
          latestMessageId &&
          latestMessageId !== boundary &&
          latestMessageId !== visibleMessageIdAtStart
        ) {
          queueMicrotask(() => {
            const latestVisibleMessageId = latestVisibleAgentMessageId(botId);
            if (
              isAgentChatReadable(botId) &&
              latestVisibleMessageId &&
              latestVisibleMessageId !== boundary &&
              latestVisibleMessageId !== visibleMessageIdAtStart
            ) {
              void markAgentMessagesRead(botId, latestVisibleMessageId).catch((error) =>
                appendUiError(botId, error, t("misc.app.status.readStateFailed")),
              );
            }
          });
        }
      });
    conversationReadOperations.set(requestKey, operation);
    try {
      await operation;
    } finally {
      if (conversationReadOperations.get(requestKey) === operation) conversationReadOperations.delete(requestKey);
    }
  }

  async function answerPrompt(answers: Record<string, string[]>): Promise<boolean> {
    const bot = activeBot();
    const prompt = bot ? pendingPrompts()[bot.id] : undefined;
    if (!bot || prompt?.type !== "prompt") return false;
    return submitPromptAnswers(bot.id, prompt, answers);
  }

  async function submitPromptAnswers(
    botId: string,
    prompt: PromptEvent,
    answers: Record<string, string[]>,
  ): Promise<boolean> {
    setSubmittedPromptRequests((current) => ({
      ...current,
      [botId]: promptRequestKey(prompt.turnId, prompt.requestId) ?? undefined,
    }));
    try {
      await window.lunabot.agent.respondToPrompt({
        requestId: prompt.requestId,
        answers,
      });
      return true;
    } catch (error) {
      setSubmittedPromptRequests((current) => ({ ...current, [botId]: undefined }));
      appendUiError(botId, error, t("misc.app.status.answerFailed"));
      return false;
    }
  }

  function presentPromptResolution(botId: string, turnId: string, requestId: string | number): void {
    const requestKey = promptRequestKey(turnId, requestId);
    if (!requestKey) return;
    const currentPrompt = pendingPrompts()[botId];
    if (
      currentPrompt?.type !== "prompt" ||
      promptRequestKey(currentPrompt.turnId, currentPrompt.requestId) !== requestKey
    ) {
      return;
    }
    const persisted = (liveMessages()[botId] ?? []).some(
      (message) => messagePromptRequestKey(message) === requestKey && message.questionPrompt?.resolution !== null,
    );
    if (persisted) {
      setPendingPrompts((current) => ({ ...current, [botId]: undefined }));
      setPresentedPromptResolutions((current) => ({ ...current, [botId]: undefined }));
      setSubmittedPromptRequests((current) => ({ ...current, [botId]: undefined }));
      return;
    }
    setPresentedPromptResolutions((current) => ({ ...current, [botId]: requestKey }));
  }

  async function respondToApprovalRequest(
    botId: string,
    requestId: string | number,
    decision: "accept" | "decline",
  ): Promise<boolean> {
    const approval = pendingApprovals()[botId];
    if (!approval || String(approval.requestId) !== String(requestId)) return false;
    try {
      await window.lunabot.agent.respondToApproval({
        requestId: approval.requestId,
        decision,
      });
      setPendingApprovals((current) => ({ ...current, [botId]: undefined }));
      return true;
    } catch (error) {
      appendUiError(botId, error, t("misc.app.status.approvalFailed"));
      return false;
    }
  }

  async function respondToApproval(decision: "accept" | "decline"): Promise<boolean> {
    const bot = activeBot();
    const approval = bot ? pendingApprovals()[bot.id] : undefined;
    if (!bot || !approval) return false;
    return respondToApprovalRequest(bot.id, approval.requestId, decision);
  }

  async function respondToBrowserTakeover(decision: "complete" | "cancel"): Promise<boolean> {
    const botId = browserTakeoverBotId();
    const event = botId ? pendingPrompts()[botId] : undefined;
    if (!botId || event?.type !== "browser-takeover-requested") return false;
    try {
      await window.lunabot.agent.respondToBrowserTakeover({ requestId: event.request.requestId, decision });
      setPendingPrompts((current) => ({ ...current, [botId]: undefined }));
      return true;
    } catch (error) {
      appendUiError(botId, error, t("misc.app.status.browserTakeoverFailed"));
      return false;
    }
  }

  function cancelQueuedMessage(deliveryId: string) {
    const bot = activeBot();
    if (!bot) return;
    void window.lunabot.agent.cancelQueuedMessage({ botId: bot.id, deliveryId }).catch((error) => {
      appendUiError(bot.id, error, t("misc.app.status.cancelFailed"));
    });
  }

  function steerQueuedMessage(deliveryId: string) {
    const bot = activeBot();
    const turnId = bot ? activeTurns()[bot.id] : null;
    if (!bot || !turnId) return;
    void window.lunabot.agent
      .steerQueuedMessage({ botId: bot.id, deliveryId, expectedTurnId: turnId })
      .catch((error) => {
        appendUiError(bot.id, error, t("misc.app.status.steerFailed"));
      });
  }

  async function updateQueuedMessage(
    deliveryId: string,
    text: string,
    keepAttachmentIds: string[],
    attachmentDraftIds: string[],
    target?: { botId: string },
  ): Promise<boolean> {
    const botId = target?.botId ?? activeBot()?.id;
    if (!botId) return false;
    try {
      const input = {
        botId,
        deliveryId,
        text,
        keepAttachmentIds,
        attachmentDraftIds,
      };
      await window.lunabot.agent.updateQueuedMessage(input);
      return true;
    } catch (error) {
      appendUiError(botId, error, t("misc.app.status.editFailed"));
      return false;
    }
  }

  function reorderQueue(deliveryIds: string[]) {
    const bot = activeBot();
    if (!bot) return;
    void window.lunabot.agent.reorderQueue({ botId: bot.id, deliveryIds }).catch((error) => {
      appendUiError(bot.id, error, t("misc.app.status.reorderFailed"));
    });
  }

  function stopActiveTurn() {
    const bot = activeBot();
    const turnId = bot ? activeTurns()[bot.id] : null;
    if (!bot || !turnId) return;
    void window.lunabot.agent.interrupt({ botId: bot.id, turnId }).catch((error) => {
      appendUiError(bot.id, error, t("misc.app.status.stopFailed"));
    });
  }

  async function refreshAccountUsage(): Promise<AccountUsage> {
    const usage = await window.lunabot.agent.getUsage();
    setAccountUsage(usage);
    return usage;
  }

  function appendUiError(botId: string, error: unknown, status: string) {
    const body = error instanceof Error ? error.message : String(error);
    const errorKey = botId;
    setUiErrors((current) => ({
      ...current,
      [errorKey]: [
        ...(current[errorKey] ?? []),
        {
          id: `ui-${Date.now()}-${Math.random()}`,
          author: "bot",
          body,
          time: formatTime(new Date().toISOString()),
          status,
          isError: true,
        },
      ],
    }));
  }

  const activeQueue = createMemo(() => {
    const bot = activeBot();
    return bot ? queues()[bot.id] : undefined;
  });
  const activeRoutineIds = createMemo(() => {
    const bot = activeBot();
    return bot ? routineIdsByConversation()[bot.id] : undefined;
  });
  // Every bot with a turn or a delivery in progress, room bots included; the sidebar states below only cover the general list.
  const workingBotIds = createMemo<ReadonlySet<string>>(() => {
    const working = new Set<string>();
    for (const [botId, turn] of Object.entries(activeTurns())) if (turn) working.add(botId);
    for (const [botId, queue] of Object.entries(queues())) {
      if (queue?.deliveries.some((delivery) => delivery.status === "starting" || delivery.status === "running")) {
        working.add(botId);
      }
    }
    return working;
  });
  const sidebarAgentStates = createMemo<Record<string, SidebarAgentState>>(() => {
    const turns = activeTurns();
    const backgroundTasksByBot = backgroundTasks();
    const queueSnapshots = queues();
    const unread = unreadReplies();
    const recent = recentReplies();
    const states: Record<string, SidebarAgentState> = {};
    for (const bot of botList()) {
      const isWorking =
        Boolean(turns[bot.id]) ||
        Boolean(
          queueSnapshots[bot.id]?.deliveries.some(
            (delivery) => delivery.status === "starting" || delivery.status === "running",
          ),
        );
      if (isWorking) states[bot.id] = { kind: "working" };
      else if ((backgroundTasksByBot[bot.id]?.length ?? 0) > 0) states[bot.id] = { kind: "background" };
      else if ((unread[bot.id] ?? 0) > 0) {
        states[bot.id] = { kind: "unread", count: unread[bot.id] ?? 1 };
      } else if (recent[bot.id]) states[bot.id] = { kind: "responded" };
    }
    return states;
  });

  function setSidebarCollapsed(collapsed: boolean) {
    setLeftPanelCollapsed(collapsed);
    window.localStorage.setItem(LEFT_PANEL_COLLAPSED_STORAGE_KEY, String(collapsed));
  }

  function expandSidebar(): void {
    setSidebarCollapsed(false);
    setLeftPanelAutoCompact(false);
  }

  async function saveSetup(preferredProvider: AgentProviderId): Promise<void> {
    const wasCompleted = setupState()?.completed === true;
    const state = await window.lunabot.saveSetup({ preferredProvider });
    flush(() => {
      setSetupState(state);
      setPermissionsOpen(false);
    });
    if (!wasCompleted && state.completed) {
    }
  }

  function applyProviderRuntimeSnapshot(snapshot: ProviderRuntimeSnapshot): void {
    setProviderRuntimeSnapshot((current) => {
      if (snapshot.revision < current.revision) return current;
      for (const provider of ["codex", "claude", "grok"] as const) {
        const previousPhase = current.providers[provider].phase;
        const nextPhase = snapshot.providers[provider].phase;
        if (previousPhase !== "downloading" && previousPhase !== "finishing") continue;
        if (nextPhase === "ready") {
        } else if (nextPhase === "download-error") {
        }
      }
      return snapshot;
    });
  }

  async function downloadProviderRuntime(provider: AgentProviderId): Promise<void> {
    if (!window.lunabot.providerRuntimes) throw new Error(t("misc.app.providerDownloadsUnavailable"));
    applyProviderRuntimeSnapshot(await window.lunabot.providerRuntimes.download(provider));
  }

  async function cancelProviderRuntimeDownload(provider: AgentProviderId): Promise<void> {
    if (!window.lunabot.providerRuntimes) throw new Error(t("misc.app.providerDownloadsUnavailable"));
    applyProviderRuntimeSnapshot(await window.lunabot.providerRuntimes.cancel(provider));
  }

  async function connectChatGPT(): Promise<void> {
    return connectProvider(window.lunabot.connectChatGPT);
  }

  async function connectClaude(): Promise<void> {
    return connectProvider(window.lunabot.connectClaude);
  }

  async function connectGrok(): Promise<void> {
    return connectProvider(window.lunabot.connectGrok);
  }

  async function connectProvider(connect: () => Promise<AgentStatus>): Promise<void> {
    const status = await connect();
    flush(() => applyAgentStatus(status));
  }

  async function refreshAgentStatus(): Promise<void> {
    const status = await window.lunabot.agent.getStatus();
    flush(() => applyAgentStatus(status));
  }

  async function runUpdateAction(): Promise<void> {
    const status = updateStatus();
    const phase = status.phase;
    if (phase === "ready") {
      await window.lunabot.update.install();
      return;
    }
    const action =
      phase === "available" || (phase === "error" && status.errorCode === "download_failed")
        ? ("download" as const)
        : ("check" as const);
    const next = action === "download" ? await window.lunabot.update.download() : await window.lunabot.update.check();
    setUpdateStatus(next);
  }

  function openAppSettings(trigger: HTMLElement | null): void {
    appSettingsRestoreTarget = trigger;
    setAppSettingsOpen(true);
  }

  function publishDynamicIslandPresentation(): void {
    if (props.landingPreview || dynamicIslandPresentationScheduled) return;
    dynamicIslandPresentationScheduled = true;
    queueMicrotask(() => {
      dynamicIslandPresentationScheduled = false;
      const presentation = dynamicIslandCoordinator.presentation();
      void window.lunabot.dynamicIsland.publishPresentation(presentation).catch(() => undefined);
    });
  }

  createEffect(
    () => {
      if (props.landingPreview) return null;
      return {
        bots: splitHiddenAgents(botList(), sidebarLayout().hiddenAgentIds).visible,
        activeTurns: activeTurns(),
        queues: queues(),
        unreadReplies: unreadReplies(),
        unreadMessageIds: Object.fromEntries(
          Object.entries(conversationReads()).map(([botId, state]) => [botId, state.firstUnreadMessageId]),
        ),
        liveMessages: liveMessages(),
        pendingPrompts: pendingPrompts(),
        pendingApprovals: pendingApprovals(),
        failedTurns: failedTurns(),
      };
    },
    (input) => {
      if (!input) return;
      dynamicIslandCoordinator.replaceServer(input);
      publishDynamicIslandPresentation();
    },
  );

  onSettled(() => {
    if (props.landingPreview) return;
    return window.lunabot.dynamicIsland.onAction((action) => {
      void handleDynamicIslandAction(action).catch((error) => {
        toast.error(t("misc.app.dynamicIslandActionFailed"), {
          description: error instanceof Error ? error.message : String(error),
        });
      });
    });
  });

  async function handleDynamicIslandAction(action: DynamicIslandAction): Promise<void> {
    if (action.type === "open-app") return;
    if (action.type === "answer-prompt") {
      dynamicIslandCoordinator.resolveAction(action);
      const prompt = pendingPrompts()[action.botId];
      if (prompt?.type === "prompt" && String(prompt.requestId) === String(action.requestId)) {
        setPendingPrompts((current) => ({ ...current, [action.botId]: undefined }));
        setSubmittedPromptRequests((current) => ({
          ...current,
          [action.botId]: promptRequestKey(prompt.turnId, prompt.requestId) ?? undefined,
        }));
      }
      publishDynamicIslandPresentation();
      return;
    }
    if (action.type === "respond-approval") {
      dynamicIslandCoordinator.resolveAction(action);
      setPendingApprovals((current) => {
        const approval = current[action.botId];
        return approval && String(approval.requestId) === String(action.requestId)
          ? { ...current, [action.botId]: undefined }
          : current;
      });
      publishDynamicIslandPresentation();
      return;
    }
    selectBot(action.botId);
    if (action.type === "open-message") await openAgentMessage(action.botId, action.messageId);
    if (action.type === "open-failure") {
      try {
        await window.lunabot.agent.acknowledgeFailedTurn({ botId: action.botId, turnId: action.turnId });
      } catch (error) {
        appendUiError(action.botId, error, t("misc.app.status.acknowledgeFailed"));
        return;
      }
      setFailedTurns((current) =>
        current[action.botId] === action.turnId ? withoutBot(current, action.botId) : current,
      );
      dynamicIslandCoordinator.resolveAction(action);
      publishDynamicIslandPresentation();
    }
  }

  async function mutateSidebarLayout(action: SidebarLayoutAction): Promise<void> {
    const layout = await window.lunabot.agent.mutateSidebarLayout(action);
    setSidebarLayout(layout);
  }

  function toggleSidebarSection(sectionId: string): void {
    setSidebarCollapsedSectionIds((current) => {
      const values = new Set(current);
      if (values.has(sectionId)) values.delete(sectionId);
      else values.add(sectionId);
      const next = [...values];
      writeSidebarCollapsed(next);
      return next;
    });
  }

  function updateSidebarPins(update: (items: SidebarPinnedItem[]) => SidebarPinnedItem[]): void {
    setSidebarPins((current) => {
      const items = normalizeSidebarPinnedItems(update(current));
      writeSidebarPins(items);
      return items;
    });
  }

  function pinSidebarItem(item: SidebarPinnedItem): void {
    updateSidebarPins((items) =>
      items.length >= MAX_SIDEBAR_PINNED_ITEMS ||
      items.some((candidate) => sidebarPinnedItemKey(candidate) === sidebarPinnedItemKey(item))
        ? items
        : [...items, item],
    );
  }

  function unpinSidebarItem(item: SidebarPinnedItem): void {
    const key = sidebarPinnedItemKey(item);
    updateSidebarPins((items) => items.filter((candidate) => sidebarPinnedItemKey(candidate) !== key));
  }

  function reorderPinnedSidebarItems(items: SidebarPinnedItem[]): void {
    updateSidebarPins(() => items);
  }

  return {
    props,
    appInfo,
    agentStatus,
    providerRuntimeStatuses: () => providerRuntimeSnapshot().providers,
    providerRuntimeDownloadsAvailable: () => Boolean(window.lunabot.providerRuntimes),
    connectChatGPT,
    connectClaude,
    connectGrok,
    refreshAgentStatus,
    downloadProviderRuntime,
    cancelProviderRuntimeDownload,
    setupState,
    saveSetup,
    leftPanelCompact,
    leftPanelWidth,
    setLeftPanelWidth,
    LEFT_PANEL_COMPACT,
    LEFT_PANEL_DEFAULT,
    LEFT_PANEL_MIN,
    LEFT_PANEL_MAX,
    LEFT_PANEL_STORAGE_KEY,
    LEFT_PANEL_COLLAPSE_THRESHOLD,
    LEFT_PANEL_EXPAND_THRESHOLD,
    botList,
    activeBot,
    sidebarAgentStates,
    workingBotIds,
    sidebarLayout,
    collapsedSidebarSectionIds: sidebarCollapsedSectionIds,
    mutateSidebarLayout,
    toggleSidebarSection,
    pinnedSidebarItems: sidebarPins,
    pinSidebarItem,
    unpinSidebarItem,
    reorderPinnedSidebarItems,
    selectBot,
    openLunaBotSetup,
    cancelBotSetup,
    openNewBotFromRoomRequest,
    roomsStore,
    roomRequestCreation,
    editBot,
    duplicateBot,
    duplicatingBotIds,
    exportBot,
    importBot,
    deleteBot,
    setSidebarCollapsed,
    expandSidebar,
    accountUsage,
    updateStatus,
    refreshAccountUsage,
    runUpdateAction,
    setPermissionsOpen,
    permissionsOpen,
    appSettingsOpen,
    setAppSettingsOpen,
    generalSettings,
    setGeneralSettings: updateGeneralSettings,
    openAppSettings,
    appSettingsRestoreTarget: () => appSettingsRestoreTarget,
    modelOptions,
    activeMessages,
    conversationReferences,
    conversationReads,
    conversationLoaded,
    conversationPages,
    conversationWindowModes,
    conversationOlderLoading,
    conversationOlderErrors,
    activeQueue,
    activeRoutineIds,
    browserTabs,
    activeBrowserTabId,
    browserVisibilitySuspended,
    browserControlState,
    pendingPrompts,
    pendingApprovals,
    activeTurns,
    backgroundTasks,
    botSetupOpen,
    botSetupDraft,
    setBotSetupDraft,
    botSetupError,
    globalSearchOpen,
    creatingAgent,
    settingsRequest,
    messageFocusRequest,
    createAgent,
    updateBot,
    setAgentAvatar,
    sendMessage,
    markAgentMessagesRead,
    loadOlderAgentMessages,
    loadLatestAgentMessages,
    searchAgentMessages,
    openAgentMessage,
    answerPrompt,
    presentPromptResolution,
    respondToApproval,
    browserTakeoverBotId,
    respondToBrowserTakeover,
    cancelQueuedMessage,
    steerQueuedMessage,
    updateQueuedMessage,
    reorderQueue,
    activateBrowserTab,
    closeBrowserTab,
    stopActiveTurn,
    searchGlobalMessages,
    setGlobalSearchVisibility,
    selectGlobalSearchMessage,
  };
}

export type AppController = ReturnType<typeof createAppController>;

const AppControllerContext = createContext<AppController>();

export function useAppController(): AppController {
  const controller = useContext(AppControllerContext);
  if (!controller) throw new Error("App controller is unavailable outside App.");
  return controller;
}

/** @internal Test seam for remounting shell views without remounting their controller. */
export function AppControllerProvider(props: ParentProps<{ controller: AppController }>) {
  return <AppControllerContext value={props.controller}>{props.children}</AppControllerContext>;
}

export function App(props: AppProps = {}) {
  const controller = createAppController(props);
  return (
    <>
      <AppControllerProvider controller={controller}>
        <AppView />
      </AppControllerProvider>
      <Toaster />
    </>
  );
}
