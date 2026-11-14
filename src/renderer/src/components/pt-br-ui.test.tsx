import type { DynamicIslandBotIdentity } from "@lunabot/contracts/ipc";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_GENERAL_SETTINGS } from "../app-settings";
import type { BotMessage } from "../data";
import { setLocalePreference } from "../i18n";
import {
  STORY_AGENT_STATUS,
  STORY_APP_INFO,
  STORY_BOTS,
  STORY_BROWSER_CONTROL,
  STORY_MODELS,
  STORY_UPDATE_STATUS,
  STORY_USAGE,
} from "../preview/fixtures";
import { createMockLunaBot, type MockLunaBotControls } from "../preview/mock-lunabot";
import { defaultSidebarLayout } from "../sidebar-sections";
import { AccountDock } from "./AccountDock";
import { ConversationControllerProvider, type ConversationProps, createConversationController } from "./Conversation";
import { ConversationView } from "./ConversationView";
import { AgentMemoriesModal } from "./conversation/AgentMemoriesModal";
import { AgentRoutinesSettings } from "./conversation/AgentRoutinesSettings";
import AgentSettingsPanel from "./conversation/AgentSettingsPanel";
import { DEFAULT_FIRST_BOT_DRAFT, FIRST_BOT_SUGGESTIONS, FirstBotSetup } from "./FirstBotSetup";
import { GlobalSearch } from "./GlobalSearch";
import { InitialSetup } from "./InitialSetup";
import { LunaBotDynamicIsland } from "./LunaBotDynamicIsland";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { ProviderPicker } from "./ProviderPicker";
import { SettingsModal } from "./SettingsModal";
import { Sidebar } from "./Sidebar";
import type { DynamicIslandViewState } from "./ui";

// English words a pt-BR screen must not show as UI text. Proper names such as Luna Bot, Claude or Codex are not listed.
// Bot names, model replies and user messages are content, so the fixtures used below avoid these words.
const ENGLISH_UI_WORDS = [
  "Settings",
  "Search",
  "Cancel",
  "Create",
  "Delete",
  "Save",
  "Send",
  "Connect",
  "Download",
  "Retry",
  "Close",
  "Open",
  "Add",
  "Edit",
  "View",
  "Window",
  "Help",
  "Loading",
  "Error",
  "Failed",
  "Update",
  "Remove",
  "Name",
  "Description",
  "Provider",
  "Model",
  "Memory",
  "Memories",
  "Routine",
  "Routines",
  "Queue",
  "Message",
  "Agent",
];

function visibleStrings(container: HTMLElement): string[] {
  const strings = [container.textContent ?? ""];
  for (const element of container.querySelectorAll("*")) {
    for (const attribute of ["aria-label", "placeholder", "title"]) {
      const value = element.getAttribute(attribute);
      if (value) strings.push(value);
    }
  }
  return strings;
}

function englishWordsIn(container: HTMLElement): string[] {
  const found = new Set<string>();
  for (const text of visibleStrings(container)) {
    for (const word of ENGLISH_UI_WORDS) {
      if (new RegExp(`\\b${word}\\b`).test(text)) found.add(`${word} (in "${text.trim()}")`);
    }
  }
  return [...found];
}

const idleUpdateStatus = { ...STORY_UPDATE_STATUS, phase: "idle" as const, availableVersion: null };

function ProvidedConversation(props: ConversationProps) {
  return (
    <ConversationControllerProvider controller={createConversationController()}>
      <ConversationView {...props} />
    </ConversationControllerProvider>
  );
}

describe("pt-BR screens", () => {
  beforeAll(() => setLocalePreference("pt-BR"));
  afterAll(() => setLocalePreference("en"));

  it("shows the first-bot setup without English UI words", () => {
    const view = render(() => (
      <FirstBotSetup
        value={{ ...DEFAULT_FIRST_BOT_DRAFT }}
        suggestions={FIRST_BOT_SUGGESTIONS}
        onChange={() => undefined}
        onSubmit={() => undefined}
      />
    ));

    expect(view.getByDisplayValue("Novo Bot")).toBeInTheDocument();
    expect(view.getByText("Resumo da manhã")).toBeInTheDocument();
    expect(englishWordsIn(view.container)).toEqual([]);
  });

  it("detects English UI words so the screen checks cannot pass vacuously", () => {
    const view = render(() => (
      <div>
        <button type="button" aria-label="Save">
          Settings
        </button>
        <input placeholder="Search agents" />
      </div>
    ));

    const found = englishWordsIn(view.container).join("\n");
    expect(found).toContain("Settings");
    expect(found).toContain("Save");
    expect(found).toContain("Search");
  });

  it("shows provider status without English UI words", () => {
    const view = render(() => (
      <ProviderPicker
        value={null}
        ariaLabel="Provedor padrão"
        options={[
          { id: "claude", name: "Claude", state: "checking" },
          { id: "codex", name: "ChatGPT", state: "not-installed" },
          { id: "grok", name: "Grok", state: "available" },
        ]}
        onChange={() => undefined}
        onRefreshProviders={() => undefined}
      />
    ));

    expect(view.getByText("Conectado")).toBeInTheDocument();
    expect(englishWordsIn(view.container)).toEqual([]);
  });
});

describe("pt-BR main screens", () => {
  let mock: MockLunaBotControls | undefined;

  beforeAll(() => setLocalePreference("pt-BR"));
  afterAll(() => setLocalePreference("en"));
  afterEach(() => {
    mock?.dispose();
    mock = undefined;
    vi.restoreAllMocks();
  });

  function useMock(): void {
    mock = createMockLunaBot();
    window.lunabot = mock.api;
  }

  it("shows the General and Updates tabs of settings without English UI words", async () => {
    render(() => (
      <SettingsModal
        open
        onOpenChange={() => undefined}
        value={{ ...DEFAULT_GENERAL_SETTINGS }}
        onValueChange={() => undefined}
        appInfo={STORY_APP_INFO}
        updateStatus={idleUpdateStatus}
        onUpdateAction={vi.fn(async () => undefined)}
      />
    ));

    const tabs = await screen.findAllByRole("tab");
    expect(englishWordsIn(document.body)).toEqual([]);
    for (const tab of tabs) fireEvent.click(tab);
    expect(englishWordsIn(document.body)).toEqual([]);
  });

  it("shows the sidebar with no agents and with two agents without English UI words", () => {
    const sidebarProps = {
      layout: defaultSidebarLayout(),
      collapsedSectionIds: [],
      onMutateLayout: vi.fn(async () => undefined),
      onToggleSection: vi.fn(),
      pinnedItems: [],
      onPin: vi.fn(),
      onUnpin: vi.fn(),
      onReorderPinned: vi.fn(),
      onSelectBot: vi.fn(),
      onCreateBot: vi.fn(),
      onEditBot: vi.fn(),
      onDuplicateBot: vi.fn(async () => undefined),
      onDeleteBot: vi.fn(async () => undefined),
      compact: false,
      onExpand: vi.fn(),
      onCollapse: vi.fn(),
      onOpenGlobalSearch: vi.fn(),
      shortcutLabel: "Ctrl+B",
      activeBotId: "",
      agentStates: {},
    };

    const empty = render(() => <Sidebar {...sidebarProps} bots={[]} />);
    expect(englishWordsIn(empty.container)).toEqual([]);
    empty.unmount();

    const two = render(() => <Sidebar {...sidebarProps} bots={STORY_BOTS.slice(0, 2)} activeBotId="chief" />);
    expect(two.getByText("Chief")).toBeInTheDocument();
    expect(englishWordsIn(two.container)).toEqual([]);
    two.unmount();

    const collapsed = render(() => (
      <Sidebar {...sidebarProps} bots={STORY_BOTS.slice(0, 2)} activeBotId="chief" compact />
    ));
    expect(collapsed.getByRole("button", { name: "Expandir barra lateral" })).toBeInTheDocument();
    expect(englishWordsIn(collapsed.container)).toEqual([]);
  });

  it("shows global search without English UI words", () => {
    const view = render(() => (
      <GlobalSearch
        open
        bots={STORY_BOTS}
        onSearchMessages={vi.fn(async () => [])}
        onOpenChange={() => undefined}
        onSelectBot={() => undefined}
        onSelectMessage={() => undefined}
      />
    ));

    expect(englishWordsIn(document.body)).toEqual([]);
    expect(view.container).toBeDefined();
  });

  it("shows the account dock without English UI words", () => {
    const view = render(() => (
      <AccountDock
        appInfo={STORY_APP_INFO}
        agentStatus={STORY_AGENT_STATUS}
        accountUsage={null}
        updateStatus={idleUpdateStatus}
        compact={false}
        withLeadingColumn={false}
        onRefreshUsage={vi.fn(async () => STORY_USAGE)}
        onUpdateAction={vi.fn(async () => undefined)}
        onOpenPermissions={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    ));

    expect(englishWordsIn(view.container)).toEqual([]);
  });

  it("shows the initial setup without English UI words", () => {
    useMock();
    const view = render(() => (
      <InitialSetup
        reviewing
        state={{ completed: true, preferredProvider: "codex" }}
        agentStatus={STORY_AGENT_STATUS}
        platform="darwin"
        onSave={async () => undefined}
        onClose={vi.fn()}
      />
    ));

    expect(englishWordsIn(view.container)).toEqual([]);
  });

  it("shows the provider and model picker without English UI words", () => {
    const view = render(() => (
      <ProviderModelPicker
        provider="codex"
        value={STORY_MODELS[0]?.id ?? "gpt-5.6-luna"}
        modelOptions={STORY_MODELS}
        agentStatus={STORY_AGENT_STATUS}
        onChange={() => undefined}
      />
    ));

    expect(englishWordsIn(view.container)).toEqual([]);
  });

  it("shows agent memories without English UI words", () => {
    useMock();
    const view = render(() => (
      <AgentMemoriesModal
        botId="chief"
        botName="Chief"
        open
        onOpenChange={() => undefined}
        onCountChange={() => undefined}
      />
    ));

    expect(englishWordsIn(document.body)).toEqual([]);
    expect(view.container).toBeDefined();
  });

  it("shows agent routines without English UI words", () => {
    useMock();
    render(() => <AgentRoutinesSettings botId="chief" onCountChange={() => undefined} />);

    expect(englishWordsIn(document.body)).toEqual([]);
  });

  it("shows agent settings without English UI words", () => {
    useMock();
    const bot = STORY_BOTS[0];
    if (!bot) throw new Error("Expected the Chief fixture.");
    const view = render(() => (
      <AgentSettingsPanel
        bot={bot}
        runtimeSettings={{ provider: bot.provider, model: bot.model, reasoningEffort: bot.reasoningEffort }}
        agentStatus={STORY_AGENT_STATUS}
        modelOptions={STORY_MODELS}
        working={false}
        maxWidth={() => 800}
        onClose={vi.fn()}
        onWidthChange={vi.fn()}
        onUpdateBot={vi.fn(async () => undefined)}
        onUpdateRuntimeSettings={vi.fn(async () => true)}
        onSetAgentAvatar={vi.fn(async () => undefined)}
      />
    ));

    expect(englishWordsIn(view.container)).toEqual([]);
  });

  it("shows an empty conversation without English UI words", () => {
    useMock();
    const bot = STORY_BOTS[0];
    const view = render(() => (
      <ProvidedConversation
        agentStatus={STORY_AGENT_STATUS}
        bot={bot}
        bots={STORY_BOTS}
        modelOptions={STORY_MODELS}
        messages={[]}
        unreadCount={0}
        firstUnreadMessageId={null}
        loaded
        activeTurnId={null}
        globalOverlayOpen={false}
        settingsRequest={null}
        messageFocusRequest={null}
        queue={undefined}
        browserTabs={[]}
        activeBrowserTabId={null}
        browserVisibilitySuspended={false}
        browserControlState={STORY_BROWSER_CONTROL}
        prompt={undefined}
        approval={undefined}
        browserTakeover={undefined}
        onSelectAgent={vi.fn()}
        onUpdateBot={vi.fn(async () => undefined)}
        onSetAgentAvatar={vi.fn(async () => undefined)}
        onSendMessage={vi.fn(async () => true)}
        onMarkRead={vi.fn(async () => undefined)}
        onAnswerPrompt={vi.fn(async () => true)}
        onRespondToApproval={vi.fn(async () => true)}
        onRespondToBrowserTakeover={vi.fn(async () => true)}
        onCancelQueuedMessage={vi.fn()}
        onSteerQueuedMessage={vi.fn()}
        onUpdateQueuedMessage={vi.fn(async () => true)}
        onReorderQueue={vi.fn()}
        onActivateBrowserTab={vi.fn()}
        onCloseBrowserTab={vi.fn()}
        onStop={vi.fn()}
      />
    ));

    expect(englishWordsIn(view.container)).toEqual([]);
  });

  it("shows one agent reply without English UI words", () => {
    useMock();
    const bot = STORY_BOTS[0];
    const reply: BotMessage = {
      id: "message-agent-1",
      author: "bot",
      body: "Pronto. Organizei as notas em um plano curto.",
      time: "09:43",
      status: "completed",
    };
    const view = render(() => (
      <ProvidedConversation
        agentStatus={STORY_AGENT_STATUS}
        bot={bot}
        bots={STORY_BOTS}
        modelOptions={STORY_MODELS}
        messages={[reply]}
        unreadCount={0}
        firstUnreadMessageId={null}
        loaded
        activeTurnId={null}
        globalOverlayOpen={false}
        settingsRequest={null}
        messageFocusRequest={null}
        queue={undefined}
        browserTabs={[]}
        activeBrowserTabId={null}
        browserVisibilitySuspended={false}
        browserControlState={STORY_BROWSER_CONTROL}
        prompt={undefined}
        approval={undefined}
        browserTakeover={undefined}
        onSelectAgent={vi.fn()}
        onUpdateBot={vi.fn(async () => undefined)}
        onSetAgentAvatar={vi.fn(async () => undefined)}
        onSendMessage={vi.fn(async () => true)}
        onMarkRead={vi.fn(async () => undefined)}
        onAnswerPrompt={vi.fn(async () => true)}
        onRespondToApproval={vi.fn(async () => true)}
        onRespondToBrowserTakeover={vi.fn(async () => true)}
        onCancelQueuedMessage={vi.fn()}
        onSteerQueuedMessage={vi.fn()}
        onUpdateQueuedMessage={vi.fn(async () => true)}
        onReorderQueue={vi.fn()}
        onActivateBrowserTab={vi.fn()}
        onCloseBrowserTab={vi.fn()}
        onStop={vi.fn()}
      />
    ));

    expect(view.getByText("Pronto. Organizei as notas em um plano curto.")).toBeInTheDocument();
    expect(englishWordsIn(view.container)).toEqual([]);
  });

  it("shows the dynamic island states without English UI words", () => {
    const bot: DynamicIslandBotIdentity = {
      id: "research",
      name: "Pesquisa",
      avatarSeed: "research",
      avatarHue: 215,
      avatarUrl: null,
    };
    const states: Array<{ name: string; presentation: Parameters<typeof LunaBotDynamicIsland>[0]["presentation"] }> = [
      { name: "idle", presentation: { mode: "idle" } },
      { name: "working", presentation: { mode: "working", working: [{ bot, task: "Verificando fontes" }] } },
      {
        name: "message",
        presentation: {
          mode: "message",
          unreadCount: 1,
          message: { bot, messageId: "reply-1", text: "A verificação está pronta.", createdAt: "2026-08-29T10:42:00Z" },
        },
      },
      {
        name: "failed",
        presentation: {
          mode: "failed",
          item: { turnId: "turn-failed", bot, title: "Tarefa interrompida", detail: "A aba do navegador fechou." },
        },
      },
    ];

    const expandedState: DynamicIslandViewState = "expanded";
    for (const { presentation } of states) {
      const view = render(() => (
        <LunaBotDynamicIsland
          presentation={presentation}
          state={expandedState}
          onStateChange={() => undefined}
          onAction={() => undefined}
        />
      ));
      expect(englishWordsIn(view.container)).toEqual([]);
      view.unmount();
    }
  });
});
