import { existsSync } from "node:fs";
import { copyFile, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import { ATTACHMENT_FILE_EXTENSIONS, IMAGE_ATTACHMENT_EXTENSIONS } from "@lunabot/contracts/attachment-files";
import { INPUT_LIMITS } from "@lunabot/contracts/input-limits";
import {
  type AgentEvent,
  type AppInfo,
  type AppSetupState,
  type BrowserDisplayState,
  DEFAULT_WINDOW_CLOSE_BEHAVIOR,
  type DuplicateBotResult,
  type ExternalDestination,
  type FilePreview,
  IPC_CHANNELS,
  type MacPermissionId,
  type SidebarLayoutSnapshot,
  type VoiceModelStatus,
  type VoiceTranscriptionResult,
  type WindowCloseBehavior,
} from "@lunabot/contracts/ipc";
import {
  app,
  BrowserWindow,
  type Display,
  dialog,
  Menu,
  Notification,
  nativeTheme,
  type OpenDialogOptions,
  powerMonitor,
  protocol,
  type Rectangle,
  screen,
  session,
  shell,
  type Tray,
} from "electron";
import electronUpdater from "electron-updater";
import { AgentService } from "../backend/agent-service";
import {
  AGENT_EXPORT_MAX_BYTES,
  AGENT_EXPORT_MAX_LABEL,
  parseAgentExport,
  serializeAgentExport,
} from "../backend/agent-transfer";
import { BackgroundTaskJournal } from "../backend/background-task-journal";
import { BotStore } from "../backend/bot-store";
import { BrowserHost } from "../backend/browser-host";
import { isCloseBrowserTabShortcut, isSelectAllShortcut, isToggleDevToolsShortcut } from "../backend/browser-shortcuts";
import { MailboxStore } from "../backend/mailbox-store";
import { botScope, browserPartitionForScope } from "../backend/room-scope";
import { RoomService } from "../backend/room-service";
import { SidebarLayoutStore } from "../backend/sidebar-layout-store";
import { AgentInitializationGate } from "./agent-initialization";
import { notificationForAgentEvent } from "./agent-notifications";
import { readAgentPreferences, updateAgentPreferences } from "./agent-preference-store";
import { readAppVariant, resolveAppIconPath } from "./app-icon";
import { BrowserPictureInPicture } from "./browser-picture-in-picture";
import { ComputerUseMacSetupService } from "./computer-use-mac-setup";
import { ComputerUseMacSetupWindowController } from "./computer-use-mac-setup-window";
import { buildContentSecurityPolicy } from "./content-security-policy";
import { guardDevelopmentOutput } from "./development-output";
import { developmentUserDataName, readDevelopmentInstanceId } from "./development-profile";
import { performDynamicIslandCriticalAction } from "./dynamic-island-actions";
import {
  DynamicIslandWindowController,
  dynamicIslandNotchSizeForDisplay,
  requireDynamicIslandSender,
} from "./dynamic-island-window";
import { localFilePreview } from "./file-preview";
import {
  parseAcknowledgeFailedTurn,
  parseApprovalResponse,
  parseBrowserTakeoverResponse,
  parseCancelQueuedMessage,
  parseChooseAttachments,
  parseCreateBot,
  parseCreateBotMemory,
  parseCreateRoutine,
  parseDeleteBotMemory,
  parseDeleteRoutine,
  parseImportAttachments,
  parseInterrupt,
  parseListRoutineRuns,
  parseMarkConversationRead,
  parseMessageReaction,
  parseOpenAttachment,
  parseOpenSharedFile,
  parseOpenWorkspaceFile,
  parsePromptResponse,
  parseReadConversationPage,
  parseReorderQueue,
  parseSearchConversationMessages,
  parseSendMessage,
  parseSetAgentAvatar,
  parseSetMessagePinned,
  parseSidebarLayoutAction,
  parseSteerQueuedMessage,
  parseTestRoutine,
  parseUpdateBot,
  parseUpdateBotMemory,
  parseUpdateQueuedMessage,
  parseUpdateRoutine,
} from "./ipc/agent-inputs";
import {
  parseAgentMemoryLimit,
  parseApprovalPolicyBotId,
  parseApprovalPolicyInput,
  parseBusyMessageMode,
  parseClaudeCompactWindow,
  parseDynamicIslandAction,
  parseDynamicIslandInteractive,
  parseDynamicIslandPreference,
  parseDynamicIslandPresentation,
  parseExternalDestination,
  parseMacPermission,
  parseProvider,
  parseProviderId,
  parseSetLocale,
  parseSetTheme,
  parseUpdatePreference,
  parseWindowCloseBehavior,
} from "./ipc/app-inputs";
import { parseBrowserBounds, parseBrowserNavigate, parseBrowserOpen, parseVisibility } from "./ipc/browser-inputs";
import { parseCreateRoom, parseDismissRoomMember, parseResolveRoomRequest } from "./ipc/room-inputs";
import { requireString } from "./ipc/validation";
import { parseVoiceTranscription } from "./ipc/voice-inputs";
import { MacHapticFeedback } from "./mac-haptic-feedback";
import { createMainTray } from "./main-tray";
import { readMainWindowBounds, resolveMainWindowBounds, writeMainWindowBounds } from "./main-window-state";
import { exportDiagnostics, exportLunaBotData } from "./maintenance-service";
import { readNativeAppearanceSync, writeNativeAppearanceSync } from "./native-appearance-store";
import { nativeMessage, resolveNativeLocale, setNativeLocale } from "./native-messages";
import { nativeAppearance, setNativeAppearance, windowBackgroundColor } from "./native-theme";
import { ProviderRuntimeManager } from "./provider-runtime-manager";
import { sendToRenderer } from "./renderer-ipc";
import { canCheckRendererPermission, canRequestRendererPermission } from "./renderer-permissions";
import { readSetupState, writeSetupState } from "./setup-store";
import { handleTrusted, handleTrustedWithEvent } from "./trusted-ipc";
import { isTrustedRendererUrl } from "./trusted-renderer";
import { readUpdatePreference, writeUpdatePreference } from "./update-preference-store";
import { supportsInstalledUpdates, UpdateService } from "./update-service";
import { WHISPER_MODEL_NAME, WHISPER_MODEL_URL } from "./voice-model-service";
import { VoiceTranscriptionService } from "./voice-transcription-service";
import { decideWindowClose, interpretCloseDialogResponse } from "./window-close-decision";

const commandLineUserDataDirectory = app.commandLine.getSwitchValue("user-data-dir").trim();
if (!app.isPackaged && /^\d{4,5}$/u.test(process.env.LUNABOT_DEV_REMOTE_DEBUGGING_PORT ?? "")) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.LUNABOT_DEV_REMOTE_DEBUGGING_PORT);
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
}
if (commandLineUserDataDirectory) {
  app.setPath("userData", resolve(commandLineUserDataDirectory));
} else if (!app.isPackaged) {
  app.setPath(
    "userData",
    join(
      app.getPath("appData"),
      developmentUserDataName(readDevelopmentInstanceId(process.env.LUNABOT_DEV_INSTANCE_ID)),
    ),
  );
}
app.setName("Luna Bot");
app.enableSandbox();
if (process.platform === "win32") app.setAppUserModelId("app.lunabot.desktop");
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const appVariant = readAppVariant(process.env.LUNABOT_APP_VARIANT, app.isPackaged);
if (!app.isPackaged) guardDevelopmentOutput([process.stdout, process.stderr], () => app.quit());
const appIconPath = resolveAppIconPath({
  variant: appVariant,
  platform: process.platform,
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  sourceRoot: resolve(__dirname, "../.."),
});
protocol.registerSchemesAsPrivileged([
  {
    scheme: "lunabot-app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
  {
    scheme: "lunabot-attachment",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
  {
    scheme: "lunabot-avatar",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

let mainWindow: BrowserWindow | null = null;
let mainWindowLoad: Promise<BrowserWindow> | null = null;
let browserHost: BrowserHost | null = null;
let browserPictureInPicture: BrowserPictureInPicture | null = null;
let agentService: AgentService | null = null;
let sidebarLayoutState: SidebarLayoutStore | null = null;
let mailboxStore: MailboxStore | null = null;
let updateService: UpdateService | null = null;
let providerRuntimeManager: ProviderRuntimeManager | null = null;
let voiceTranscriptionService: VoiceTranscriptionService | null = null;
let dynamicIslandController: DynamicIslandWindowController | null = null;
let computerUseMacSetupController: ComputerUseMacSetupWindowController | null = null;
const macHapticFeedback = new MacHapticFeedback();
let isQuitting = false;
let windowCloseBehavior: WindowCloseBehavior = DEFAULT_WINDOW_CLOSE_BEHAVIOR;
let mainTray: Tray | null = null;
let windowCloseDialogOpen = false;
let shutdownStarted = false;
let systemSessionEnding = false;
let systemSessionEndFlushStarted = false;
let mainWindowBounds: Rectangle | null = null;
let mainWindowBoundsWriteTimer: ReturnType<typeof setTimeout> | null = null;
let mainWindowBoundsWrite = Promise.resolve();

const SETUP_FILE = "lunabot-setup-v2.json";
const LOCAL_CONVERSATION_READER_ID = "local-user";
const UPDATE_PREFERENCE_FILE = "lunabot-update-preference-v1.json";
const AGENT_PREFERENCE_FILE = "lunabot-agent-preference-v1.json";
const APPROVAL_POLICY_FILE = "lunabot-approval-policy-v1.json";
const NATIVE_APPEARANCE_FILE = "lunabot-native-appearance-v1.json";
const DYNAMIC_ISLAND_PREFERENCE_FILE = "lunabot-dynamic-island-preference-v1.json";
const MAIN_WINDOW_STATE_FILE = "lunabot-main-window-state-v1.json";

if (!app.isPackaged) {
  const quitAfterDevelopmentSignal = () => app.quit();
  process.once("SIGINT", quitAfterDevelopmentSignal);
  process.once("SIGTERM", quitAfterDevelopmentSignal);
  process.once("SIGHUP", quitAfterDevelopmentSignal);
}
const BROWSER_STATE_FILE = "lunabot-browser-state-v1.json";
const SIDEBAR_LAYOUT_FILE = "lunabot-sidebar-layout-v1.json";
const BACKGROUND_TASK_FILE = "lunabot-background-tasks-v1.json";
const EXTERNAL_DESTINATIONS: Record<ExternalDestination, string> = {
  "claude-install": "https://code.claude.com/docs",
  "claude-sign-in": "https://code.claude.com/docs/en/authentication",
};

function configureContentSecurityPolicy(): void {
  const policy = buildContentSecurityPolicy(app.isPackaged);

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== "mainFrame" || !isTrustedRendererUrl(details.url)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [policy],
      },
    });
  });
}

function registerIpcHandlers(
  service: AgentService,
  providerRuntimes: ProviderRuntimeManager,
  mailbox: MailboxStore,
  browser: BrowserHost,
  browserPictureInPicture: BrowserPictureInPicture,
  updater: UpdateService,
  setupFile: string,
  updatePreferenceFile: string,
  agentPreferenceFile: string,
  nativeAppearanceFile: string,
  initializeAgent: () => Promise<void>,
  sidebarLayout: SidebarLayoutStore,
  voice: VoiceTranscriptionService,
  dynamicIsland: DynamicIslandWindowController,
  computerUseMacSetup: ComputerUseMacSetupWindowController,
  rooms: RoomService,
): void {
  handleTrusted(IPC_CHANNELS.getAppInfo, (): AppInfo => {
    const platform = process.platform;
    if (platform !== "darwin" && platform !== "win32" && platform !== "linux") {
      throw new Error(`Unsupported desktop platform: ${platform}`);
    }
    return { name: app.getName(), version: app.getVersion(), platform, variant: appVariant };
  });
  handleTrusted(IPC_CHANNELS.getSetupState, () => readSetupState(setupFile));
  handleTrustedWithEvent(IPC_CHANNELS.dynamicIslandGetPreference, (event) => {
    requireDynamicIslandSender(
      event.sender.id,
      new Set([...dynamicIsland.mainRendererIds, ...dynamicIsland.overlayRendererIds]),
      "main or Dynamic Island renderer",
    );
    return dynamicIsland.preference;
  });
  handleTrustedWithEvent(IPC_CHANNELS.dynamicIslandSetPreference, (event, input: unknown) => {
    requireDynamicIslandSender(event.sender.id, dynamicIsland.mainRendererIds, "main renderer");
    return dynamicIsland.setPreference(parseDynamicIslandPreference(input));
  });
  handleTrustedWithEvent(IPC_CHANNELS.dynamicIslandPublishPresentation, (event, input: unknown) => {
    requireDynamicIslandSender(event.sender.id, dynamicIsland.mainRendererIds, "main renderer");
    dynamicIsland.publish(parseDynamicIslandPresentation(input));
  });
  handleTrustedWithEvent(IPC_CHANNELS.dynamicIslandGetPresentation, (event) => {
    requireDynamicIslandSender(event.sender.id, dynamicIsland.overlayRendererIds, "Dynamic Island renderer");
    return dynamicIsland.presentation;
  });
  handleTrustedWithEvent(IPC_CHANNELS.dynamicIslandPerformAction, (event, input: unknown) => {
    requireDynamicIslandSender(event.sender.id, dynamicIsland.overlayRendererIds, "Dynamic Island renderer");
    return dynamicIsland.performAction(parseDynamicIslandAction(input));
  });
  handleTrustedWithEvent(IPC_CHANNELS.dynamicIslandPerformHaptic, (event) => {
    requireDynamicIslandSender(event.sender.id, dynamicIsland.overlayRendererIds, "Dynamic Island renderer");
    dynamicIsland.performHaptic();
  });
  handleTrustedWithEvent(IPC_CHANNELS.dynamicIslandSetInteractive, (event, input: unknown) => {
    requireDynamicIslandSender(event.sender.id, dynamicIsland.overlayRendererIds, "Dynamic Island renderer");
    dynamicIsland.setInteractive(event.sender.id, parseDynamicIslandInteractive(input).interactive);
  });
  handleTrusted(IPC_CHANNELS.saveSetup, async (input: unknown): Promise<AppSetupState> => {
    const preferredProvider = parseProvider(input);
    const state = await writeSetupState(setupFile, preferredProvider);
    await service.setPreferredProvider(preferredProvider);
    await initializeAgent();
    return state;
  });
  handleTrusted(IPC_CHANNELS.setAppLocale, (input: unknown) => {
    setNativeLocale(parseSetLocale(input).locale);
    refreshApplicationMenu();
  });
  handleTrustedWithEvent(IPC_CHANNELS.setAppTheme, (event, input: unknown) => {
    const next = parseSetTheme(input);
    setNativeAppearance(next);
    nativeTheme.themeSource = next.mode;
    BrowserWindow.fromWebContents(event.sender)?.setBackgroundColor(
      windowBackgroundColor(next, nativeTheme.shouldUseDarkColors),
    );
    try {
      writeNativeAppearanceSync(nativeAppearanceFile, next);
    } catch (error) {
      console.error("Unable to save the window appearance for the next launch:", error);
    }
  });
  handleTrusted(IPC_CHANNELS.computerUseGetMacSetupState, () => computerUseMacSetup.getState());
  handleTrusted(IPC_CHANNELS.computerUseOpenMacPermissionSetup, (permission: unknown) =>
    computerUseMacSetup.open(parseMacPermission(permission)),
  );
  handleTrustedWithEvent(IPC_CHANNELS.computerUseStartHelperDrag, (event) =>
    computerUseMacSetup.startDrag(event.sender),
  );
  handleTrusted(IPC_CHANNELS.computerUseRevealHelper, () => computerUseMacSetup.revealHelper());
  handleTrusted(IPC_CHANNELS.computerUseCloseMacPermissionSetup, () => computerUseMacSetup.close());
  handleTrusted(IPC_CHANNELS.openExternal, (destination: unknown) => {
    return shell.openExternal(EXTERNAL_DESTINATIONS[parseExternalDestination(destination)]);
  });
  handleTrusted(IPC_CHANNELS.connectChatGPT, () =>
    service.connectChatGPT(async (value) => {
      const url = new URL(value);
      if (url.protocol !== "https:") throw new Error("Only HTTPS ChatGPT login links can open in the browser.");
      await shell.openExternal(url.toString());
    }),
  );
  handleTrusted(IPC_CHANNELS.connectClaude, () => service.connectClaude());
  handleTrusted(IPC_CHANNELS.connectGrok, () => service.connectGrok());
  handleTrusted(IPC_CHANNELS.refreshAgentProviders, () => service.refreshProviders());
  handleTrusted(IPC_CHANNELS.providerRuntimesGetStatus, () => providerRuntimes.getStatus());
  handleTrusted(IPC_CHANNELS.providerRuntimesDownload, (provider: unknown) =>
    providerRuntimes.download(parseProviderId(provider)),
  );
  handleTrusted(IPC_CHANNELS.providerRuntimesCancel, (provider: unknown) =>
    providerRuntimes.cancel(parseProviderId(provider)),
  );
  handleTrusted(IPC_CHANNELS.openUrl, (value: unknown) => {
    const url = new URL(requireString(value, "URL", INPUT_LIMITS.browserUrl));
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(nativeMessage("errors.links.httpOnly"));
    }
    return shell.openExternal(url.toString());
  });
  handleTrusted(IPC_CHANNELS.voiceGetModelStatus, (): Promise<VoiceModelStatus> => voice.getModelStatus());
  handleTrusted(IPC_CHANNELS.voicePrepareModel, (): Promise<VoiceModelStatus> => voice.prepareModel());
  handleTrusted(
    IPC_CHANNELS.voiceTranscribe,
    (input: unknown): Promise<VoiceTranscriptionResult> => voice.transcribe(parseVoiceTranscription(input).audio),
  );
  handleTrusted(IPC_CHANNELS.updateGetStatus, () => updater.getStatus());
  handleTrusted(IPC_CHANNELS.updateCheck, () => updater.checkForUpdates());
  handleTrusted(IPC_CHANNELS.updateDownload, () => updater.downloadUpdate());
  handleTrusted(IPC_CHANNELS.updateInstall, () => updater.installUpdate());
  handleTrusted(IPC_CHANNELS.updateGetPreference, () => readUpdatePreference(updatePreferenceFile));
  handleTrusted(IPC_CHANNELS.updateSetPreference, async (input: unknown) => {
    const preference = await writeUpdatePreference(updatePreferenceFile, parseUpdatePreference(input).autoDownload);
    updater.setAutoDownload(preference.autoDownload);
    return preference;
  });
  handleTrusted(IPC_CHANNELS.agentPreferencesGetMemoryLimit, async () => {
    return (await readAgentPreferences(agentPreferenceFile)).memoryLimit;
  });
  handleTrusted(IPC_CHANNELS.agentPreferencesSetMemoryLimit, async (input: unknown) => {
    const preferences = await updateAgentPreferences(agentPreferenceFile, {
      memoryLimit: parseAgentMemoryLimit(input),
    });
    service.setAgentMemoryLimit(preferences.memoryLimit);
    return preferences.memoryLimit;
  });
  handleTrusted(IPC_CHANNELS.agentPreferencesGetClaudeCompactWindow, async () => {
    return (await readAgentPreferences(agentPreferenceFile)).claudeCompactWindow;
  });
  handleTrusted(IPC_CHANNELS.agentPreferencesSetClaudeCompactWindow, async (input: unknown) => {
    const preferences = await updateAgentPreferences(agentPreferenceFile, {
      claudeCompactWindow: parseClaudeCompactWindow(input),
    });
    service.setClaudeCompactWindow(preferences.claudeCompactWindow);
    return preferences.claudeCompactWindow;
  });
  handleTrusted(IPC_CHANNELS.agentPreferencesGetBusyMessageMode, async () => {
    return (await readAgentPreferences(agentPreferenceFile)).busyMessageMode;
  });
  handleTrusted(IPC_CHANNELS.agentPreferencesSetBusyMessageMode, async (input: unknown) => {
    const preferences = await updateAgentPreferences(agentPreferenceFile, {
      busyMessageMode: parseBusyMessageMode(input),
    });
    service.setBusyMessageMode(preferences.busyMessageMode);
    return preferences.busyMessageMode;
  });
  handleTrusted(IPC_CHANNELS.agentPreferencesGetApprovalPolicy, (input: unknown) => {
    return service.getApprovalPolicy(parseApprovalPolicyBotId(input));
  });
  handleTrusted(IPC_CHANNELS.agentPreferencesSetApprovalPolicy, async (input: unknown) => {
    const { botId, mode } = parseApprovalPolicyInput(input);
    return service.setApprovalPolicy(botId, mode);
  });
  handleTrusted(IPC_CHANNELS.agentPreferencesGetWindowCloseBehavior, async () => {
    return (await readAgentPreferences(agentPreferenceFile)).windowCloseBehavior;
  });
  handleTrusted(IPC_CHANNELS.agentPreferencesSetWindowCloseBehavior, async (input: unknown) => {
    const preferences = await updateAgentPreferences(agentPreferenceFile, {
      windowCloseBehavior: parseWindowCloseBehavior(input),
    });
    windowCloseBehavior = preferences.windowCloseBehavior;
    return preferences.windowCloseBehavior;
  });
  handleTrusted(IPC_CHANNELS.maintenanceExportData, () =>
    exportLunaBotData({ service, mailbox, parentWindow: mainWindow }),
  );
  handleTrusted(IPC_CHANNELS.maintenanceExportDiagnostics, () =>
    exportDiagnostics({ service, browser, updater, parentWindow: mainWindow }),
  );

  handleTrusted(IPC_CHANNELS.agentGetStatus, () => {
    return service.getStatus();
  });
  handleTrusted(IPC_CHANNELS.agentGetUsage, () => {
    return service.getUsage();
  });
  handleTrusted(IPC_CHANNELS.agentListModels, () => {
    return service.listModels();
  });
  handleTrusted(IPC_CHANNELS.agentListBots, () => {
    return service.listBots();
  });
  handleTrusted(IPC_CHANNELS.roomsList, () => {
    return rooms.listRooms();
  });
  handleTrusted(IPC_CHANNELS.roomsCreate, (input: unknown) => {
    return rooms.createRoom(parseCreateRoom(input));
  });
  handleTrusted(IPC_CHANNELS.roomsArchive, (input: unknown) => {
    return rooms.archiveRoom(requireString(input, "roomId", INPUT_LIMITS.identifier));
  });
  handleTrusted(IPC_CHANNELS.roomsReopen, (input: unknown) => {
    return rooms.reopenRoom(requireString(input, "roomId", INPUT_LIMITS.identifier));
  });
  handleTrusted(IPC_CHANNELS.roomsDeleteForever, async (input: unknown) => {
    await rooms.deleteRoomForever(requireString(input, "roomId", INPUT_LIMITS.identifier));
  });
  handleTrusted(IPC_CHANNELS.roomsDismissMember, (input: unknown) => {
    const parsed = parseDismissRoomMember(input);
    return rooms.dismissMember(parsed.roomId, parsed.botId);
  });
  handleTrusted(IPC_CHANNELS.roomsResolveRequest, (input: unknown) => {
    const parsed = parseResolveRoomRequest(input);
    return rooms.resolveRequest(parsed.requestId, parsed.decision, parsed.targetBotId);
  });
  handleTrusted(IPC_CHANNELS.roomsBackstage, (input: unknown) => {
    return rooms.backstage(requireString(input, "roomId", INPUT_LIMITS.identifier));
  });
  handleTrusted(IPC_CHANNELS.roomsBotProfiles, (input: unknown) => {
    return rooms.botProfiles(requireString(input, "roomId", INPUT_LIMITS.identifier));
  });
  handleTrusted(IPC_CHANNELS.agentGetSidebarLayout, (): Promise<SidebarLayoutSnapshot> => {
    return Promise.resolve(sidebarLayout.getSnapshot());
  });
  handleTrusted(IPC_CHANNELS.agentMutateSidebarLayout, (input: unknown): Promise<SidebarLayoutSnapshot> => {
    const action = parseSidebarLayoutAction(input);
    return sidebarLayout.mutate(action, new Set(service.listBots().map((bot) => bot.id)));
  });
  handleTrusted(IPC_CHANNELS.agentCreateBot, (input: unknown) => {
    const parsed = parseCreateBot(input);
    return service.createBot(parsed);
  });
  handleTrusted(IPC_CHANNELS.agentDuplicateBot, (input: unknown): Promise<DuplicateBotResult> => {
    const botId = requireString(input, "botId", INPUT_LIMITS.identifier);
    return routeDuplicateBot(service, sidebarLayout, botId);
  });
  handleTrusted(IPC_CHANNELS.agentUpdateBot, (input: unknown) => {
    return service.updateBot(parseUpdateBot(input));
  });
  handleTrusted(IPC_CHANNELS.agentSetAvatar, (input: unknown) => {
    const parsed = parseSetAgentAvatar(input);
    return service.setAvatar(parsed.botId, parsed.image);
  });
  handleTrusted(IPC_CHANNELS.agentDeleteBot, async (input: unknown) => {
    const botId = requireString(input, "botId");
    await service.deleteBot(botId);
    await sidebarLayout.removeAgent(botId);
  });
  handleTrusted(IPC_CHANNELS.agentExportAgent, async (input: unknown) => {
    const botId = requireString(input, "botId", INPUT_LIMITS.identifier);
    const file = service.exportAgent(botId);
    const saveOptions: Electron.SaveDialogOptions = {
      defaultPath: join(app.getPath("documents"), `${file.agent.name.replace(/[\\/:*?"<>|]/g, "-") || "agent"}.json`),
      filters: [{ name: nativeMessage("dialog.agentExportFilter"), extensions: ["json"] }],
      showsTagField: false,
    };
    const result =
      mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showSaveDialog(mainWindow, saveOptions)
        : await dialog.showSaveDialog(saveOptions);
    if (result.canceled || !result.filePath) return false;
    await writeFile(result.filePath, serializeAgentExport(file), "utf8");
    return true;
  });
  handleTrusted(IPC_CHANNELS.agentImportAgent, async () => {
    const openOptions: OpenDialogOptions = {
      properties: ["openFile"],
      filters: [{ name: nativeMessage("dialog.agentExportFilter"), extensions: ["json"] }],
    };
    const result =
      mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showOpenDialog(mainWindow, openOptions)
        : await dialog.showOpenDialog(openOptions);
    const [filePath] = result.filePaths;
    if (result.canceled || !filePath) return null;
    if ((await stat(filePath)).size > AGENT_EXPORT_MAX_BYTES) {
      throw new Error(nativeMessage("errors.agentTransfer.tooLarge", { limit: AGENT_EXPORT_MAX_LABEL }));
    }
    return service.importAgent(parseAgentExport(await readFile(filePath, "utf8")));
  });
  handleTrusted(IPC_CHANNELS.agentListMemories, (input: unknown) => {
    const botId = requireString(input, "botId", INPUT_LIMITS.identifier);
    return service.listMemories(botId);
  });
  handleTrusted(IPC_CHANNELS.agentCreateMemory, (input: unknown) => {
    const parsed = parseCreateBotMemory(input);
    return service.createMemory(parsed);
  });
  handleTrusted(IPC_CHANNELS.agentUpdateMemory, (input: unknown) => {
    const parsed = parseUpdateBotMemory(input);
    return service.updateMemory(parsed);
  });
  handleTrusted(IPC_CHANNELS.agentDeleteMemory, (input: unknown) => {
    const parsed = parseDeleteBotMemory(input);
    return service.deleteMemory(parsed);
  });
  handleTrusted(IPC_CHANNELS.agentClearMemories, (input: unknown) => {
    const botId = requireString(input, "botId", INPUT_LIMITS.identifier);
    return service.clearMemories(botId);
  });
  handleTrusted(IPC_CHANNELS.agentListRoutines, (input: unknown) => {
    const botId = requireString(input, "botId", INPUT_LIMITS.identifier);
    return service.listRoutines(botId);
  });
  handleTrusted(IPC_CHANNELS.agentCreateRoutine, (input: unknown) => {
    const parsed = parseCreateRoutine(input);
    return service.createRoutine(parsed);
  });
  handleTrusted(IPC_CHANNELS.agentUpdateRoutine, (input: unknown) => {
    const parsed = parseUpdateRoutine(input);
    return service.updateRoutine(parsed);
  });
  handleTrusted(IPC_CHANNELS.agentDeleteRoutine, (input: unknown) => {
    const parsed = parseDeleteRoutine(input);
    return service.deleteRoutine(parsed);
  });
  handleTrusted(IPC_CHANNELS.agentTestRoutine, (input: unknown) => {
    const parsed = parseTestRoutine(input);
    return service.testRoutine(parsed);
  });
  handleTrusted(IPC_CHANNELS.agentListRoutineRuns, (input: unknown) => {
    const parsed = parseListRoutineRuns(input);
    return service.listRoutineRuns(parsed);
  });
  handleTrusted(IPC_CHANNELS.agentReadConversation, (input: unknown) => {
    return service.readConversationFor(requireString(input, "botId"), LOCAL_CONVERSATION_READER_ID);
  });
  handleTrusted(IPC_CHANNELS.agentReadConversationPage, (input: unknown) => {
    const parsed = parseReadConversationPage(input);
    return service.readConversationPageFor(parsed.botId, LOCAL_CONVERSATION_READER_ID, parsed.anchor, parsed.limit);
  });
  handleTrusted(IPC_CHANNELS.agentSearchConversationMessages, (input: unknown) => {
    const parsed = parseSearchConversationMessages(input);
    return service.searchConversationMessages(parsed.query, parsed.botId, parsed.cursor, parsed.limit);
  });
  handleTrusted(IPC_CHANNELS.agentListConversationReads, () => {
    return service.listConversationReads(LOCAL_CONVERSATION_READER_ID);
  });
  handleTrusted(IPC_CHANNELS.agentMarkConversationRead, (input: unknown) => {
    const parsed = parseMarkConversationRead(input);
    return service.markConversationRead(parsed.botId, LOCAL_CONVERSATION_READER_ID, parsed.throughMessageId);
  });
  handleTrusted(IPC_CHANNELS.agentSendMessage, (input: unknown) => {
    return service.sendMessage(parseSendMessage(input));
  });
  handleTrusted(IPC_CHANNELS.agentSetMessageReaction, (input: unknown) => {
    const parsed = parseMessageReaction(input);
    return service.setMessageReaction(parsed);
  });
  handleTrusted(IPC_CHANNELS.agentListPinnedMessages, (input: unknown) => {
    return service.listMessagePins(requireString(input, "botId"));
  });
  handleTrusted(IPC_CHANNELS.agentSetMessagePinned, (input: unknown) => {
    return service.setMessagePinned(parseSetMessagePinned(input));
  });
  handleTrusted(IPC_CHANNELS.agentChooseAttachments, async (input: unknown) => {
    const { filter } = parseChooseAttachments(input);
    const options: OpenDialogOptions = {
      properties: ["openFile", "multiSelections"],
      filters:
        filter === "images"
          ? [{ name: nativeMessage("dialog.imagesFilter"), extensions: [...IMAGE_ATTACHMENT_EXTENSIONS] }]
          : [{ name: nativeMessage("dialog.supportedFilesFilter"), extensions: [...ATTACHMENT_FILE_EXTENSIONS] }],
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled) return [];
    return service.prepareAttachments(result.filePaths);
  });
  handleTrusted(IPC_CHANNELS.agentImportAttachments, (input: unknown) => {
    const parsed = parseImportAttachments(input);
    return service.prepareImportedAttachments(parsed.paths, parsed.data);
  });
  handleTrusted(IPC_CHANNELS.agentDiscardDraftAttachment, (input: unknown) => {
    const attachmentId = requireString(input, "attachmentId");
    return service.discardDraftAttachment(attachmentId);
  });
  handleTrusted(IPC_CHANNELS.agentOpenAttachment, async (input: unknown) => {
    const parsed = parseOpenAttachment(input);
    const attachment = await mailbox.resolveAttachment(parsed.attachmentId);
    if (!attachment) throw new Error(nativeMessage("attachment.notFound"));
    if (parsed.action === "download") {
      const safeId = basename(parsed.attachmentId).replace(/[^a-z0-9_-]/gi, "-") || "attachment";
      const mimeExtension = attachment.mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "");
      const suggestedName = `attachment-${safeId}${mimeExtension ? `.${mimeExtension}` : ""}`;
      const extension = extname(suggestedName).slice(1).toLowerCase();
      const saveOptions: Electron.SaveDialogOptions = {
        defaultPath: join(app.getPath("downloads"), suggestedName),
        filters: [{ name: nativeMessage("dialog.attachmentFilter"), extensions: extension ? [extension] : ["*"] }],
        showsTagField: false,
      };
      const result =
        mainWindow && !mainWindow.isDestroyed()
          ? await dialog.showSaveDialog(mainWindow, saveOptions)
          : await dialog.showSaveDialog(saveOptions);
      if (result.canceled || !result.filePath) return;
      await copyFile(attachment.path, result.filePath);
      return;
    }
    if (parsed.action === "reveal") {
      shell.showItemInFolder(attachment.path);
      return;
    }
    const error = await shell.openPath(attachment.path);
    if (error) throw new Error(error);
  });
  handleTrusted(IPC_CHANNELS.agentOpenSharedFile, async (input: unknown) => {
    const parsed = parseOpenSharedFile(input);
    const sharedFile = await service.resolveSharedFile(parsed.path);
    const openError = await shell.openPath(sharedFile.path);
    if (openError) throw new Error(openError);
  });
  handleTrusted(IPC_CHANNELS.agentOpenWorkspaceFile, async (input: unknown) => {
    const parsed = parseOpenWorkspaceFile(input);
    const workspaceFile = await service.resolveWorkspaceFile(parsed.botId, parsed.path);
    const openError = await shell.openPath(workspaceFile.path);
    if (openError) throw new Error(openError);
  });
  handleTrusted(IPC_CHANNELS.agentPreviewSharedFile, async (input: unknown): Promise<FilePreview> => {
    const parsed = parseOpenSharedFile(input);
    const sharedFile = await service.resolveSharedFile(parsed.path);
    return localFilePreview(sharedFile.path, sharedFile.name, sharedFile.size);
  });
  handleTrusted(IPC_CHANNELS.agentPreviewWorkspaceFile, async (input: unknown): Promise<FilePreview> => {
    const parsed = parseOpenWorkspaceFile(input);
    const workspaceFile = await service.resolveWorkspaceFile(parsed.botId, parsed.path);
    return localFilePreview(workspaceFile.path, workspaceFile.name, workspaceFile.size);
  });
  handleTrusted(IPC_CHANNELS.agentListQueue, (input: unknown) => {
    return service.listQueue(requireString(input, "botId"));
  });
  handleTrusted(IPC_CHANNELS.agentAcknowledgeFailedTurn, (input: unknown) => {
    const parsed = parseAcknowledgeFailedTurn(input);
    return service.acknowledgeFailedTurn(parsed.botId, parsed.turnId);
  });
  handleTrusted(IPC_CHANNELS.agentCancelQueuedMessage, (input: unknown) => {
    const parsed = parseCancelQueuedMessage(input);
    return service.cancelQueuedMessage(parsed.botId, parsed.deliveryId);
  });
  handleTrusted(IPC_CHANNELS.agentSteerQueuedMessage, (input: unknown) => {
    const parsed = parseSteerQueuedMessage(input);
    return service.steerQueuedMessage(parsed);
  });
  handleTrusted(IPC_CHANNELS.agentUpdateQueuedMessage, (input: unknown) => {
    const parsed = parseUpdateQueuedMessage(input);
    return service.updateQueuedMessage(parsed);
  });
  handleTrusted(IPC_CHANNELS.agentReorderQueue, (input: unknown) => {
    const parsed = parseReorderQueue(input);
    return service.reorderQueue(parsed);
  });
  handleTrusted(IPC_CHANNELS.agentInterrupt, (input: unknown) => {
    const parsed = parseInterrupt(input);
    return service.interrupt(parsed.botId, parsed.turnId);
  });
  handleTrusted(IPC_CHANNELS.agentRespondToPrompt, (input: unknown) => {
    const parsed = parsePromptResponse(input);
    return service.respondToPrompt(parsed);
  });
  handleTrusted(IPC_CHANNELS.agentRespondToApproval, (input: unknown) => {
    const parsed = parseApprovalResponse(input);
    return service.respondToApproval(parsed);
  });
  handleTrusted(IPC_CHANNELS.agentRespondToBrowserTakeover, (input: unknown) => {
    const parsed = parseBrowserTakeoverResponse(input);
    return service.respondToBrowserTakeover(parsed);
  });

  handleTrusted(IPC_CHANNELS.browserOpen, (input: unknown) => {
    const parsed = parseBrowserOpen(input);
    return browser.open(parsed.url, parsed.ownerThreadId ?? null, parsed.ownerBotId ?? null, parsed.focus);
  });
  handleTrusted(IPC_CHANNELS.browserActivate, (tabId: unknown) => browser.activate(requireString(tabId, "tabId")));
  handleTrusted(IPC_CHANNELS.browserNavigate, (input: unknown) => {
    const parsed = parseBrowserNavigate(input);
    return browser.navigate(parsed.tabId, parsed.direction);
  });
  handleTrusted(IPC_CHANNELS.browserReload, (tabId: unknown) => browser.reload(requireString(tabId, "tabId")));
  handleTrusted(IPC_CHANNELS.browserClose, (tabId: unknown) => browser.close(requireString(tabId, "tabId")));
  handleTrusted(IPC_CHANNELS.browserListTabs, () => browser.listTabs());
  handleTrusted(IPC_CHANNELS.browserGetDisplayState, (): BrowserDisplayState => browser.getDisplayState());
  handleTrusted(IPC_CHANNELS.browserGetControlState, () => browser.getControlState());
  handleTrusted(IPC_CHANNELS.browserCapturePreview, (tabId: unknown) =>
    browser.capturePreview(requireString(tabId, "tabId")),
  );
  handleTrusted(IPC_CHANNELS.browserSetVisible, async (input: unknown) => {
    await browser.setVisible(parseVisibility(input));
  });
  handleTrusted(IPC_CHANNELS.browserPictureInPictureOpen, (input: unknown) =>
    browserPictureInPicture.open(input === undefined ? undefined : parseBrowserBounds(input)),
  );
  handleTrusted(IPC_CHANNELS.browserPictureInPictureClose, () => browserPictureInPicture.close());
  handleTrusted(IPC_CHANNELS.browserPictureInPictureDock, () => browserPictureInPicture.dock());
  handleTrusted(IPC_CHANNELS.browserPictureInPictureHide, () => browserPictureInPicture.hide());
}

function createWindow(): BrowserWindow {
  let inspectElementModifierPressed = false;
  const cursor = screen.getCursorScreenPoint();
  const bounds = resolveMainWindowBounds(
    mainWindowBounds,
    screen.getAllDisplays().map((display) => display.workArea),
    screen.getDisplayNearestPoint(cursor).workArea,
    { width: 1200, height: 820 },
    { width: 960, height: 640 },
  );
  const window = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: windowBackgroundColor(nativeAppearance(), nativeTheme.shouldUseDarkColors),
    title: nativeMessage("window.title"),
    icon: appIconPath,
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hidden" as const, trafficLightPosition: { x: 8, y: 14 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      devTools: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // The menu stays installed so its accelerators keep working; only the bar is hidden.
  if (process.platform !== "darwin") window.setMenuBarVisibility(false);

  window.once("ready-to-show", () => window.show());
  window.on("close", (event) => {
    rememberMainWindowBounds(window.getNormalBounds());
    const action = decideWindowClose({
      platform: process.platform,
      behavior: windowCloseBehavior,
      quitting: isQuitting,
      trayAvailable: mainTray !== null,
    });
    if (action === "allow") return;
    // Hiding keeps the hidden renderer alive: it owns the cross-host Dynamic Island coordinator.
    event.preventDefault();
    if (action === "hide") window.hide();
    else void handleWindowCloseRequest(window, action);
  });
  if (process.platform === "win32") {
    window.on("query-session-end", () => {
      systemSessionEnding = true;
      isQuitting = true;
      if (systemSessionEndFlushStarted) return;
      systemSessionEndFlushStarted = true;
      updateService?.stop();
      void flushMainWindowBounds().catch((error) =>
        console.error("Unable to save the main window position before Windows session end:", error),
      );
      void browserHost
        ?.flushPersistentStorage()
        .catch((error) => console.error("Unable to flush browser storage before Windows session end:", error));
      void providerRuntimeManager?.stop();
    });
    window.on("session-end", () => {
      systemSessionEnding = true;
      isQuitting = true;
      void flushMainWindowBounds().catch((error) =>
        console.error("Unable to save the main window position during Windows session end:", error),
      );
      void browserHost
        ?.flushPersistentStorage()
        .catch((error) => console.error("Unable to flush browser storage during Windows session end:", error));
      void providerRuntimeManager?.stop();
    });
  }
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.on("move", () => rememberMainWindowBounds(window.getNormalBounds()));
  window.on("resize", () => rememberMainWindowBounds(window.getNormalBounds()));
  window.on("hide", () => computerUseMacSetupController?.close());

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("before-input-event", (event, input) => {
    if (input.key.toLowerCase() === "shift") {
      inspectElementModifierPressed = input.type === "keyDown";
    }
    if (isToggleDevToolsShortcut(input)) {
      event.preventDefault();
      window.webContents.toggleDevTools();
      return;
    }
    if (isSelectAllShortcut(input)) {
      event.preventDefault();
      void window.webContents.executeJavaScript(
        `(() => {
          const active = document.activeElement;
          if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
            active.select();
            return;
          }
          if (!(active instanceof HTMLElement) || !active.isContentEditable) return;
          const range = document.createRange();
          range.selectNodeContents(active);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        })()`,
        true,
      );
      return;
    }
    const tabId = browserHost?.activeTabId;
    if (!browserHost?.visible || !tabId || !isCloseBrowserTabShortcut(input)) return;
    event.preventDefault();
    setImmediate(() => void browserHost?.close(tabId).catch(() => undefined));
  });
  window.webContents.on("context-menu", (event, params) => {
    if (!inspectElementModifierPressed) return;
    event.preventDefault();
    window.webContents.inspectElement(params.x, params.y);
  });
  window.on("blur", () => {
    inspectElementModifierPressed = false;
  });
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isTrustedRendererUrl(targetUrl)) event.preventDefault();
  });
  window.webContents.on("did-finish-load", () => {
    const service = agentService;
    if (service) forwardAgentEvent({ type: "runtime-snapshot", snapshot: service.getRuntimeSnapshot() });
  });

  return window;
}

function rememberMainWindowBounds(bounds: Rectangle): void {
  mainWindowBounds = { ...bounds };
  if (mainWindowBoundsWriteTimer) clearTimeout(mainWindowBoundsWriteTimer);
  mainWindowBoundsWriteTimer = setTimeout(() => {
    mainWindowBoundsWriteTimer = null;
    void queueMainWindowBoundsWrite().catch((error) =>
      console.error("Unable to save the main window position:", error),
    );
  }, 250);
}

function queueMainWindowBoundsWrite(): Promise<void> {
  if (!mainWindowBounds) return mainWindowBoundsWrite;
  const bounds = { ...mainWindowBounds };
  mainWindowBoundsWrite = mainWindowBoundsWrite
    .catch((error) => console.error("Unable to save the previous main window position:", error))
    .then(() => writeMainWindowBounds(join(app.getPath("userData"), MAIN_WINDOW_STATE_FILE), bounds));
  return mainWindowBoundsWrite;
}

async function flushMainWindowBounds(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindowBounds = mainWindow.getNormalBounds();
  if (mainWindowBoundsWriteTimer) {
    clearTimeout(mainWindowBoundsWriteTimer);
    mainWindowBoundsWriteTimer = null;
  }
  await queueMainWindowBoundsWrite();
}

function createDynamicIslandWindow(bounds: Rectangle, _display: Display): BrowserWindow {
  const window = new BrowserWindow({
    ...bounds,
    show: false,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    enableLargerThanScreen: true,
    hasShadow: false,
    skipTaskbar: true,
    type: "panel",
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      devTools: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isTrustedRendererUrl(targetUrl)) event.preventDefault();
  });
  return window;
}

function createComputerUseMacSetupWindow(): BrowserWindow {
  const workArea =
    mainWindow && !mainWindow.isDestroyed()
      ? screen.getDisplayMatching(mainWindow.getBounds()).workArea
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width = 360;
  const height = 300;
  const window = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 16,
    y: workArea.y + 52,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: windowBackgroundColor(nativeAppearance(), nativeTheme.shouldUseDarkColors),
    title: nativeMessage("window.computerUseSetupTitle"),
    icon: appIconPath,
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 12, y: 13 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      devTools: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  window.setAlwaysOnTop(true, "floating");
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isTrustedRendererUrl(targetUrl)) event.preventDefault();
  });
  return window;
}

function loadRenderer(window: BrowserWindow): Promise<void> {
  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  return developmentUrl ? window.loadURL(developmentUrl) : window.loadURL("lunabot-app://app/index.html");
}

async function ensureMainWindow(): Promise<BrowserWindow> {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  if (mainWindowLoad) return mainWindowLoad;
  const window = createWindow();
  mainWindow = window;
  mainWindowLoad = loadRenderer(window)
    .then(() => window)
    .catch((error) => {
      if (!window.isDestroyed()) window.destroy();
      if (mainWindow === window) mainWindow = null;
      throw error;
    })
    .finally(() => {
      mainWindowLoad = null;
    });
  return mainWindowLoad;
}

function loadDynamicIslandRenderer(window: BrowserWindow, display: Display): Promise<void> {
  const displayMode = display.internal ? "notch" : "island";
  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  const url = new URL(developmentUrl ?? "lunabot-app://app/index.html");
  url.searchParams.set("surface", "dynamic-island");
  url.searchParams.set("display", displayMode);
  const notch = dynamicIslandNotchSizeForDisplay(display);
  if (notch) {
    url.searchParams.set("notch-width", String(notch.width));
    url.searchParams.set("notch-height", String(notch.height));
  }
  return window.loadURL(url.toString());
}

function loadComputerUseMacSetupRenderer(window: BrowserWindow, permission: MacPermissionId): Promise<void> {
  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  const url = new URL(developmentUrl ?? "lunabot-app://app/index.html");
  url.searchParams.set("surface", "computer-use-setup");
  url.searchParams.set("permission", permission);
  return window.loadURL(url.toString());
}

function configureApplicationMenu(service: AgentService, updater: UpdateService): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        role: "appMenu",
        submenu: [
          {
            label: nativeMessage("menu.stopAllAgents"),
            accelerator: "CommandOrControl+.",
            click: () => void service.interruptAll(),
          },
          { type: "separator" },
          {
            label: nativeMessage("menu.checkForUpdates"),
            click: () => void updater.checkForUpdates(),
          },
          { type: "separator" },
          { label: nativeMessage("menu.hide"), role: "hide" },
          { label: nativeMessage("menu.hideOthers"), role: "hideOthers" },
          { label: nativeMessage("menu.showAll"), role: "unhide" },
          { type: "separator" },
          { label: nativeMessage("menu.quit"), role: "quit" },
        ],
      },
      {
        label: nativeMessage("menu.edit"),
        submenu: [
          { label: nativeMessage("menu.undo"), role: "undo" },
          { label: nativeMessage("menu.redo"), role: "redo" },
          { type: "separator" },
          { label: nativeMessage("menu.cut"), role: "cut" },
          { label: nativeMessage("menu.copy"), role: "copy" },
          { label: nativeMessage("menu.paste"), role: "paste" },
          { label: nativeMessage("menu.pasteAndMatchStyle"), role: "pasteAndMatchStyle" },
          { label: nativeMessage("menu.delete"), role: "delete" },
          { type: "separator" },
          { label: nativeMessage("menu.selectAll"), role: "selectAll" },
        ],
      },
      {
        label: nativeMessage("menu.view"),
        submenu: [
          { label: nativeMessage("menu.reload"), role: "reload" },
          { label: nativeMessage("menu.forceReload"), role: "forceReload" },
          { label: nativeMessage("menu.toggleDevTools"), role: "toggleDevTools" },
          { type: "separator" },
          { label: nativeMessage("menu.actualSize"), role: "resetZoom" },
          { label: nativeMessage("menu.zoomIn"), role: "zoomIn" },
          { label: nativeMessage("menu.zoomOut"), role: "zoomOut" },
          { type: "separator" },
          { label: nativeMessage("menu.toggleFullScreen"), role: "togglefullscreen" },
        ],
      },
      {
        label: nativeMessage("menu.window"),
        submenu: [
          { label: nativeMessage("menu.minimize"), role: "minimize" },
          { label: nativeMessage("menu.close"), role: "close" },
        ],
      },
    ]),
  );
}

function refreshApplicationMenu(): void {
  if (agentService && updateService) configureApplicationMenu(agentService, updateService);
}

function forwardAgentEvent(event: AgentEvent): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  sendToRenderer(mainWindow, IPC_CHANNELS.agentEvent, event);
  if (mainWindow.isFocused() || !Notification.isSupported()) return;

  const hiddenAgentIds = new Set(sidebarLayoutState?.getSnapshot().hiddenAgentIds ?? []);
  const content = notificationForAgentEvent(event, agentService?.listBots() ?? [], hiddenAgentIds);
  if (!content) return;
  const notification = new Notification(content);
  notification.on("click", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  notification.show();
}

function forwardRoomsChanged(rooms: RoomService): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  sendToRenderer(mainWindow, IPC_CHANNELS.roomsChanged, rooms.listRooms());
}

function forwardRoomBackstageChanged(roomId: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  sendToRenderer(mainWindow, IPC_CHANNELS.roomsBackstageChanged, roomId);
}

function forwardBrowserDisplayState(state: BrowserDisplayState): void {
  for (const window of BrowserWindow.getAllWindows()) {
    sendToRenderer(window, IPC_CHANNELS.browserDisplayStateEvent, state);
  }
}

function forwardUpdateStatus(status: import("@lunabot/contracts/ipc").UpdateStatus): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  sendToRenderer(mainWindow, IPC_CHANNELS.updateEvent, status);
}

function forwardVoiceModelStatus(status: VoiceModelStatus): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  sendToRenderer(mainWindow, IPC_CHANNELS.voiceModelStatus, status);
}

function forwardProviderRuntimeStatus(snapshot: import("@lunabot/contracts/ipc").ProviderRuntimeSnapshot): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  sendToRenderer(mainWindow, IPC_CHANNELS.providerRuntimesEvent, snapshot);
}

if (!hasSingleInstanceLock) {
  // No application services exist yet, so the secondary process can exit without shutdown work.
  process.exit(0);
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  setNativeLocale(resolveNativeLocale(app.getLocale()));

  void app
    .whenReady()
    .then(async () => {
      if (process.platform === "darwin") app.setAsDefaultProtocolClient("lunabot");
      if (process.platform === "darwin") app.dock?.setIcon(appIconPath);
      configureContentSecurityPolicy();
      configureRendererPermissions();
      try {
        const startupAppearance = readNativeAppearanceSync(join(app.getPath("userData"), NATIVE_APPEARANCE_FILE));
        setNativeAppearance(startupAppearance);
        nativeTheme.themeSource = startupAppearance.mode;
      } catch (error) {
        console.error("Unable to restore the window appearance:", error);
      }
      mainWindowBounds = await readMainWindowBounds(join(app.getPath("userData"), MAIN_WINDOW_STATE_FILE)).catch(
        (error) => {
          console.error("Unable to restore the main window position:", error);
          return null;
        },
      );
      windowCloseBehavior = (await readAgentPreferences(join(app.getPath("userData"), AGENT_PREFERENCE_FILE)))
        .windowCloseBehavior;
      mainWindow = createWindow();
      if (process.platform !== "darwin") {
        mainTray = createMainTray({ iconPath: appIconPath, onOpen: openMainWindowFromTray, onQuit: () => app.quit() });
      }
      const computerUseMacSetupService = new ComputerUseMacSetupService({
        getIconDataUrl: async (path) => (await app.getFileIcon(path, { size: "normal" })).toDataURL(),
      });
      computerUseMacSetupController = new ComputerUseMacSetupWindowController({
        service: computerUseMacSetupService,
        createWindow: createComputerUseMacSetupWindow,
        loadWindow: loadComputerUseMacSetupRenderer,
        openExternal: (url) => shell.openExternal(url),
        revealPath: (path) => shell.showItemInFolder(path),
        loadDragIcon: (path) => app.getFileIcon(path, { size: "normal" }),
      });
      dynamicIslandController = new DynamicIslandWindowController({
        platform: process.platform,
        preferencePath: join(app.getPath("userData"), DYNAMIC_ISLAND_PREFERENCE_FILE),
        createWindow: createDynamicIslandWindow,
        loadWindow: loadDynamicIslandRenderer,
        getDisplays: () => screen.getAllDisplays(),
        getMainWindow: () => mainWindow,
        ensureMainWindow,
        performHaptic: () => macHapticFeedback.performAlignment(),
        performCriticalAction: async (action) => {
          if (!agentService) throw new Error("Luna Bot is not ready.");
          await performDynamicIslandCriticalAction(action, agentService);
        },
      });
      const store = new BotStore(app.getPath("userData"), homedir());
      await store.initialize();
      const sidebarLayoutStore = new SidebarLayoutStore(join(app.getPath("userData"), SIDEBAR_LAYOUT_FILE));
      await sidebarLayoutStore.initialize();
      await sidebarLayoutStore.reconcileAgents(new Set(store.list().map((bot) => bot.id)));
      sidebarLayoutState = sidebarLayoutStore;
      mailboxStore = new MailboxStore(app.getPath("userData"), store.sharedRoot, store.database);
      await mailboxStore.initialize();
      configureApplicationProtocol();
      browserHost = new BrowserHost(
        mainWindow,
        store.downloadsRoot,
        join(app.getPath("userData"), BROWSER_STATE_FILE),
        // A missing owner is a general agent, so it never resolves to a room partition.
        (botId) => browserPartitionForScope(botScope(botId ?? "", store.database.roomMemberships())),
      );
      await browserHost.restore();
      browserPictureInPicture = new BrowserPictureInPicture({
        mainWindow,
        browser: browserHost,
        preloadPath: join(__dirname, "../preload/index.cjs"),
        iconPath: appIconPath,
        developmentUrl: process.env.ELECTRON_RENDERER_URL,
        onEvent: (event) => {
          if (!mainWindow || mainWindow.isDestroyed()) return;
          sendToRenderer(mainWindow, IPC_CHANNELS.browserPictureInPictureEvent, event);
        },
      });
      browserHost.onChanged((tabs, activeTabId) => forwardBrowserDisplayState({ tabs, activeTabId }));
      const setupFile = join(app.getPath("userData"), SETUP_FILE);
      const updatePreferenceFile = join(app.getPath("userData"), UPDATE_PREFERENCE_FILE);
      const setupState = await readSetupState(setupFile);
      const updatePreference = await readUpdatePreference(updatePreferenceFile);
      const agentPreferenceFile = join(app.getPath("userData"), AGENT_PREFERENCE_FILE);
      const agentPreferences = await readAgentPreferences(agentPreferenceFile);
      providerRuntimeManager = new ProviderRuntimeManager({
        root: join(app.getPath("userData"), "provider-runtimes"),
      });
      await providerRuntimeManager.initialize();
      agentService = new AgentService(
        store,
        mailboxStore,
        browserHost,
        30_000,
        setupState.preferredProvider ?? "codex",
        null,
        providerRuntimeManager.executablePath("codex"),
        providerRuntimeManager.executablePath("claude"),
        providerRuntimeManager.executablePath("grok"),
        undefined,
        new BackgroundTaskJournal(join(app.getPath("userData"), BACKGROUND_TASK_FILE)),
      );
      const service = agentService;
      service.setAgentMemoryLimit(agentPreferences.memoryLimit);
      service.setClaudeCompactWindow(agentPreferences.claudeCompactWindow);
      service.setBusyMessageMode(agentPreferences.busyMessageMode);
      await service.configureApprovalPolicyFile(join(app.getPath("userData"), APPROVAL_POLICY_FILE));
      providerRuntimeManager.on("status", forwardProviderRuntimeStatus);
      providerRuntimeManager.on("ready", (provider) => {
        void service.refreshProvider(provider).catch((error) => {
          console.error(`Unable to refresh ${provider} after runtime installation:`, error);
        });
      });
      configureAttachmentProtocol(mailboxStore, service);
      voiceTranscriptionService = new VoiceTranscriptionService({
        resourcesRoot: app.isPackaged ? join(process.resourcesPath, "whisper") : resolve(".lunabot-build/whisper"),
        modelPath: app.isPackaged
          ? join(app.getPath("userData"), "runtimes", "whisper", WHISPER_MODEL_NAME)
          : resolve(".lunabot-build/whisper/model", WHISPER_MODEL_NAME),
        modelDownloadUrl: WHISPER_MODEL_URL,
      });
      voiceTranscriptionService.on("modelStatus", forwardVoiceModelStatus);
      const { autoUpdater } = electronUpdater;
      updateService = new UpdateService(autoUpdater, {
        currentVersion: app.getVersion(),
        enabled:
          app.isPackaged &&
          supportsInstalledUpdates(process.platform) &&
          existsSync(join(process.resourcesPath, "app-update.yml")),
        autoDownload: updatePreference.autoDownload,
        beforeInstall: prepareForUpdateInstall,
        platform: process.platform,
        logDirectory: join(app.getPath("userData"), "logs", "update"),
        shipItDirectory: join(homedir(), "Library", "Caches", "app.lunabot.desktop.ShipIt"),
      });
      service.on("event", (event) => {
        forwardAgentEvent(event);
        if (event.type !== "queue-changed") return;
        const roomId = store.database.roomMemberships().get(event.snapshot.botId)?.roomId;
        if (roomId) forwardRoomBackstageChanged(roomId);
      });
      const rooms = new RoomService(store, service);
      rooms.on("changed", () => forwardRoomsChanged(rooms));
      sidebarLayoutStore.on("changed", (layout) => forwardAgentEvent({ type: "sidebar-layout-changed", layout }));
      updateService.on("status", forwardUpdateStatus);
      updateService.start();
      const agentInitialization = new AgentInitializationGate(() => service.initialize());
      registerIpcHandlers(
        service,
        providerRuntimeManager,
        mailboxStore,
        browserHost,
        browserPictureInPicture,
        updateService,
        setupFile,
        updatePreferenceFile,
        agentPreferenceFile,
        join(app.getPath("userData"), NATIVE_APPEARANCE_FILE),
        () => agentInitialization.start(),
        sidebarLayoutStore,
        voiceTranscriptionService,
        dynamicIslandController,
        computerUseMacSetupController,
        rooms,
      );
      configureApplicationMenu(service, updateService);
      await dynamicIslandController
        .initialize()
        .catch((error) => console.error("Unable to initialize Dynamic Island:", error));
      await loadRenderer(mainWindow);
      const reconcileDynamicIsland = () =>
        void dynamicIslandController
          ?.reconcileWindow()
          .catch((error) => console.error("Unable to reconcile Dynamic Island displays:", error));
      screen.on("display-added", reconcileDynamicIsland);
      screen.on("display-removed", reconcileDynamicIsland);
      screen.on("display-metrics-changed", reconcileDynamicIsland);
      powerMonitor.on("resume", reconcileDynamicIsland);
      void agentInitialization.start().catch((error) => {
        console.error("Unable to initialize the local agent backend:", error);
      });

      app.on("activate", () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          return;
        }
        void ensureMainWindow()
          .then((window) => window.show())
          .catch((error) => console.error("Unable to open the main window:", error));
      });
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Luna Bot failed to start:", error);
      dialog.showErrorBox(nativeMessage("startup.errorTitle"), nativeMessage("startup.errorBody", { message }));
      app.quit();
    });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  isQuitting = true;
  if (systemSessionEnding) {
    updateService?.stop();
    void providerRuntimeManager?.stop();
    return;
  }
  if (shutdownStarted) return;
  event.preventDefault();
  void prepareForShutdown().finally(() => app.quit());
});

function openMainWindowFromTray(): void {
  void ensureMainWindow()
    .then((window) => {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    })
    .catch((error) => console.error("Unable to open the main window from the tray:", error));
}

async function handleWindowCloseRequest(window: BrowserWindow, action: "ask" | "quit-with-warning"): Promise<void> {
  if (windowCloseDialogOpen) return;
  windowCloseDialogOpen = true;
  try {
    if (action === "quit-with-warning") {
      await dialog.showMessageBox(window, {
        type: "warning",
        message: nativeMessage("closeWarning.message"),
        buttons: [nativeMessage("closeWarning.ok")],
      });
      app.quit();
      return;
    }
    const result = await dialog.showMessageBox(window, {
      type: "question",
      message: nativeMessage("closeDialog.message"),
      detail: nativeMessage("closeDialog.detail"),
      buttons: [
        nativeMessage("closeDialog.keep"),
        nativeMessage("closeDialog.quit"),
        nativeMessage("closeDialog.cancel"),
      ],
      defaultId: 0,
      cancelId: 2,
      checkboxLabel: nativeMessage("closeDialog.remember"),
      checkboxChecked: false,
    });
    const choice = interpretCloseDialogResponse(result.response, result.checkboxChecked);
    if (choice.persist) {
      await updateAgentPreferences(join(app.getPath("userData"), AGENT_PREFERENCE_FILE), {
        windowCloseBehavior: choice.persist,
      })
        .then((preferences) => {
          windowCloseBehavior = preferences.windowCloseBehavior;
        })
        .catch((error) => console.error("Unable to save the window close choice:", error));
    }
    if (choice.action === "hide" && !window.isDestroyed()) window.hide();
    if (choice.action === "quit") app.quit();
  } finally {
    windowCloseDialogOpen = false;
  }
}

async function prepareForUpdateInstall(): Promise<void> {
  await (browserHost?.flushPersistentStorage() ?? Promise.resolve());
  await destroyBrowserForShutdown();
  await prepareForShutdown(true);
}

async function prepareForShutdown(browserAlreadyDestroyed = false): Promise<void> {
  if (shutdownStarted) return;
  shutdownStarted = true;
  isQuitting = true;
  updateService?.stop();
  await flushMainWindowBounds().catch((error) => console.error("Unable to save the main window position:", error));
  dynamicIslandController?.destroy();
  dynamicIslandController = null;
  macHapticFeedback.destroy();
  if (!browserAlreadyDestroyed) await destroyBrowserForShutdown();
  browserPictureInPicture?.destroy();
  await (providerRuntimeManager?.stop() ?? Promise.resolve());
  voiceTranscriptionService?.shutdown();
  await (agentService?.stop() ?? Promise.resolve());
}

async function destroyBrowserForShutdown(): Promise<void> {
  await (browserHost?.destroy() ?? Promise.resolve());
}

function configureRendererPermissions(): void {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) =>
    canCheckRendererPermission(permission, requestingOrigin, details),
  );
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const mediaTypes = ("mediaTypes" in details ? details.mediaTypes : undefined) ?? [];
    callback(canRequestRendererPermission(permission, webContents.getURL(), { mediaTypes }));
  });
}

async function routeDuplicateBot(
  service: AgentService,
  sidebarLayout: SidebarLayoutStore,
  botId: string,
): Promise<DuplicateBotResult> {
  const bot = await service.duplicateBot(botId);
  try {
    const layout = await sidebarLayout.placeDuplicateAfter(botId, bot.id, [
      ...service.listBots().map((candidate) => candidate.id),
      bot.id,
    ]);
    return service.commitBotDuplication(bot.id, layout);
  } catch (error) {
    const rollbackResults = await Promise.allSettled([service.deleteBot(bot.id), sidebarLayout.removeAgent(bot.id)]);
    const rollbackErrors = rollbackResults.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], nativeMessage("errors.agent.duplicateCleanupFailed"));
    }
    throw error;
  }
}

function configureAttachmentProtocol(mailbox: MailboxStore, agents: AgentService): void {
  session.defaultSession.protocol.handle("lunabot-attachment", async (request) => {
    try {
      const url = new URL(request.url);
      const id = url.pathname.split("/").filter(Boolean).at(-1);
      const attachment = id ? await mailbox.resolveAttachment(id) : null;
      if (!attachment) return new Response("Not found", { status: 404 });
      return new Response(await readFile(attachment.path), {
        headers: {
          "Content-Type": attachment.mimeType,
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": request.headers.get("Origin") ?? "*",
          Vary: "Origin",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": "inline",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  session.defaultSession.protocol.handle("lunabot-avatar", async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "agent") return new Response("Not found", { status: 404 });
      const botId = decodeURIComponent(url.pathname.split("/").filter(Boolean)[0] ?? "");
      const avatar = botId ? agents.resolveAvatar(botId) : null;
      if (!avatar || avatar.version !== url.searchParams.get("v")) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(await readFile(avatar.path), {
        headers: {
          "Content-Type": avatar.mimeType,
          "Cache-Control": "private, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function configureApplicationProtocol(): void {
  const rendererRoot = resolve(__dirname, "../renderer");
  session.defaultSession.protocol.handle("lunabot-app", async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== "app") return new Response("Not found", { status: 404 });
      const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const filePath = resolve(rendererRoot, `.${pathname}`);
      const candidate = relative(rendererRoot, filePath);
      if (candidate.startsWith("..") || isAbsolute(candidate)) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(await readFile(filePath), {
        headers: {
          "Content-Type": applicationContentType(filePath),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function applicationContentType(
  path: string,
):
  | "text/html; charset=utf-8"
  | "text/javascript; charset=utf-8"
  | "text/css; charset=utf-8"
  | "image/svg+xml"
  | "image/png"
  | "font/woff2"
  | "application/octet-stream" {
  switch (extname(path).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}
