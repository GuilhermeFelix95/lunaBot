import type {
  AccountUsage,
  AgentModelOption,
  AgentStatus,
  AttachmentSummary,
  BotSummary,
  BrowserControlState,
  BrowserTab,
  ConversationMessage,
  ConversationSnapshot,
  UpdateStatus,
} from "@lunabot/contracts/ipc";
import type { BotProfile } from "../data";

export const STORY_NOW = "2026-08-19T10:00:00.000Z";

export const STORY_BOT_SUMMARIES: BotSummary[] = [
  {
    id: "chief",
    provider: "codex",
    name: "Chief",
    title: "Chief of staff",
    description: "Coordinates projects, priorities, and next steps across the workspace.",
    notifications: "all",
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    threadId: "thread-chief",
    workspacePath: "/mock/LunaBot/Bots/chief",
    preview: "I pulled together the latest project notes and next steps.",
    updatedAt: STORY_NOW,
    avatarSeed: "chief",
    avatarHue: 245,
    avatarUrl: null,
  },
  {
    id: "research",
    provider: "claude",
    name: "Research",
    title: "Research partner",
    description: "Finds reliable sources and turns them into concise, useful briefs.",
    notifications: "all",
    model: "claude-sonnet-5-5",
    reasoningEffort: "high",
    threadId: "thread-research",
    workspacePath: "/mock/LunaBot/Bots/research",
    preview: "Three useful sources are ready for your review.",
    updatedAt: "2026-08-18T16:32:00.000Z",
    avatarSeed: "research",
    avatarHue: 185,
    avatarUrl: null,
  },
  {
    id: "sales",
    provider: "codex",
    name: "Sales Outbound",
    title: "Outbound specialist",
    description: "Prepares thoughtful prospect research and personalized outreach.",
    notifications: "all",
    model: "gpt-5.6-terra",
    reasoningEffort: "medium",
    threadId: "thread-sales",
    workspacePath: "/mock/LunaBot/Bots/sales",
    preview: "The follow-up draft is ready to send.",
    updatedAt: "2026-08-17T09:20:00.000Z",
    avatarSeed: "sales-outbound",
    avatarHue: 280,
    avatarUrl: null,
  },
];

export const STORY_BOTS: BotProfile[] = STORY_BOT_SUMMARIES.map((bot, index) => ({
  id: bot.id,
  provider: bot.provider,
  name: bot.name,
  title: bot.title,
  description: bot.description,
  notifications: bot.notifications,
  model: bot.model,
  reasoningEffort: bot.reasoningEffort,
  threadId: bot.threadId,
  avatarSeed: bot.avatarSeed,
  avatarHue: bot.avatarHue,
  avatarUrl: bot.avatarUrl,
  time: index === 0 ? "10:00" : index === 1 ? "Yesterday" : "Mon",
  preview: bot.preview,
}));

export const STORY_MODELS: AgentModelOption[] = [
  {
    provider: "codex",
    id: "gpt-5.6-luna",
    name: "Luna",
    description: "Fast and efficient for everyday agent work.",
    defaultReasoningEffort: "medium",
    supportedReasoningEfforts: ["low", "medium", "high"],
  },
  {
    provider: "codex",
    id: "gpt-5.6-terra",
    name: "Terra",
    description: "Balanced speed and capability for involved tasks.",
    defaultReasoningEffort: "medium",
    supportedReasoningEfforts: ["medium", "high"],
  },
  {
    provider: "codex",
    id: "gpt-5.6-sol",
    name: "Sol",
    description: "Most capable for complex, long-running work.",
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: ["medium", "high", "xhigh"],
  },
  {
    provider: "claude",
    id: "claude-fable-5-2",
    name: "Claude Fable 5.2",
    description: "Quick Claude model for day-to-day agent chores.",
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
  },
  {
    provider: "claude",
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    description: "Claude's strongest model for hard, multi-part problems.",
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
  },
  {
    provider: "claude",
    id: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    description: "Claude model that trades a little speed for general-purpose depth.",
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
  },
  {
    provider: "claude",
    id: "claude-haiku-5-5",
    name: "Claude Haiku 5.5",
    description: "Quick Claude model for lightweight tasks.",
    defaultReasoningEffort: "medium",
    supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
  },
  {
    provider: "grok",
    id: "grok-code-fast-1",
    name: "Grok Code Fast 1",
    description: "Discovered from Grok CLI over ACP.",
    defaultReasoningEffort: "medium",
    supportedReasoningEfforts: ["low", "medium", "high"],
  },
];

export const STORY_AGENT_STATUS: AgentStatus = {
  phase: "ready",
  cliVersion: "0.144.1",
  auth: { kind: "chatgpt", email: "person@example.com" },
  providers: [
    {
      id: "codex",
      state: "available",
      version: "0.144.1",
      message: null,
      email: "person@example.com",
    },
    {
      id: "claude",
      state: "available",
      version: "2.1.231",
      message: null,
      email: "person@example.com",
    },
    {
      id: "grok",
      state: "available",
      version: "0.1.0",
      message: null,
      email: null,
    },
  ],
  capabilities: { chat: "ready", browser: "ready", computerUse: "ready" },
  message: null,
  fullAccess: true,
};

export const STORY_USAGE: AccountUsage = {
  limits: [
    {
      id: "codex",
      primary: { usedPercent: 28, windowDurationMins: 300, resetsAt: 1_786_563_600 },
      secondary: { usedPercent: 41, windowDurationMins: 10_080, resetsAt: 1_787_040_000 },
    },
  ],
};

export const STORY_ATTACHMENTS: AttachmentSummary[] = [
  {
    id: "attachment-start-types",
    name: "start-types.d.ts",
    size: 6_144,
    kind: "file",
    mimeType: "text/plain",
    previewKind: "text",
    previewUrl: null,
  },
  {
    id: "attachment-agents",
    name: "AGENTS.md",
    size: 2_048,
    kind: "file",
    mimeType: "text/plain",
    previewKind: "text",
    previewUrl: null,
  },
];

export const STORY_CONVERSATION_MESSAGES: ConversationMessage[] = [
  {
    id: "message-user-1",
    author: "user",
    source: "user",
    text: "Can you turn the latest notes into a short plan and tag @Research for the source check?",
    createdAt: "2026-08-19T09:42:00.000Z",
    status: "completed",
  },
  {
    id: "message-agent-1",
    author: "assistant",
    source: "assistant",
    text: "Absolutely. I’ll structure the plan around the launch milestones and ask @Research to verify the supporting sources.\n\nThe first draft is ready here: https://example.com/docs",
    createdAt: "2026-08-19T09:43:00.000Z",
    status: "completed",
    attachments: STORY_ATTACHMENTS,
    reaction: "👍",
  },
  {
    id: "message-exchange",
    author: "system",
    source: "system",
    text: "",
    createdAt: "2026-08-19T09:44:00.000Z",
    status: "completed",
    exchange: {
      direction: "outgoing",
      messageId: "message-exchange",
      senderBotId: "chief",
      recipientBotIds: ["research", "sales"],
      replyToMessageId: null,
      deliveries: [
        {
          id: "delivery-research",
          recipientBotId: "research",
          status: "completed",
          position: null,
          error: null,
        },
        {
          id: "delivery-sales",
          recipientBotId: "sales",
          status: "running",
          position: 1,
          error: null,
        },
      ],
    },
  },
  {
    id: "message-agent-2",
    author: "assistant",
    source: "assistant",
    text: "I’ll keep the final plan concise, with owners and a clear next action for each milestone.",
    createdAt: "2026-08-19T09:45:00.000Z",
    status: "completed",
  },
];

export const STORY_SNAPSHOTS: Record<string, ConversationSnapshot> = Object.fromEntries(
  STORY_BOT_SUMMARIES.map((bot) => [
    bot.id,
    {
      botId: bot.id,
      threadId: bot.threadId,
      activeTurnId: null,
      revision: 1,
      messages: bot.id === "chief" ? STORY_CONVERSATION_MESSAGES : [],
    },
  ]),
);

export const STORY_BROWSER_TABS: BrowserTab[] = [
  {
    id: "browser-tab-docs",
    title: "Luna Bot documentation",
    url: "https://example.com/docs",
    loading: false,
    ownerThreadId: "thread-chief",
    ownerBotId: "chief",
  },
];

export const STORY_BROWSER_CONTROL: BrowserControlState = {
  sessions: [
    {
      id: "browser-session-1",
      threadId: "thread-chief",
      turnId: "turn-1",
      callId: "call-1",
      tabId: "browser-tab-docs",
      action: "snapshot",
      phase: "waiting",
      startedAt: STORY_NOW,
    },
  ],
};

export const STORY_UPDATE_STATUS: UpdateStatus = {
  phase: "available",
  currentVersion: "0.1.11",
  availableVersion: "0.2.0",
  progress: null,
  checkedAt: STORY_NOW,
  message: null,
  errorCode: null,
};

export const STORY_APP_INFO = {
  name: "Luna Bot",
  version: "0.1.11",
  platform: "darwin" as const,
  variant: "production" as const,
};
