import { createMemo, createSignal, Loading, lazy, Show } from "solid-js";
import { useAppController } from "./App";
import { toBotProfile } from "./app-message-projection";
import { Conversation } from "./components/Conversation";
import { FIRST_BOT_SUGGESTIONS, FirstBotSetup } from "./components/FirstBotSetup";
import { PanelResizer, savePanelWidth } from "./components/PanelResizer";
import { CreateRoomDialog } from "./components/rooms/CreateRoomDialog";
import { RoomsSidebar } from "./components/rooms/RoomsSidebar";
import { RoomView } from "./components/rooms/RoomView";
import { Sidebar } from "./components/Sidebar";
import { t } from "./i18n";
import { fallbackDesktopPlatform, platformLayout } from "./platform-layout";
import { useSidebarShortcut } from "./use-sidebar-shortcut";

const AccountDock = lazy(() => import("./components/AccountDock").then((module) => ({ default: module.AccountDock })));
const GlobalSearch = lazy(() =>
  import("./components/GlobalSearch").then((module) => ({ default: module.GlobalSearch })),
);
const InitialSetup = lazy(() =>
  import("./components/InitialSetup").then((module) => ({ default: module.InitialSetup })),
);
const SettingsModal = lazy(() =>
  import("./components/SettingsModal").then((module) => ({ default: module.SettingsModal })),
);

export function AppView() {
  const {
    props: appProps,
    appInfo,
    agentStatus,
    providerRuntimeStatuses,
    providerRuntimeDownloadsAvailable,
    downloadProviderRuntime,
    cancelProviderRuntimeDownload,
    connectChatGPT,
    connectClaude,
    connectGrok,
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
    sidebarLayout,
    collapsedSidebarSectionIds,
    mutateSidebarLayout,
    toggleSidebarSection,
    pinnedSidebarItems,
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
    appSettingsOpen,
    openAppSettings,
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
    respondToBrowserTakeover,
    cancelQueuedMessage,
    steerQueuedMessage,
    updateQueuedMessage,
    reorderQueue,
    activateBrowserTab,
    closeBrowserTab,
    stopActiveTurn,
    setGlobalSearchVisibility,
  } = useAppController();

  const layout = () => platformLayout(appInfo()?.platform);
  const sidebarShortcutLabel = () => (layout().macOSChrome ? "⌘B" : "Ctrl+B");
  useSidebarShortcut({
    macOS: () => layout().macOSChrome,
    onToggle: () => (leftPanelCompact() ? expandSidebar() : setSidebarCollapsed(true)),
  });

  const [createRoomOpen, setCreateRoomOpen] = createSignal(false);
  const roomBots = createMemo(() => botList().map((bot) => ({ id: bot.id, name: bot.name, title: bot.title })));

  const activePrompt = createMemo(() => {
    const bot = activeBot();
    const event = bot ? pendingPrompts()[bot.id] : undefined;
    return event?.type === "prompt" ? event : undefined;
  });

  const activeBrowserTakeover = createMemo(() => {
    const bot = activeBot();
    const event = bot ? pendingPrompts()[bot.id] : undefined;
    return event?.type === "browser-takeover-requested" ? event.request : undefined;
  });

  // In a room the conversation lists the room's own bots; otherwise it lists the general bots.
  const conversationBots = () => {
    const roomId = roomsStore.selectedRoomId();
    return roomId ? roomsStore.profiles(roomId).map(toBotProfile) : botList();
  };

  // An archived room keeps its conversation readable, but its composer stays locked.
  const composerLockedReason = () => {
    const roomId = roomsStore.selectedRoomId();
    const room = roomId ? roomsStore.rooms().find((item) => item.id === roomId) : undefined;
    return room?.status === "archived" ? t("rooms.view.composerArchived") : undefined;
  };

  // One conversation serves both views: general bots, or a room's manager with its composer.
  const renderConversation = () => (
    <Conversation
      agentStatus={agentStatus()}
      composerLockedReason={composerLockedReason()}
      providerRuntimeStatuses={providerRuntimeDownloadsAvailable() ? providerRuntimeStatuses() : undefined}
      onDownloadProvider={providerRuntimeDownloadsAvailable() ? downloadProviderRuntime : undefined}
      onCancelProviderDownload={providerRuntimeDownloadsAvailable() ? cancelProviderRuntimeDownload : undefined}
      onConnectProvider={
        providerRuntimeDownloadsAvailable()
          ? (provider) =>
              provider === "codex" ? connectChatGPT() : provider === "claude" ? connectClaude() : connectGrok()
          : undefined
      }
      bot={activeBot()}
      bots={conversationBots()}
      availableRoutineIds={activeRoutineIds()}
      modelOptions={modelOptions()}
      messages={activeMessages()}
      messageReferences={activeBot() ? (conversationReferences()[activeBot()?.id ?? ""] ?? {}) : {}}
      unreadCount={activeBot() ? (conversationReads()[activeBot()?.id ?? ""]?.unreadCount ?? 0) : 0}
      firstUnreadMessageId={
        activeBot() ? (conversationReads()[activeBot()?.id ?? ""]?.firstUnreadMessageId ?? null) : null
      }
      loaded={activeBot() ? conversationLoaded()[activeBot()?.id ?? ""] === true : false}
      hasOlder={activeBot() ? (conversationPages()[activeBot()?.id ?? ""]?.hasOlder ?? false) : false}
      discontinuous={activeBot() ? conversationWindowModes()[activeBot()?.id ?? ""] === "around" : false}
      loadingOlder={activeBot() ? conversationOlderLoading()[activeBot()?.id ?? ""] === true : false}
      olderError={activeBot() ? (conversationOlderErrors()[activeBot()?.id ?? ""] ?? null) : null}
      queue={activeQueue()}
      browserTabs={browserTabs()}
      activeBrowserTabId={activeBrowserTabId()}
      browserVisibilitySuspended={browserVisibilitySuspended()}
      browserControlState={browserControlState()}
      browserEnabled={!appProps.landingPreview}
      prompt={activePrompt()}
      approval={activeBot() ? pendingApprovals()[activeBot()?.id ?? ""] : undefined}
      browserTakeover={activeBrowserTakeover()}
      activeTurnId={activeBot() ? activeTurns()[activeBot()?.id ?? ""] : null}
      backgroundTasks={activeBot() ? (backgroundTasks()[activeBot()?.id ?? ""] ?? []) : []}
      globalOverlayOpen={globalSearchOpen() || appSettingsOpen()}
      settingsRequest={settingsRequest()}
      messageFocusRequest={messageFocusRequest()}
      onSelectAgent={selectBot}
      onUpdateBot={updateBot}
      onSetAgentAvatar={setAgentAvatar}
      onSendMessage={sendMessage}
      onMarkRead={() => markAgentMessagesRead()}
      onLoadOlder={() => void loadOlderAgentMessages()}
      onLoadLatest={() => (activeBot() ? loadLatestAgentMessages(activeBot()?.id ?? "") : Promise.resolve())}
      onSearchMessages={(query) =>
        activeBot() ? searchAgentMessages(activeBot()?.id ?? "", query) : Promise.resolve({ messageIds: [], total: 0 })
      }
      onOpenSearchMessage={(messageId) =>
        activeBot() ? openAgentMessage(activeBot()?.id ?? "", messageId) : Promise.resolve()
      }
      onAnswerPrompt={answerPrompt}
      onPromptResolutionPresented={presentPromptResolution}
      onRespondToApproval={respondToApproval}
      onRespondToBrowserTakeover={respondToBrowserTakeover}
      onCancelQueuedMessage={cancelQueuedMessage}
      onSteerQueuedMessage={steerQueuedMessage}
      onUpdateQueuedMessage={updateQueuedMessage}
      onReorderQueue={reorderQueue}
      onActivateBrowserTab={activateBrowserTab}
      onCloseBrowserTab={closeBrowserTab}
      onStop={stopActiveTurn}
    />
  );

  return (
    <div
      class={[
        "app-frame",
        {
          "app-frame-sidebar-compact": leftPanelCompact(),
          "app-frame-platform-darwin": layout().macOSChrome,
        },
      ]}
      style={`--left-panel-width: ${leftPanelCompact() ? LEFT_PANEL_COMPACT : leftPanelWidth()}px`}
    >
      <Sidebar
        bots={botList()}
        activeBotId={activeBot()?.id ?? ""}
        agentStates={sidebarAgentStates()}
        layout={sidebarLayout()}
        layoutMutable={true}
        collapsedSectionIds={collapsedSidebarSectionIds()}
        onMutateLayout={mutateSidebarLayout}
        onToggleSection={toggleSidebarSection}
        pinnedItems={pinnedSidebarItems()}
        onPin={pinSidebarItem}
        onUnpin={unpinSidebarItem}
        onReorderPinned={reorderPinnedSidebarItems}
        onSelectBot={selectBot}
        onCreateBot={openLunaBotSetup}
        onCreateRoom={() => setCreateRoomOpen(true)}
        roomsSection={<RoomsSidebar store={roomsStore} compact={leftPanelCompact()} />}
        onEditBot={editBot}
        duplicateSupported={true}
        duplicatingBotIds={duplicatingBotIds()}
        onDuplicateBot={duplicateBot}
        onExportBot={exportBot}
        onImportBot={importBot}
        onDeleteBot={deleteBot}
        compact={leftPanelCompact()}
        onExpand={expandSidebar}
        onCollapse={() => setSidebarCollapsed(true)}
        onOpenGlobalSearch={() => setGlobalSearchVisibility(true)}
        shortcutLabel={sidebarShortcutLabel()}
        emptyAction={
          botList().length === 0
            ? {
                label: t("sidebar.emptyAction.createFirst"),
                avatarSeed: botSetupDraft().avatarSeed,
                avatarHue: botSetupDraft().avatarHue,
                onSelect: openLunaBotSetup,
              }
            : undefined
        }
      />
      <Loading>
        <AccountDock
          appInfo={appInfo()}
          agentStatus={agentStatus()}
          accountUsage={accountUsage()}
          updateStatus={updateStatus()}
          compact={leftPanelCompact()}
          withLeadingColumn={layout().withLeadingColumn}
          onRefreshUsage={refreshAccountUsage}
          onUpdateAction={runUpdateAction}
          onOpenPermissions={() => setPermissionsOpen(true)}
          onOpenSettings={openAppSettings}
        />
      </Loading>
      <PanelResizer
        class="left-panel-resizer"
        label={t("sidebar.resizeLeft")}
        controls="bot-sidebar"
        direction="left"
        value={leftPanelWidth()}
        defaultValue={LEFT_PANEL_DEFAULT}
        min={LEFT_PANEL_MIN}
        max={LEFT_PANEL_MAX}
        onResize={setLeftPanelWidth}
        onResizeEnd={(value) => savePanelWidth(LEFT_PANEL_STORAGE_KEY, value)}
        snap={{
          compactValue: LEFT_PANEL_COMPACT,
          compact: leftPanelCompact(),
          collapseThreshold: LEFT_PANEL_COLLAPSE_THRESHOLD,
          expandThreshold: LEFT_PANEL_EXPAND_THRESHOLD,
          onCompactChange: (compact) => {
            if (compact) setSidebarCollapsed(true);
            else expandSidebar();
          },
        }}
      />
      <Show when={botSetupOpen()}>
        <FirstBotSetup
          value={botSetupDraft()}
          suggestions={FIRST_BOT_SUGGESTIONS}
          mode={botList().length === 0 ? "first" : "additional"}
          submitting={creatingAgent()}
          error={botSetupError()}
          onChange={setBotSetupDraft}
          onSubmit={createAgent}
          onCancel={botList().length > 0 ? cancelBotSetup : undefined}
        />
      </Show>
      <CreateRoomDialog
        open={createRoomOpen()}
        bots={roomBots()}
        onOpenChange={setCreateRoomOpen}
        onCreated={(room) => {
          setCreateRoomOpen(false);
          roomsStore.openRoom(room.id);
        }}
      />
      <Show when={!botSetupOpen() && roomsStore.selectedRoomId()}>
        {(roomId) => (
          <RoomView
            store={roomsStore}
            roomId={roomId()}
            nameOfBot={(botId) => botList().find((bot) => bot.id === botId)?.name}
            creatingRequestId={roomRequestCreation()?.requestId ?? null}
            onCreateBotForRequest={openNewBotFromRoomRequest}
            renderConversation={renderConversation}
          />
        )}
      </Show>
      <Show when={!botSetupOpen() && !roomsStore.selectedRoomId()}>{renderConversation()}</Show>
      <WorkspaceOverlays />
    </div>
  );
}

function WorkspaceOverlays() {
  const {
    permissionsOpen,
    setPermissionsOpen,
    setupState,
    agentStatus,
    appInfo,
    saveSetup,
    appSettingsOpen,
    setAppSettingsOpen,
    generalSettings,
    setGeneralSettings,
    appSettingsRestoreTarget,
    updateStatus,
    runUpdateAction,
    providerRuntimeStatuses,
    providerRuntimeDownloadsAvailable,
    downloadProviderRuntime,
    cancelProviderRuntimeDownload,
    connectChatGPT,
    connectClaude,
    connectGrok,
    globalSearchOpen,
    botList,
    searchGlobalMessages,
    setGlobalSearchVisibility,
    selectBot,
    selectGlobalSearchMessage,
    refreshAgentStatus,
  } = useAppController();

  return (
    <>
      <Show when={permissionsOpen()}>
        <Loading>
          <InitialSetup
            reviewing
            state={setupState() ?? { completed: true, preferredProvider: "codex" }}
            agentStatus={agentStatus()}
            platform={appInfo()?.platform ?? fallbackDesktopPlatform()}
            onSave={saveSetup}
            onRefreshProviders={refreshAgentStatus}
            onClose={() => setPermissionsOpen(false)}
          />
        </Loading>
      </Show>
      <Loading>
        <SettingsModal
          open={appSettingsOpen()}
          onOpenChange={setAppSettingsOpen}
          value={generalSettings()}
          onValueChange={setGeneralSettings}
          appInfo={appInfo()}
          updateStatus={updateStatus()}
          onUpdateAction={runUpdateAction}
          agentStatus={agentStatus()}
          providerRuntimeStatuses={providerRuntimeDownloadsAvailable() ? providerRuntimeStatuses() : undefined}
          onDownloadProvider={providerRuntimeDownloadsAvailable() ? downloadProviderRuntime : undefined}
          onCancelProviderDownload={providerRuntimeDownloadsAvailable() ? cancelProviderRuntimeDownload : undefined}
          onRefreshProviders={refreshAgentStatus}
          onConnectProvider={
            providerRuntimeDownloadsAvailable()
              ? (provider) =>
                  provider === "codex" ? connectChatGPT() : provider === "claude" ? connectClaude() : connectGrok()
              : undefined
          }
          restoreFocusTarget={appSettingsRestoreTarget()}
        />
      </Loading>
      <Show when={globalSearchOpen()}>
        <Loading>
          <GlobalSearch
            open={true}
            bots={botList()}
            onSearchMessages={searchGlobalMessages}
            onOpenChange={setGlobalSearchVisibility}
            onSelectBot={selectBot}
            onSelectMessage={selectGlobalSearchMessage}
          />
        </Loading>
      </Show>
    </>
  );
}
