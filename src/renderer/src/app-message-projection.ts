import type {
  BotSummary,
  ConversationMessage,
  ConversationReadState,
  QueueDeliveryStatus,
  RoomRequestNotice,
} from "@lunabot/contracts/ipc";
import {
  isApprovalAutoMarker,
  isBackgroundTaskInterruptedMarker,
  isRoutineRunConversationEventMarker,
  ROOM_REQUEST_NOTICE_ITEM_TYPE_PREFIX,
  ROUTINE_EVENT_ITEM_TYPE_PREFIX,
  roomRequestNoticeConversationEvent,
  routineConversationEvent,
  routineRunConversationEvent,
} from "@lunabot/contracts/ipc";
import { cleanAgentMessageText } from "./agent-message-text";
import type { AgentDeliveryMarkerStatus, BotMessage, BotProfile, ChatActionMarkerModel } from "./data";
import { locale, t } from "./i18n";

export function toBotProfile(stored: BotSummary): BotProfile {
  return {
    id: stored.id,
    name: stored.name,
    title: stored.title,
    description: stored.description,
    notifications: stored.notifications,
    provider: stored.provider,
    model: stored.model,
    reasoningEffort: stored.reasoningEffort,
    threadId: stored.threadId,
    avatarSeed: stored.avatarSeed,
    avatarHue: stored.avatarHue,
    avatarUrl: stored.avatarUrl,
    updatedAt: stored.updatedAt,
    time: stored.updatedAt ? formatTime(stored.updatedAt) : "now",
    preview: cleanPreview(stored.preview),
  };
}

export function toBotMessage(message: ConversationMessage, ownerAgentId?: string): BotMessage {
  const exchangeSenderId = message.senderBotId ?? message.exchange?.senderBotId;
  const routineEvent = routineConversationEvent(message);
  const routineRunEvent = routineRunConversationEvent(message);
  const actionMarker = chatActionMarker(message, ownerAgentId, routineEvent, routineRunEvent);
  return {
    id: message.id,
    turnId: message.turnId,
    author: message.author === "user" ? "you" : "bot",
    body: message.author === "user" ? message.text : cleanAgentMessageText(message.text),
    time: formatTime(message.createdAt),
    createdAt: message.createdAt,
    streaming: message.status === "streaming",
    itemType: message.itemType,
    kind: message.questionPrompt ? "question" : actionMarker ? "action-marker" : "text",
    senderBotId: exchangeSenderId,
    replyToMessageId: message.replyToMessageId,
    attachments: message.attachments,
    imageGeneration: message.imageGeneration,
    questionPrompt: message.questionPrompt,
    exchange: message.exchange,
    reaction: message.reaction,
    reactions:
      message.reactions ?? (message.reaction ? [{ emoji: message.reaction, actor: { kind: "user" as const } }] : []),
    routine: message.routine,
    actionMarker: actionMarker ?? undefined,
    status:
      message.exchange || message.routine
        ? undefined
        : message.delivery?.status === "queued"
          ? t("misc.message.queued", { position: String(message.delivery.position) })
          : message.delivery?.status === "cancelled"
            ? t("misc.message.cancelled")
            : message.status === "failed"
              ? t("misc.message.failed")
              : message.status === "interrupted"
                ? t("misc.message.stopped")
                : undefined,
  };
}

export function toBotMessages(messages: ConversationMessage[], ownerAgentId?: string): BotMessage[] {
  const result: BotMessage[] = [];
  const thinkingByTurn = new Map<string, BotMessage>();
  for (const message of messages) {
    if ((message.delivery?.status === "queued" || message.delivery?.status === "cancelled") && !message.routine) {
      continue;
    }
    if (message.author !== "assistant" || message.itemType !== "commentary") {
      result.push(toBotMessage(message, ownerAgentId));
      continue;
    }

    const key = message.turnId ?? message.id;
    const existing = thinkingByTurn.get(key);
    if (existing) {
      const text = cleanAgentMessageText(message.text);
      if (text.trim()) existing.items = [...(existing.items ?? []), text];
      existing.streaming = existing.streaming || message.status === "streaming";
      continue;
    }

    const text = cleanAgentMessageText(message.text);
    const thinking: BotMessage = {
      id: `thinking:${key}`,
      turnId: message.turnId,
      author: "bot",
      body: "",
      time: formatTime(message.createdAt),
      createdAt: message.createdAt,
      streaming: message.status === "streaming",
      itemType: "commentary",
      kind: "thinking",
      items: text.trim() ? [text] : [],
    };
    thinkingByTurn.set(key, thinking);
    result.push(thinking);
  }
  return result;
}

export function readStateForMessages(
  state: ConversationReadState,
  messages: ConversationMessage[],
): ConversationReadState {
  const throughIndex = state.throughMessageId
    ? messages.findIndex((message) => message.id === state.throughMessageId)
    : -1;
  const unread = messages
    .slice(throughIndex + 1)
    .filter(
      (message) =>
        message.author !== "user" &&
        message.itemType !== "commentary" &&
        message.itemType !== "agent_attachment" &&
        !message.itemType?.startsWith(ROUTINE_EVENT_ITEM_TYPE_PREFIX) &&
        !message.itemType?.startsWith(ROOM_REQUEST_NOTICE_ITEM_TYPE_PREFIX) &&
        !isRoutineRunConversationEventMarker(message.itemType) &&
        !isApprovalAutoMarker(message.itemType) &&
        !isBackgroundTaskInterruptedMarker(message.itemType),
    );
  return {
    ...state,
    unreadCount: unread.length,
    firstUnreadMessageId: unread[0]?.id ?? null,
  };
}

export function botProfilesEqual(left: BotProfile, right: BotProfile): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.title === right.title &&
    left.description === right.description &&
    left.notifications === right.notifications &&
    left.provider === right.provider &&
    left.model === right.model &&
    left.reasoningEffort === right.reasoningEffort &&
    left.threadId === right.threadId &&
    left.avatarSeed === right.avatarSeed &&
    left.avatarHue === right.avatarHue &&
    left.avatarUrl === right.avatarUrl &&
    left.updatedAt === right.updatedAt &&
    left.time === right.time &&
    left.preview === right.preview
  );
}

export function botMessagesEqual(left: BotMessage, right: BotMessage): boolean {
  return (
    left.id === right.id &&
    left.turnId === right.turnId &&
    left.author === right.author &&
    left.body === right.body &&
    left.time === right.time &&
    left.kind === right.kind &&
    left.streaming === right.streaming &&
    left.itemType === right.itemType &&
    left.status === right.status &&
    left.senderBotId === right.senderBotId &&
    left.replyToMessageId === right.replyToMessageId &&
    left.reaction === right.reaction &&
    JSON.stringify(left.reactions) === JSON.stringify(right.reactions) &&
    JSON.stringify(left.reactionSummary) === JSON.stringify(right.reactionSummary) &&
    JSON.stringify(left.attachments) === JSON.stringify(right.attachments) &&
    JSON.stringify(left.questionPrompt) === JSON.stringify(right.questionPrompt) &&
    JSON.stringify(left.exchange) === JSON.stringify(right.exchange) &&
    JSON.stringify(left.routine) === JSON.stringify(right.routine) &&
    JSON.stringify(left.actionMarker) === JSON.stringify(right.actionMarker) &&
    JSON.stringify(left.items) === JSON.stringify(right.items)
  );
}

function chatActionMarker(
  message: ConversationMessage,
  ownerAgentId: string | undefined,
  routineEvent: ReturnType<typeof routineConversationEvent>,
  routineRunEvent: ReturnType<typeof routineRunConversationEvent>,
): ChatActionMarkerModel | null {
  if (message.exchange) {
    const targetDeliveries = message.exchange.deliveries.map((delivery) => ({
      agentId: delivery.recipientBotId,
      status: delivery.status,
    }));
    const status =
      message.exchange.direction === "incoming"
        ? deliveryStatus(message.delivery?.status ?? targetDeliveries[0]?.status)
        : aggregateDeliveryStatus(targetDeliveries.map((delivery) => delivery.status));
    return {
      kind: "agent-message",
      direction: message.exchange.direction,
      sourceAgentId: message.exchange.senderBotId,
      targetDeliveries,
      status,
      timestamp: message.createdAt,
      messageId: message.exchange.messageId,
      replyToMessageId: message.exchange.replyToMessageId,
    };
  }
  if (routineEvent) {
    return {
      kind: "routine-lifecycle",
      action: routineEvent.action,
      sourceAgentId: ownerAgentId ?? null,
      routineId: routineEvent.routineId,
      routineName: routineEvent.routineName,
      status: "completed",
      timestamp: message.createdAt,
    };
  }
  if (routineRunEvent) {
    return {
      kind: "routine-run",
      sourceAgentId: ownerAgentId ?? null,
      routineId: routineRunEvent.routineId,
      runId: routineRunEvent.runId,
      routineName: routineRunEvent.routineName,
      status: routineRunEvent.status,
      timestamp: message.createdAt,
    };
  }
  if (message.routine) {
    return {
      kind: "routine-run",
      sourceAgentId: ownerAgentId ?? null,
      routineId: message.routine.routineId,
      runId: message.routine.runId,
      routineName: message.routine.name,
      status: "queued",
      timestamp: message.createdAt,
    };
  }
  if (
    message.itemType?.startsWith(ROUTINE_EVENT_ITEM_TYPE_PREFIX) ||
    isRoutineRunConversationEventMarker(message.itemType)
  ) {
    return { kind: "unavailable", label: t("misc.message.actionUnavailable"), timestamp: message.createdAt };
  }
  if (isApprovalAutoMarker(message.itemType)) {
    return { kind: "approval-auto", label: t("conversation.marker.approvalAuto"), timestamp: message.createdAt };
  }
  if (isBackgroundTaskInterruptedMarker(message.itemType)) {
    return {
      kind: "background-task-interrupted",
      label: t("conversation.marker.backgroundTaskInterrupted"),
      timestamp: message.createdAt,
    };
  }
  const roomRequestNotice = roomRequestNoticeConversationEvent(message);
  if (roomRequestNotice) {
    return {
      kind: "room-request",
      label: roomRequestNoticeLabel(roomRequestNotice),
      timestamp: message.createdAt,
    };
  }
  return null;
}

function roomRequestNoticeLabel({ decision, requestKind, name }: RoomRequestNotice): string {
  const approved = decision === "approve";
  if (requestKind === "hire") {
    return approved ? t("rooms.notice.hireApproved", { name }) : t("rooms.notice.hireDeclined", { name });
  }
  if (requestKind === "dismiss") {
    return approved ? t("rooms.notice.dismissApproved", { name }) : t("rooms.notice.dismissDeclined", { name });
  }
  return approved ? t("rooms.notice.newBotApproved", { name }) : t("rooms.notice.newBotDeclined", { name });
}

function aggregateDeliveryStatus(statuses: QueueDeliveryStatus[]): AgentDeliveryMarkerStatus {
  if (statuses.length === 0) return "unavailable";
  const normalized = statuses.map(deliveryStatus);
  if (normalized.every((status) => status === "queued")) return "queued";
  if (normalized.some((status) => status === "in-progress")) return "in-progress";
  if (normalized.every((status) => status === "completed")) return "completed";
  if (normalized.every((status) => status === "failed")) return "failed";
  if (normalized.every((status) => status === "interrupted")) return "interrupted";
  if (normalized.every((status) => status === "cancelled")) return "cancelled";
  if (normalized.every((status) => ["completed", "failed", "interrupted", "cancelled"].includes(status))) {
    return "partial";
  }
  return "in-progress";
}

function deliveryStatus(status: QueueDeliveryStatus | undefined): Exclude<AgentDeliveryMarkerStatus, "partial"> {
  if (!status) return "unavailable";
  if (status === "starting" || status === "running") return "in-progress";
  return status;
}

export function retainThinkingMessages(previous: BotMessage[], next: BotMessage[]): BotMessage[] {
  const result = [...next];
  const nextIds = new Set(result.map((message) => message.id));
  for (const thinking of previous) {
    if (thinking.kind !== "thinking" || nextIds.has(thinking.id) || !thinking.turnId) continue;
    const sameTurnIndexes = result.flatMap((message, index) => (message.turnId === thinking.turnId ? [index] : []));
    if (sameTurnIndexes.length === 0) continue;
    const finalAnswerIndex = result.findIndex(
      (message) => message.turnId === thinking.turnId && message.author === "bot" && message.kind !== "thinking",
    );
    const insertionIndex = finalAnswerIndex >= 0 ? finalAnswerIndex : (sameTurnIndexes.at(-1) ?? result.length - 1) + 1;
    result.splice(insertionIndex, 0, { ...thinking, streaming: false });
    nextIds.add(thinking.id);
  }
  return result;
}

export function withoutBot<T>(values: Record<string, T>, botId: string): Record<string, T> {
  const next = { ...values };
  delete next[botId];
  return next;
}

function cleanPreview(preview: string): string {
  const cleaned = cleanAgentMessageText(preview)
    .replace(/\binbox\s+at\s+zero\b[:,]?\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || t("misc.message.noMessages");
}

export function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("conversation.view.timeNow");
  return new Intl.DateTimeFormat(locale(), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
