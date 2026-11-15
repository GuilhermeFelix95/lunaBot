import type {
  AgentMemoryLimit,
  ApprovalPolicyMode,
  BusyMessageMode,
  WindowCloseBehavior,
} from "./ipc-agent-preferences";
import type {
  AppInfo,
  AppSetupState,
  ComputerUseMacSetupState,
  ExportResult,
  ExternalDestination,
  MacPermissionId,
  ProviderRuntimeSnapshot,
  SaveSetupInput,
  UpdatePreference,
  UpdateStatus,
} from "./ipc-app-auth";
import type {
  BrowserBounds,
  BrowserControlState,
  BrowserDisplayState,
  BrowserNavigateInput,
  BrowserOpenInput,
  BrowserPictureInPictureEvent,
  BrowserPreview,
  BrowserTab,
  BrowserVisibilityInput,
} from "./ipc-browser";
import type {
  AccountUsage,
  AcknowledgeFailedTurnInput,
  AgentEvent,
  AgentModelOption,
  AgentProviderId,
  AgentStatus,
  AttachmentImportEvent,
  BotMemory,
  BotSummary,
  CancelQueuedMessageInput,
  ChooseAttachmentsInput,
  ConversationPage,
  ConversationReadState,
  ConversationSearchPage,
  ConversationWithReadState,
  CreateBotInput,
  CreateBotMemoryInput,
  CreateRoutineInput,
  DeleteBotMemoryInput,
  DeleteRoutineInput,
  DraftAttachment,
  DuplicateBotResult,
  FilePreview,
  InterruptTurnInput,
  ListRoutineRunsInput,
  MarkConversationReadInput,
  OpenAttachmentInput,
  OpenSharedFileInput,
  OpenWorkspaceFileInput,
  PinnedMessagesSnapshot,
  QueuedMessageReceipt,
  QueueSnapshot,
  ReadConversationPageInput,
  ReorderQueueInput,
  RespondToApprovalInput,
  RespondToBrowserTakeoverInput,
  RespondToPromptInput,
  Routine,
  RoutineRun,
  SearchConversationMessagesInput,
  SendMessageInput,
  SetAgentAvatarInput,
  SetMessagePinnedInput,
  SetMessageReactionInput,
  SidebarLayoutAction,
  SidebarLayoutSnapshot,
  SteerQueuedMessageInput,
  TestRoutineInput,
  UpdateBotInput,
  UpdateBotMemoryInput,
  UpdateQueuedMessageInput,
  UpdateRoutineInput,
} from "./ipc-conversation";
import type {
  DynamicIslandAction,
  DynamicIslandGeometry,
  DynamicIslandPreference,
  DynamicIslandPresentation,
  SetDynamicIslandInteractiveInput,
  SetDynamicIslandPreferenceInput,
} from "./ipc-dynamic-island";
import type {
  CreateRoomInput,
  DismissRoomMemberInput,
  ResolveRoomRequestInput,
  Room,
  RoomBackstageMessage,
} from "./ipc-rooms";
import type { VoiceModelStatus, VoiceTranscriptionInput, VoiceTranscriptionResult } from "./ipc-voice";

export interface AgentDesktopApi {
  getStatus: () => Promise<AgentStatus>;
  getUsage: () => Promise<AccountUsage>;
  listModels: () => Promise<AgentModelOption[]>;
  listBots: () => Promise<BotSummary[]>;
  getSidebarLayout: () => Promise<SidebarLayoutSnapshot>;
  mutateSidebarLayout: (action: SidebarLayoutAction) => Promise<SidebarLayoutSnapshot>;
  createBot: (input: CreateBotInput) => Promise<BotSummary>;
  duplicateBot: (botId: string) => Promise<DuplicateBotResult>;
  updateBot: (input: UpdateBotInput) => Promise<BotSummary>;
  setAvatar: (input: SetAgentAvatarInput) => Promise<BotSummary>;
  deleteBot: (botId: string) => Promise<void>;
  exportAgent: (botId: string) => Promise<boolean>;
  importAgent: () => Promise<BotSummary | null>;
  listMemories: (botId: string) => Promise<BotMemory[]>;
  createMemory: (input: CreateBotMemoryInput) => Promise<BotMemory>;
  updateMemory: (input: UpdateBotMemoryInput) => Promise<BotMemory>;
  deleteMemory: (input: DeleteBotMemoryInput) => Promise<void>;
  clearMemories: (botId: string) => Promise<void>;
  listRoutines: (botId: string) => Promise<Routine[]>;
  createRoutine: (input: CreateRoutineInput) => Promise<Routine>;
  updateRoutine: (input: UpdateRoutineInput) => Promise<Routine>;
  deleteRoutine: (input: DeleteRoutineInput) => Promise<void>;
  testRoutine: (input: TestRoutineInput) => Promise<RoutineRun>;
  listRoutineRuns: (input: ListRoutineRunsInput) => Promise<RoutineRun[]>;
  readConversation: (botId: string) => Promise<ConversationWithReadState>;
  readConversationPage: (input: ReadConversationPageInput) => Promise<ConversationPage>;
  searchConversationMessages: (input: SearchConversationMessagesInput) => Promise<ConversationSearchPage>;
  listConversationReads: () => Promise<Record<string, ConversationReadState>>;
  markConversationRead: (input: MarkConversationReadInput) => Promise<ConversationReadState>;
  chooseAttachments: (input: ChooseAttachmentsInput) => Promise<DraftAttachment[]>;
  onAttachmentImport: (listener: (event: AttachmentImportEvent) => void) => () => void;
  discardDraftAttachment: (attachmentId: string) => Promise<void>;
  openAttachment: (input: OpenAttachmentInput) => Promise<void>;
  openSharedFile: (input: OpenSharedFileInput) => Promise<void>;
  openWorkspaceFile: (input: OpenWorkspaceFileInput) => Promise<void>;
  previewSharedFile: (input: OpenSharedFileInput) => Promise<FilePreview>;
  previewWorkspaceFile: (input: OpenWorkspaceFileInput) => Promise<FilePreview>;
  sendMessage: (input: SendMessageInput) => Promise<QueuedMessageReceipt>;
  setMessageReaction: (input: SetMessageReactionInput) => Promise<void>;
  listPinnedMessages: (botId: string) => Promise<PinnedMessagesSnapshot>;
  setMessagePinned: (input: SetMessagePinnedInput) => Promise<PinnedMessagesSnapshot>;
  listQueue: (botId: string) => Promise<QueueSnapshot>;
  acknowledgeFailedTurn: (input: AcknowledgeFailedTurnInput) => Promise<void>;
  cancelQueuedMessage: (input: CancelQueuedMessageInput) => Promise<void>;
  steerQueuedMessage: (input: SteerQueuedMessageInput) => Promise<void>;
  updateQueuedMessage: (input: UpdateQueuedMessageInput) => Promise<void>;
  reorderQueue: (input: ReorderQueueInput) => Promise<void>;
  interrupt: (input: InterruptTurnInput) => Promise<void>;
  respondToPrompt: (input: RespondToPromptInput) => Promise<void>;
  respondToApproval: (input: RespondToApprovalInput) => Promise<void>;
  respondToBrowserTakeover: (input: RespondToBrowserTakeoverInput) => Promise<void>;
  onEvent: (listener: (event: AgentEvent) => void) => () => void;
}

export interface BrowserDesktopApi {
  open: (input: BrowserOpenInput) => Promise<BrowserTab>;
  activate: (tabId: string) => Promise<void>;
  navigate: (input: BrowserNavigateInput) => Promise<void>;
  reload: (tabId: string) => Promise<void>;
  close: (tabId: string) => Promise<void>;
  listTabs: () => Promise<BrowserTab[]>;
  getDisplayState: () => Promise<BrowserDisplayState>;
  getControlState: () => Promise<BrowserControlState>;
  capturePreview: (tabId: string) => Promise<BrowserPreview>;
  setVisible: (input: BrowserVisibilityInput) => Promise<void>;
  onDisplayState: (listener: (state: BrowserDisplayState) => void) => () => void;
  openPictureInPicture: (bounds?: BrowserBounds) => Promise<BrowserBounds>;
  closePictureInPicture: () => Promise<void>;
  dockPictureInPicture: () => Promise<void>;
  hidePictureInPicture: () => Promise<void>;
  onPictureInPictureEvent: (listener: (event: BrowserPictureInPictureEvent) => void) => () => void;
}

export interface UpdateDesktopApi {
  getStatus: () => Promise<UpdateStatus>;
  check: () => Promise<UpdateStatus>;
  download: () => Promise<UpdateStatus>;
  install: () => Promise<void>;
  getPreference: () => Promise<UpdatePreference>;
  setPreference: (input: UpdatePreference) => Promise<UpdatePreference>;
  onEvent: (listener: (status: UpdateStatus) => void) => () => void;
}

export interface AgentPreferencesDesktopApi {
  getMemoryLimit: () => Promise<AgentMemoryLimit>;
  setMemoryLimit: (limit: AgentMemoryLimit) => Promise<AgentMemoryLimit>;
  getClaudeCompactWindow: () => Promise<number | null>;
  setClaudeCompactWindow: (tokens: number | null) => Promise<number | null>;
  getBusyMessageMode: () => Promise<BusyMessageMode>;
  setBusyMessageMode: (mode: BusyMessageMode) => Promise<BusyMessageMode>;
  getWindowCloseBehavior: () => Promise<WindowCloseBehavior>;
  setWindowCloseBehavior: (behavior: WindowCloseBehavior) => Promise<WindowCloseBehavior>;
  getApprovalPolicy: (botId: string) => Promise<ApprovalPolicyMode>;
  setApprovalPolicy: (input: { botId: string; mode: ApprovalPolicyMode }) => Promise<ApprovalPolicyMode>;
}

export interface ProviderRuntimesDesktopApi {
  getStatus: () => Promise<ProviderRuntimeSnapshot>;
  download: (provider: AgentProviderId) => Promise<ProviderRuntimeSnapshot>;
  cancel: (provider: AgentProviderId) => Promise<ProviderRuntimeSnapshot>;
  onEvent: (listener: (snapshot: ProviderRuntimeSnapshot) => void) => () => void;
}

export interface MaintenanceDesktopApi {
  exportData: () => Promise<ExportResult>;
  exportDiagnostics: () => Promise<ExportResult>;
}

export interface DynamicIslandDesktopApi {
  getPreference: () => Promise<DynamicIslandPreference>;
  setPreference: (input: SetDynamicIslandPreferenceInput) => Promise<DynamicIslandPreference>;
  publishPresentation: (presentation: DynamicIslandPresentation) => Promise<void>;
  getPresentation: () => Promise<DynamicIslandPresentation>;
  onPreference: (listener: (preference: DynamicIslandPreference) => void) => () => void;
  onPresentation: (listener: (presentation: DynamicIslandPresentation) => void) => () => void;
  onGeometry: (listener: (geometry: DynamicIslandGeometry) => void) => () => void;
  performAction: (action: DynamicIslandAction) => Promise<void>;
  performHaptic: () => Promise<void>;
  onAction: (listener: (action: DynamicIslandAction) => void) => () => void;
  setInteractive: (input: SetDynamicIslandInteractiveInput) => Promise<void>;
}

export interface VoiceDesktopApi {
  getModelStatus: () => Promise<VoiceModelStatus>;
  prepareModel: () => Promise<VoiceModelStatus>;
  transcribe: (input: VoiceTranscriptionInput) => Promise<VoiceTranscriptionResult>;
  onModelStatus: (listener: (status: VoiceModelStatus) => void) => () => void;
}

export const APP_THEMES = ["auto", "papel", "eclipse", "quadrante"] as const;
export type AppTheme = (typeof APP_THEMES)[number];

export const APP_MODES = ["system", "light", "dark"] as const;
export type AppMode = (typeof APP_MODES)[number];

export const APP_LOCALES = ["en", "pt-BR"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export interface AppDesktopApi {
  setTheme: (input: { theme: AppTheme; mode: AppMode }) => Promise<void>;
  setLocale: (input: { locale: AppLocale }) => Promise<void>;
}

export interface RoomsDesktopApi {
  list: () => Promise<Room[]>;
  create: (input: CreateRoomInput) => Promise<Room>;
  archive: (roomId: string) => Promise<Room>;
  reopen: (roomId: string) => Promise<Room>;
  deleteForever: (roomId: string) => Promise<void>;
  dismissMember: (input: DismissRoomMemberInput) => Promise<Room>;
  resolveRequest: (input: ResolveRoomRequestInput) => Promise<Room>;
  backstage: (roomId: string) => Promise<RoomBackstageMessage[]>;
  // Manager and active member profiles, for the room conversation. General listings never include them.
  botProfiles: (roomId: string) => Promise<BotSummary[]>;
  onChanged: (listener: (rooms: Room[]) => void) => () => void;
  onBackstageChanged: (listener: (roomId: string) => void) => () => void;
}

export interface LunaBotDesktopApi {
  getAppInfo: () => Promise<AppInfo>;
  getSetupState: () => Promise<AppSetupState>;
  saveSetup: (input: SaveSetupInput) => Promise<AppSetupState>;
  app: AppDesktopApi;
  dynamicIsland: DynamicIslandDesktopApi;
  getComputerUseMacSetupState: () => Promise<ComputerUseMacSetupState>;
  openComputerUsePermissionSetup: (permission: MacPermissionId) => Promise<ComputerUseMacSetupState>;
  startComputerUseHelperDrag: () => Promise<void>;
  revealComputerUseHelper: () => Promise<void>;
  closeComputerUsePermissionSetup: () => Promise<void>;
  openExternal: (destination: ExternalDestination) => Promise<void>;
  connectChatGPT: () => Promise<AgentStatus>;
  connectClaude: () => Promise<AgentStatus>;
  connectGrok: () => Promise<AgentStatus>;
  refreshAgentProviders: () => Promise<AgentStatus>;
  providerRuntimes: ProviderRuntimesDesktopApi;
  openUrl: (url: string) => Promise<void>;
  voice: VoiceDesktopApi;
  agent: AgentDesktopApi;
  rooms: RoomsDesktopApi;
  browser: BrowserDesktopApi;
  update: UpdateDesktopApi;
  agentPreferences: AgentPreferencesDesktopApi;
  maintenance: MaintenanceDesktopApi;
}
