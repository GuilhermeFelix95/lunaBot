import {
  type AccountUsage,
  type AgentModelOption,
  type AgentStatus,
  type AttachmentImportEvent,
  type BotMemory,
  type BotSummary,
  type BrowserPreview,
  type ComputerUseMacSetupState,
  type ConversationMessage,
  type ConversationPage,
  type ConversationReadState,
  type ConversationSearchPage,
  type ConversationWithReadState,
  type DraftAttachment,
  type DuplicateBotResult,
  type DynamicIslandAction,
  type DynamicIslandGeometry,
  type DynamicIslandPreference,
  type DynamicIslandPresentation,
  type FilePreview,
  type ImportAttachmentsInput,
  IPC_CHANNELS,
  isAgentModel,
  isAgentNotificationLevel,
  isBotMemory,
  isConversationMessage,
  isDynamicIslandAction,
  isDynamicIslandNotchSize,
  isDynamicIslandPreference,
  isDynamicIslandPresentation,
  isReasoningEffort,
  isRoutine,
  isRoutineRun,
  isSidebarLayoutSnapshot,
  type LunaBotDesktopApi,
  type PinnedMessagesSnapshot,
  type ProviderRuntimeSnapshot,
  type QueuedMessageReceipt,
  type QueueSnapshot,
  type Routine,
  type RoutineRun,
  type SidebarLayoutSnapshot,
  type UpdateStatus,
} from "@lunabot/contracts/ipc";
import {
  type DynamicRecord,
  isBoolean,
  isDynamicRecord,
  isNumber,
  isOneOf,
  isString,
} from "@lunabot/contracts/runtime-values";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import { clipboardFiles } from "./clipboard-files";
import { invokeWith } from "./invoke";

const attachmentImportListeners = new Set<(event: AttachmentImportEvent) => void>();

function invokeAgent<TResult>(
  channel: string,
  payload: unknown = null,
  decoder: (value: unknown) => TResult,
): Promise<TResult> {
  return invokeWith(ipcRenderer.invoke.bind(ipcRenderer), channel, payload, decoder);
}

function decodeComputerUseMacSetupState(value: unknown): ComputerUseMacSetupState {
  if (
    !isDynamicRecord(value) ||
    !isOneOf(["available", "unavailable", "unsupported"] as const, value.status) ||
    !isString(value.helperName) ||
    (value.helperIconDataUrl !== null && !isString(value.helperIconDataUrl)) ||
    (value.message !== null && !isString(value.message))
  ) {
    throw new Error("Invalid Computer Use macOS setup state.");
  }
  return {
    status: value.status,
    helperName: value.helperName,
    helperIconDataUrl: value.helperIconDataUrl,
    message: value.message,
  };
}

function emitAttachmentImport(event: AttachmentImportEvent): void {
  for (const listener of attachmentImportListeners) listener(event);
}

async function importFiles(files: File[]): Promise<void> {
  if (files.length === 0) return;
  const requestId = crypto.randomUUID();
  emitAttachmentImport({ type: "started", requestId });
  try {
    const input: ImportAttachmentsInput = { paths: [], data: [] };
    for (const file of files) {
      const path = webUtils.getPathForFile(file);
      if (path) input.paths.push(path);
      else {
        input.data.push({
          name: file.name || `pasted-${Date.now()}.png`,
          mimeType: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        });
      }
    }
    const attachments = await invokeAgent(IPC_CHANNELS.agentImportAttachments, input, decodeDraftAttachments);
    emitAttachmentImport({ type: "completed", requestId, attachments });
  } catch (error) {
    emitAttachmentImport({
      type: "error",
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function record(value: unknown, label: string): DynamicRecord {
  if (!isDynamicRecord(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

function decodeBrowserPreview(value: unknown): BrowserPreview {
  const preview = record(value, "browser preview");
  const dataUrl = requiredString(preview, "dataUrl");
  const width = requiredNumber(preview, "width");
  const height = requiredNumber(preview, "height");
  if (
    dataUrl.length > 2_000_000 ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl) ||
    !Number.isSafeInteger(width) ||
    width <= 0 ||
    width > 960 ||
    !Number.isSafeInteger(height) ||
    height <= 0 ||
    height > 600
  ) {
    throw new Error("Invalid browser preview.");
  }
  return { dataUrl, width, height };
}

function nullableString(value: unknown, label: string): value is string | null {
  if (value !== null && !isString(value)) throw new Error(`Invalid ${label}.`);
  return true;
}

function decodeVoid(value: unknown): undefined {
  if (value !== undefined && value !== null) throw new Error("IPC returned unexpected data.");
  return undefined;
}

function decodeDynamicIslandPreference(value: unknown): DynamicIslandPreference {
  if (!isDynamicIslandPreference(value)) throw new Error("Invalid Dynamic Island preference response.");
  return value;
}

function decodeDynamicIslandGeometry(value: unknown): DynamicIslandGeometry {
  if (value === null) return null;
  if (!isDynamicIslandNotchSize(value)) throw new Error("Invalid Dynamic Island geometry.");
  return value;
}

function decodeDynamicIslandPresentation(value: unknown): DynamicIslandPresentation {
  if (!isDynamicIslandPresentation(value)) throw new Error("Invalid Dynamic Island presentation.");
  return value;
}

function decodeDynamicIslandAction(value: unknown): DynamicIslandAction {
  if (isDynamicIslandAction(value)) return value;
  throw new Error("Invalid Dynamic Island action.");
}

function decodeRoutine(value: unknown): Routine {
  if (!isRoutine(value)) throw new Error("Invalid routine response.");
  return value;
}

function decodeRoutines(value: unknown): Routine[] {
  if (!Array.isArray(value) || !value.every(isRoutine)) throw new Error("Invalid routine list response.");
  return value;
}

function decodeRoutineRun(value: unknown): RoutineRun {
  if (!isRoutineRun(value)) throw new Error("Invalid routine run response.");
  return value;
}

function decodeRoutineRuns(value: unknown): RoutineRun[] {
  if (!Array.isArray(value) || !value.every(isRoutineRun)) throw new Error("Invalid routine history response.");
  return value;
}

function decodeFilePreview(value: unknown): FilePreview {
  const preview = record(value, "file preview");
  if (
    !isString(preview.name) ||
    !isNumber(preview.size) ||
    !isString(preview.mimeType) ||
    (preview.previewKind !== "markdown" &&
      preview.previewKind !== "text" &&
      preview.previewKind !== "image" &&
      preview.previewKind !== "pdf" &&
      preview.previewKind !== "none") ||
    (preview.bytes !== null && !(preview.bytes instanceof Uint8Array))
  ) {
    throw new Error("Invalid file preview response.");
  }
  return {
    name: preview.name,
    size: preview.size,
    mimeType: preview.mimeType,
    previewKind: preview.previewKind,
    bytes: preview.bytes,
  };
}

function decodeAgentStatus(value: unknown): AgentStatus {
  if (!isAgentStatusValue(value)) throw new Error("Invalid agent status response.");
  return value;
}

function decodeProviderRuntimeSnapshot(value: unknown): ProviderRuntimeSnapshot {
  if (!isDynamicRecord(value) || !isNumber(value.revision) || !isDynamicRecord(value.providers)) {
    throw new Error("Invalid provider runtime response.");
  }
  const decoded: Partial<ProviderRuntimeSnapshot["providers"]> = {};
  for (const provider of ["codex", "claude", "grok"] as const) {
    const status = value.providers[provider];
    if (
      !isDynamicRecord(status) ||
      !isOneOf(["not-downloaded", "downloading", "finishing", "ready", "download-error"] as const, status.phase) ||
      (status.progress !== null && !isNumber(status.progress)) ||
      !nullableString(status.message, "provider runtime message") ||
      !nullableString(status.version, "provider runtime version")
    ) {
      throw new Error("Invalid provider runtime response.");
    }
    decoded[provider] = {
      phase: status.phase,
      progress: status.progress,
      message: status.message,
      version: status.version,
    };
  }
  const { codex, claude, grok } = decoded;
  if (!codex || !claude || !grok) throw new Error("Invalid provider runtime response.");
  return { revision: value.revision, providers: { codex, claude, grok } };
}

function isAgentStatusValue(value: unknown): value is AgentStatus {
  if (!isDynamicRecord(value) || !isDynamicRecord(value.auth)) return false;
  if (!isDynamicRecord(value.capabilities)) return false;
  return (
    isString(value.phase) &&
    (value.cliVersion === null || isString(value.cliVersion)) &&
    isString(value.auth.kind) &&
    isString(value.capabilities.chat) &&
    isString(value.capabilities.browser) &&
    isString(value.capabilities.computerUse) &&
    nullableString(value.message, "status message") &&
    value.fullAccess === true
  );
}

function decodeAccountUsage(value: unknown): AccountUsage {
  if (!isAccountUsageValue(value)) throw new Error("Invalid agent usage response.");
  return value;
}

function isAccountUsageValue(value: unknown): value is AccountUsage {
  return (
    isDynamicRecord(value) &&
    Array.isArray(value.limits) &&
    value.limits.every(
      (limit) =>
        isDynamicRecord(limit) &&
        isString(limit.id) &&
        (limit.primary === null || isDynamicRecord(limit.primary)) &&
        (limit.secondary === null || isDynamicRecord(limit.secondary)),
    )
  );
}

function decodeAgentModels(value: unknown): AgentModelOption[] {
  if (!isAgentModelList(value)) throw new Error("Invalid agent model response.");
  return value;
}

function isAgentModelList(value: unknown): value is AgentModelOption[] {
  return (
    Array.isArray(value) &&
    value.every(
      (model) =>
        isDynamicRecord(model) &&
        isAgentModel(model.id) &&
        isString(model.name) &&
        isString(model.description) &&
        isReasoningEffort(model.defaultReasoningEffort) &&
        Array.isArray(model.supportedReasoningEfforts) &&
        model.supportedReasoningEfforts.every(isReasoningEffort),
    )
  );
}

function decodeBot(value: unknown): BotSummary {
  if (!isBotSummary(value)) throw new Error("Invalid agent response.");
  return value;
}

function isBotSummary(value: unknown): value is BotSummary {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.title) &&
    isString(value.description) &&
    isAgentNotificationLevel(value.notifications) &&
    isAgentModel(value.model) &&
    isReasoningEffort(value.reasoningEffort) &&
    nullableString(value.threadId, "thread ID") &&
    isString(value.workspacePath) &&
    isString(value.preview) &&
    nullableString(value.updatedAt, "updated at") &&
    isString(value.avatarSeed) &&
    (value.avatarHue === null || isNumber(value.avatarHue)) &&
    nullableString(value.avatarUrl, "avatar URL")
  );
}

function decodeBots(value: unknown): BotSummary[] {
  if (!Array.isArray(value) || !value.every(isBotSummary)) {
    throw new Error("Invalid agent list response.");
  }
  return value;
}

function decodeMemory(value: unknown): BotMemory {
  if (!isBotMemory(value)) throw new Error("Invalid agent memory response.");
  return value;
}

function decodeMemories(value: unknown): BotMemory[] {
  if (!Array.isArray(value) || !value.every(isBotMemory)) throw new Error("Invalid agent memories response.");
  return value;
}

function decodeSidebarLayout(value: unknown): SidebarLayoutSnapshot {
  if (!isSidebarLayoutSnapshot(value)) throw new Error("Invalid sidebar layout response.");
  return value;
}

function decodeOptionalBot(value: unknown): BotSummary | null {
  return value === null ? null : decodeBot(value);
}

function decodeExportResult(value: unknown): boolean {
  if (!isBoolean(value)) throw new Error("Invalid agent export response.");
  return value;
}

function decodeDuplicateBotResult(value: unknown): DuplicateBotResult {
  const item = record(value, "agent duplication");
  return { bot: decodeBot(item.bot), layout: decodeSidebarLayout(item.layout) };
}

function decodeConversation(value: unknown): ConversationWithReadState {
  if (!isConversationWithReadState(value)) throw new Error("Invalid conversation response.");
  return value;
}

function decodeConversationPage(value: unknown): ConversationPage {
  if (!isDynamicRecord(value) || !isString(value.botId) || !Array.isArray(value.messages)) {
    throw new Error("Invalid conversation page response.");
  }
  const pageInfo = record(value.pageInfo, "conversation page info");
  return {
    botId: value.botId,
    threadId: requiredNullableString(value, "threadId"),
    activeTurnId: requiredNullableString(value, "activeTurnId"),
    revision: requiredNumber(value, "revision"),
    messages: decodeConversationMessages(value.messages),
    references: decodeConversationReferences(value.references),
    pageInfo: {
      hasOlder: requiredBoolean(pageInfo, "hasOlder"),
      olderCursor: requiredNullableString(pageInfo, "olderCursor"),
    },
    ...(value.readState === undefined ? {} : { readState: decodeReadState(value.readState) }),
  };
}

function decodeConversationSearchPage(value: unknown): ConversationSearchPage {
  const item = record(value, "conversation search page");
  if (!Array.isArray(item.results)) throw new Error("Invalid conversation search results.");
  return {
    results: item.results.map((value) => {
      const result = record(value, "conversation search result");
      if (!isConversationMessage(result.message)) throw new Error("Invalid conversation search message.");
      return { botId: requiredString(result, "botId"), message: result.message };
    }),
    total: requiredNumber(item, "total"),
    nextCursor: requiredNullableString(item, "nextCursor"),
  };
}

function decodeConversationMessages(value: unknown): ConversationMessage[] {
  if (!Array.isArray(value) || !value.every(isConversationMessage)) {
    throw new Error("Invalid conversation messages.");
  }
  return value;
}

function decodeConversationReferences(value: unknown): Record<string, ConversationMessage> {
  const references = record(value, "conversation references");
  const decoded: Record<string, ConversationMessage> = {};
  for (const [messageId, message] of Object.entries(references)) {
    if (!isConversationMessage(message)) throw new Error("Invalid conversation reference.");
    decoded[messageId] = message;
  }
  return decoded;
}

function isConversationWithReadState(value: unknown): value is ConversationWithReadState {
  return (
    isDynamicRecord(value) &&
    isString(value.botId) &&
    nullableString(value.threadId, "thread ID") &&
    nullableString(value.activeTurnId, "active turn ID") &&
    isNumber(value.revision) &&
    Array.isArray(value.messages) &&
    isDynamicRecord(value.readState)
  );
}

function decodeReadState(value: unknown): ConversationReadState {
  const item = record(value, "conversation read state");
  return {
    unreadCount: requiredNumber(item, "unreadCount"),
    firstUnreadMessageId: requiredNullableString(item, "firstUnreadMessageId"),
    throughMessageId: requiredNullableString(item, "throughMessageId"),
  };
}

function decodeReadStates(value: unknown): Record<string, ConversationReadState> {
  const item = record(value, "conversation reads");
  return Object.fromEntries(Object.entries(item).map(([botId, state]) => [botId, decodeReadState(state)]));
}

function decodeAttachments(value: unknown): DraftAttachment[] {
  if (!Array.isArray(value) || !value.every(isDraftAttachment)) {
    throw new Error("Invalid attachment response.");
  }
  return value;
}

function decodeDraftAttachments(value: unknown): DraftAttachment[] {
  return decodeAttachments(value);
}

function isDraftAttachment(value: unknown): value is DraftAttachment {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isNumber(value.size) &&
    isString(value.kind) &&
    isString(value.mimeType) &&
    isString(value.previewKind) &&
    nullableString(value.previewUrl, "preview URL")
  );
}

function decodeReceipt(value: unknown): QueuedMessageReceipt {
  if (!isQueuedMessageReceipt(value)) {
    throw new Error("Invalid queued message response.");
  }
  return value;
}

function isQueuedMessageReceipt(value: unknown): value is QueuedMessageReceipt {
  return isDynamicRecord(value) && isString(value.messageId) && Array.isArray(value.deliveries);
}

function decodeQueue(value: unknown): QueueSnapshot {
  if (!isQueueSnapshot(value)) {
    throw new Error("Invalid queue response.");
  }
  return value;
}

function isQueueSnapshot(value: unknown): value is QueueSnapshot {
  return isDynamicRecord(value) && isString(value.botId) && Array.isArray(value.deliveries);
}

function decodePinnedMessages(value: unknown): PinnedMessagesSnapshot {
  if (!isPinnedMessagesSnapshot(value)) {
    throw new Error("Invalid pinned messages response.");
  }
  return value;
}

function isPinnedMessagesSnapshot(value: unknown): value is PinnedMessagesSnapshot {
  return isDynamicRecord(value) && isString(value.botId) && Array.isArray(value.pins);
}

function requiredNumber(value: DynamicRecord, field: string): number {
  if (!isNumber(value[field])) throw new Error(`Invalid ${field}.`);
  return value[field];
}

function requiredString(value: DynamicRecord, field: string): string {
  const fieldValue = value[field];
  if (!isString(fieldValue)) throw new Error(`Invalid ${field}.`);
  return fieldValue;
}

function requiredBoolean(value: DynamicRecord, field: string): boolean {
  if (!isBoolean(value[field])) throw new Error(`Invalid ${field}.`);
  return value[field];
}

function requiredNullableString(value: DynamicRecord, field: string): string | null {
  const item = value[field];
  if (item !== null && !isString(item)) throw new Error(`Invalid ${field}.`);
  return item;
}

function isConversationDropTarget(target: EventTarget | null): boolean {
  const conversation = document.querySelector(".conversation-panel");
  return target instanceof Node && Boolean(conversation?.contains(target));
}

window.addEventListener("dragover", (event) => {
  if (!isConversationDropTarget(event.target)) return;
  if ([...(event.dataTransfer?.items ?? [])].some((item) => item.kind === "file")) {
    event.preventDefault();
  }
});
window.addEventListener("drop", (event) => {
  if (!isConversationDropTarget(event.target)) return;
  const files = [...(event.dataTransfer?.files ?? [])];
  if (!files.length) return;
  event.preventDefault();
  void importFiles(files);
});
window.addEventListener("paste", (event) => {
  const files = clipboardFiles(event.clipboardData);
  if (files.length) {
    event.preventDefault();
    void importFiles(files);
  }
});
window.addEventListener("change", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.dataset.lunabotAttachmentPicker !== "true") return;
  void importFiles([...(input.files ?? [])]);
});

const lunabotApi: LunaBotDesktopApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.getAppInfo),
  getSetupState: () => ipcRenderer.invoke(IPC_CHANNELS.getSetupState),
  saveSetup: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveSetup, input),
  app: {
    setTheme: (input) => ipcRenderer.invoke(IPC_CHANNELS.setAppTheme, input),
    setLocale: (input) => ipcRenderer.invoke(IPC_CHANNELS.setAppLocale, input),
  },
  dynamicIsland: {
    getPreference: () =>
      ipcRenderer.invoke(IPC_CHANNELS.dynamicIslandGetPreference).then(decodeDynamicIslandPreference),
    setPreference: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.dynamicIslandSetPreference, input).then(decodeDynamicIslandPreference),
    publishPresentation: (presentation) =>
      ipcRenderer.invoke(IPC_CHANNELS.dynamicIslandPublishPresentation, presentation).then(decodeVoid),
    getPresentation: () =>
      ipcRenderer.invoke(IPC_CHANNELS.dynamicIslandGetPresentation).then(decodeDynamicIslandPresentation),
    onPreference: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, preference: unknown) =>
        listener(decodeDynamicIslandPreference(preference));
      ipcRenderer.on(IPC_CHANNELS.dynamicIslandPreference, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.dynamicIslandPreference, handler);
    },
    onPresentation: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, presentation: unknown) =>
        listener(decodeDynamicIslandPresentation(presentation));
      ipcRenderer.on(IPC_CHANNELS.dynamicIslandPresentation, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.dynamicIslandPresentation, handler);
    },
    onGeometry: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, geometry: unknown) =>
        listener(decodeDynamicIslandGeometry(geometry));
      ipcRenderer.on(IPC_CHANNELS.dynamicIslandGeometry, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.dynamicIslandGeometry, handler);
    },
    performAction: (action) => ipcRenderer.invoke(IPC_CHANNELS.dynamicIslandPerformAction, action).then(decodeVoid),
    performHaptic: () => ipcRenderer.invoke(IPC_CHANNELS.dynamicIslandPerformHaptic).then(decodeVoid),
    onAction: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, action: unknown) =>
        listener(decodeDynamicIslandAction(action));
      ipcRenderer.on(IPC_CHANNELS.dynamicIslandAction, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.dynamicIslandAction, handler);
    },
    setInteractive: (input) => ipcRenderer.invoke(IPC_CHANNELS.dynamicIslandSetInteractive, input).then(decodeVoid),
  },
  getComputerUseMacSetupState: () =>
    ipcRenderer.invoke(IPC_CHANNELS.computerUseGetMacSetupState).then(decodeComputerUseMacSetupState),
  openComputerUsePermissionSetup: (permission) =>
    ipcRenderer.invoke(IPC_CHANNELS.computerUseOpenMacPermissionSetup, permission).then(decodeComputerUseMacSetupState),
  startComputerUseHelperDrag: () => ipcRenderer.invoke(IPC_CHANNELS.computerUseStartHelperDrag).then(decodeVoid),
  revealComputerUseHelper: () => ipcRenderer.invoke(IPC_CHANNELS.computerUseRevealHelper).then(decodeVoid),
  closeComputerUsePermissionSetup: () =>
    ipcRenderer.invoke(IPC_CHANNELS.computerUseCloseMacPermissionSetup).then(decodeVoid),
  openExternal: (destination) => ipcRenderer.invoke(IPC_CHANNELS.openExternal, destination),
  connectChatGPT: () => ipcRenderer.invoke(IPC_CHANNELS.connectChatGPT),
  connectClaude: () => ipcRenderer.invoke(IPC_CHANNELS.connectClaude),
  connectGrok: () => ipcRenderer.invoke(IPC_CHANNELS.connectGrok),
  refreshAgentProviders: () => ipcRenderer.invoke(IPC_CHANNELS.refreshAgentProviders),
  providerRuntimes: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.providerRuntimesGetStatus).then(decodeProviderRuntimeSnapshot),
    download: (provider) =>
      ipcRenderer.invoke(IPC_CHANNELS.providerRuntimesDownload, provider).then(decodeProviderRuntimeSnapshot),
    cancel: (provider) =>
      ipcRenderer.invoke(IPC_CHANNELS.providerRuntimesCancel, provider).then(decodeProviderRuntimeSnapshot),
    onEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, snapshot: unknown) =>
        listener(decodeProviderRuntimeSnapshot(snapshot));
      ipcRenderer.on(IPC_CHANNELS.providerRuntimesEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.providerRuntimesEvent, handler);
    },
  },
  openUrl: (url) => ipcRenderer.invoke(IPC_CHANNELS.openUrl, url),
  voice: {
    getModelStatus: () => ipcRenderer.invoke(IPC_CHANNELS.voiceGetModelStatus),
    prepareModel: () => ipcRenderer.invoke(IPC_CHANNELS.voicePrepareModel),
    transcribe: (input) => ipcRenderer.invoke(IPC_CHANNELS.voiceTranscribe, input),
    onModelStatus: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: Parameters<typeof listener>[0]) => listener(status);
      ipcRenderer.on(IPC_CHANNELS.voiceModelStatus, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.voiceModelStatus, handler);
    },
  },
  agent: {
    getStatus: () => invokeAgent(IPC_CHANNELS.agentGetStatus, null, decodeAgentStatus),
    getUsage: () => invokeAgent(IPC_CHANNELS.agentGetUsage, null, decodeAccountUsage),
    listModels: () => invokeAgent(IPC_CHANNELS.agentListModels, null, decodeAgentModels),
    listBots: () => invokeAgent(IPC_CHANNELS.agentListBots, null, decodeBots),
    getSidebarLayout: () => invokeAgent(IPC_CHANNELS.agentGetSidebarLayout, null, decodeSidebarLayout),
    mutateSidebarLayout: (action) => invokeAgent(IPC_CHANNELS.agentMutateSidebarLayout, action, decodeSidebarLayout),
    createBot: (input) => invokeAgent(IPC_CHANNELS.agentCreateBot, input, decodeBot),
    duplicateBot: (botId) => invokeAgent(IPC_CHANNELS.agentDuplicateBot, botId, decodeDuplicateBotResult),
    updateBot: (input) => invokeAgent(IPC_CHANNELS.agentUpdateBot, input, decodeBot),
    setAvatar: (input) => invokeAgent(IPC_CHANNELS.agentSetAvatar, input, decodeBot),
    deleteBot: (botId) => invokeAgent(IPC_CHANNELS.agentDeleteBot, botId, decodeVoid),
    exportAgent: (botId) => invokeAgent(IPC_CHANNELS.agentExportAgent, botId, decodeExportResult),
    importAgent: () => invokeAgent(IPC_CHANNELS.agentImportAgent, null, decodeOptionalBot),
    listMemories: (botId) => invokeAgent(IPC_CHANNELS.agentListMemories, botId, decodeMemories),
    createMemory: (input) => invokeAgent(IPC_CHANNELS.agentCreateMemory, input, decodeMemory),
    updateMemory: (input) => invokeAgent(IPC_CHANNELS.agentUpdateMemory, input, decodeMemory),
    deleteMemory: (input) => invokeAgent(IPC_CHANNELS.agentDeleteMemory, input, decodeVoid),
    clearMemories: (botId) => invokeAgent(IPC_CHANNELS.agentClearMemories, botId, decodeVoid),
    listRoutines: (botId) => invokeAgent(IPC_CHANNELS.agentListRoutines, botId, decodeRoutines),
    createRoutine: (input) => invokeAgent(IPC_CHANNELS.agentCreateRoutine, input, decodeRoutine),
    updateRoutine: (input) => invokeAgent(IPC_CHANNELS.agentUpdateRoutine, input, decodeRoutine),
    deleteRoutine: (input) => invokeAgent(IPC_CHANNELS.agentDeleteRoutine, input, decodeVoid),
    testRoutine: (input) => invokeAgent(IPC_CHANNELS.agentTestRoutine, input, decodeRoutineRun),
    listRoutineRuns: (input) => invokeAgent(IPC_CHANNELS.agentListRoutineRuns, input, decodeRoutineRuns),
    readConversation: (botId) => invokeAgent(IPC_CHANNELS.agentReadConversation, botId, decodeConversation),
    readConversationPage: (input) => invokeAgent(IPC_CHANNELS.agentReadConversationPage, input, decodeConversationPage),
    searchConversationMessages: (input) =>
      invokeAgent(IPC_CHANNELS.agentSearchConversationMessages, input, decodeConversationSearchPage),
    listConversationReads: () => invokeAgent(IPC_CHANNELS.agentListConversationReads, null, decodeReadStates),
    markConversationRead: (input) => invokeAgent(IPC_CHANNELS.agentMarkConversationRead, input, decodeReadState),
    chooseAttachments: (input) => invokeAgent(IPC_CHANNELS.agentChooseAttachments, input, decodeAttachments),
    onAttachmentImport: (listener) => {
      attachmentImportListeners.add(listener);
      return () => attachmentImportListeners.delete(listener);
    },
    discardDraftAttachment: (attachmentId) =>
      invokeAgent(IPC_CHANNELS.agentDiscardDraftAttachment, attachmentId, decodeVoid),
    openAttachment: (input) => invokeAgent(IPC_CHANNELS.agentOpenAttachment, input, decodeVoid),
    openSharedFile: (input) => invokeAgent(IPC_CHANNELS.agentOpenSharedFile, input, decodeVoid),
    openWorkspaceFile: (input) => invokeAgent(IPC_CHANNELS.agentOpenWorkspaceFile, input, decodeVoid),
    previewSharedFile: (input) => invokeAgent(IPC_CHANNELS.agentPreviewSharedFile, input, decodeFilePreview),
    previewWorkspaceFile: (input) => invokeAgent(IPC_CHANNELS.agentPreviewWorkspaceFile, input, decodeFilePreview),
    sendMessage: (input) => invokeAgent(IPC_CHANNELS.agentSendMessage, input, decodeReceipt),
    setMessageReaction: (input) => invokeAgent(IPC_CHANNELS.agentSetMessageReaction, input, decodeVoid),
    listPinnedMessages: (botId) => invokeAgent(IPC_CHANNELS.agentListPinnedMessages, botId, decodePinnedMessages),
    setMessagePinned: (input) => invokeAgent(IPC_CHANNELS.agentSetMessagePinned, input, decodePinnedMessages),
    listQueue: (botId) => invokeAgent(IPC_CHANNELS.agentListQueue, botId, decodeQueue),
    acknowledgeFailedTurn: (input) => invokeAgent(IPC_CHANNELS.agentAcknowledgeFailedTurn, input, decodeVoid),
    cancelQueuedMessage: (input) => invokeAgent(IPC_CHANNELS.agentCancelQueuedMessage, input, decodeVoid),
    steerQueuedMessage: (input) => invokeAgent(IPC_CHANNELS.agentSteerQueuedMessage, input, decodeVoid),
    updateQueuedMessage: (input) => invokeAgent(IPC_CHANNELS.agentUpdateQueuedMessage, input, decodeVoid),
    reorderQueue: (input) => invokeAgent(IPC_CHANNELS.agentReorderQueue, input, decodeVoid),
    interrupt: (input) => invokeAgent(IPC_CHANNELS.agentInterrupt, input, decodeVoid),
    respondToPrompt: (input) => invokeAgent(IPC_CHANNELS.agentRespondToPrompt, input, decodeVoid),
    respondToApproval: (input) => invokeAgent(IPC_CHANNELS.agentRespondToApproval, input, decodeVoid),
    respondToBrowserTakeover: (input) => invokeAgent(IPC_CHANNELS.agentRespondToBrowserTakeover, input, decodeVoid),
    onEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, event: Parameters<typeof listener>[0]) => listener(event);
      ipcRenderer.on(IPC_CHANNELS.agentEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.agentEvent, handler);
    },
  },
  browser: {
    open: (input) => ipcRenderer.invoke(IPC_CHANNELS.browserOpen, input),
    activate: (tabId) => ipcRenderer.invoke(IPC_CHANNELS.browserActivate, tabId),
    navigate: (input) => ipcRenderer.invoke(IPC_CHANNELS.browserNavigate, input),
    reload: (tabId) => ipcRenderer.invoke(IPC_CHANNELS.browserReload, tabId),
    close: (tabId) => ipcRenderer.invoke(IPC_CHANNELS.browserClose, tabId),
    listTabs: () => ipcRenderer.invoke(IPC_CHANNELS.browserListTabs),
    getDisplayState: () => ipcRenderer.invoke(IPC_CHANNELS.browserGetDisplayState),
    getControlState: () => ipcRenderer.invoke(IPC_CHANNELS.browserGetControlState),
    capturePreview: (tabId) => ipcRenderer.invoke(IPC_CHANNELS.browserCapturePreview, tabId).then(decodeBrowserPreview),
    setVisible: (input) => ipcRenderer.invoke(IPC_CHANNELS.browserSetVisible, input),
    onDisplayState: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state);
      ipcRenderer.on(IPC_CHANNELS.browserDisplayStateEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.browserDisplayStateEvent, handler);
    },
    openPictureInPicture: (bounds) => ipcRenderer.invoke(IPC_CHANNELS.browserPictureInPictureOpen, bounds),
    closePictureInPicture: () => ipcRenderer.invoke(IPC_CHANNELS.browserPictureInPictureClose),
    dockPictureInPicture: () => ipcRenderer.invoke(IPC_CHANNELS.browserPictureInPictureDock),
    hidePictureInPicture: () => ipcRenderer.invoke(IPC_CHANNELS.browserPictureInPictureHide),
    onPictureInPictureEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, event: Parameters<typeof listener>[0]) => listener(event);
      ipcRenderer.on(IPC_CHANNELS.browserPictureInPictureEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.browserPictureInPictureEvent, handler);
    },
  },
  update: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.updateGetStatus),
    check: () => ipcRenderer.invoke(IPC_CHANNELS.updateCheck),
    download: () => ipcRenderer.invoke(IPC_CHANNELS.updateDownload),
    install: () => ipcRenderer.invoke(IPC_CHANNELS.updateInstall),
    getPreference: () => ipcRenderer.invoke(IPC_CHANNELS.updateGetPreference),
    setPreference: (input) => ipcRenderer.invoke(IPC_CHANNELS.updateSetPreference, input),
    onEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => listener(status);
      ipcRenderer.on(IPC_CHANNELS.updateEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.updateEvent, handler);
    },
  },
  agentPreferences: {
    getMemoryLimit: () => ipcRenderer.invoke(IPC_CHANNELS.agentPreferencesGetMemoryLimit),
    setMemoryLimit: (limit) => ipcRenderer.invoke(IPC_CHANNELS.agentPreferencesSetMemoryLimit, limit),
    getClaudeCompactWindow: () => ipcRenderer.invoke(IPC_CHANNELS.agentPreferencesGetClaudeCompactWindow),
    setClaudeCompactWindow: (tokens) => ipcRenderer.invoke(IPC_CHANNELS.agentPreferencesSetClaudeCompactWindow, tokens),
    getBusyMessageMode: () => ipcRenderer.invoke(IPC_CHANNELS.agentPreferencesGetBusyMessageMode),
    setBusyMessageMode: (mode) => ipcRenderer.invoke(IPC_CHANNELS.agentPreferencesSetBusyMessageMode, mode),
    getWindowCloseBehavior: () => ipcRenderer.invoke(IPC_CHANNELS.agentPreferencesGetWindowCloseBehavior),
    setWindowCloseBehavior: (behavior) =>
      ipcRenderer.invoke(IPC_CHANNELS.agentPreferencesSetWindowCloseBehavior, behavior),
    getApprovalPolicy: (botId) => ipcRenderer.invoke(IPC_CHANNELS.agentPreferencesGetApprovalPolicy, botId),
    setApprovalPolicy: (input) => ipcRenderer.invoke(IPC_CHANNELS.agentPreferencesSetApprovalPolicy, input),
  },
  maintenance: {
    exportData: () => ipcRenderer.invoke(IPC_CHANNELS.maintenanceExportData),
    exportDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.maintenanceExportDiagnostics),
  },
};

contextBridge.exposeInMainWorld("lunabot", lunabotApi);
