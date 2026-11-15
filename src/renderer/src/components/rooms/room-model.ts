import type { Room, RoomBackstageMessage, RoomMember, RoomRequest } from "@lunabot/contracts/ipc";
import { ROOM_ACTIVE_BOT_LIMIT, ROOM_NAME_MAX_LENGTH } from "@lunabot/contracts/ipc";

export type RoomNameError = "required" | "tooLong";

export function roomNameError(name: string): RoomNameError | null {
  const trimmed = name.trim();
  if (!trimmed) return "required";
  if (trimmed.length > ROOM_NAME_MAX_LENGTH) return "tooLong";
  return null;
}

export function canSelectRoomBot(selectedBotIds: readonly string[], botId: string): boolean {
  return selectedBotIds.includes(botId) || selectedBotIds.length < ROOM_ACTIVE_BOT_LIMIT;
}

// Returns a new list; a bot that would exceed the room limit is not added.
export function toggleRoomBot(selectedBotIds: readonly string[], botId: string): string[] {
  if (selectedBotIds.includes(botId)) return selectedBotIds.filter((id) => id !== botId);
  if (!canSelectRoomBot(selectedBotIds, botId)) return [...selectedBotIds];
  return [...selectedBotIds, botId];
}

export function roomManager(room: Room): RoomMember | null {
  return room.members.find((member) => member.role === "manager" && member.status === "active") ?? null;
}

// Room bots are never in the general bot list, dismissed members included. Null means a general bot.
export function roomIdOfBot(rooms: readonly Room[], botId: string): string | null {
  return rooms.find((room) => room.members.some((member) => member.botId === botId))?.id ?? null;
}

export function activeRoomMembers(room: Room): RoomMember[] {
  return room.members.filter((member) => member.role === "member" && member.status === "active");
}

export function dismissedRoomMembers(room: Room): RoomMember[] {
  return room.members.filter((member) => member.role === "member" && member.status === "dismissed");
}

export function pendingRoomRequests(room: Room): RoomRequest[] {
  return room.requests.filter((request) => request.status === "pending");
}

// Backstage messages involving one member, as author or as recipient.
export function backstageForMember(messages: readonly RoomBackstageMessage[], botId: string): RoomBackstageMessage[] {
  return messages.filter((message) => message.authorBotId === botId || message.recipientBotIds.includes(botId));
}

export type BackstageConversationState = "done" | "waiting" | "working" | "idle";

// Time from a request to the member's answer. Read as "{value} {unit}".
export interface ResponseTime {
  unit: "seconds" | "minutes" | "hours";
  value: number;
}

export interface BackstageConversation {
  botId: string;
  name: string;
  // Oldest first, as shown in the bubbles.
  messages: RoomBackstageMessage[];
  lastMessage: RoomBackstageMessage | null;
  // The last message as one plain line, without markdown.
  preview: string;
  count: number;
  state: BackstageConversationState;
  responseTime: ResponseTime | null;
  unread: boolean;
}

// Strips the markdown of a message into one plain line for the list preview.
export function plainPreview(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/(^|\W)_(.+?)_(?=\W|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export function toResponseTime(ms: number): ResponseTime {
  if (ms < MINUTE_MS) return { unit: "seconds", value: Math.max(1, Math.floor(ms / 1000)) };
  if (ms < HOUR_MS) return { unit: "minutes", value: Math.floor(ms / MINUTE_MS) };
  return { unit: "hours", value: Math.floor(ms / HOUR_MS) };
}

// The last request-to-answer time in a conversation. A request is the first message from the other party
// that has no answer yet; the answer is the member's next message.
function lastResponseTime(messages: readonly RoomBackstageMessage[], botId: string): ResponseTime | null {
  let requestAt: number | null = null;
  let result: number | null = null;
  for (const message of messages) {
    const at = Date.parse(message.createdAt);
    if (message.authorBotId === botId) {
      if (requestAt !== null) result = at - requestAt;
      requestAt = null;
    } else if (requestAt === null) {
      requestAt = at;
    }
  }
  return result === null ? null : toResponseTime(Math.max(0, result));
}

function conversationState(
  botId: string,
  lastMessage: RoomBackstageMessage | null,
  workingBotIds: ReadonlySet<string>,
): BackstageConversationState {
  if (!lastMessage) return "idle";
  if (lastMessage.authorBotId === botId) return "done";
  return workingBotIds.has(botId) ? "working" : "waiting";
}

// One conversation per active member: every backstage message where the member wrote or received, including
// messages between two members, which appear in both conversations. Most recent first; members without messages
// come last, in room order.
// seenAt holds each member's last-seen time (ISO); a member with messages but no entry is unread.
// workingBotIds is the set of members that are busy now; the caller decides where it comes from.
export function backstageConversations(
  room: Room,
  messages: readonly RoomBackstageMessage[],
  options: { seenAt: Readonly<Record<string, string>>; workingBotIds?: ReadonlySet<string> },
): BackstageConversation[] {
  const workingBotIds = options.workingBotIds ?? new Set<string>();
  const conversations = activeRoomMembers(room).map((member): BackstageConversation => {
    const involved = backstageForMember(messages, member.botId).sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    );
    const lastMessage = involved.at(-1) ?? null;
    const seen = options.seenAt[member.botId];
    const unread = lastMessage !== null && (seen === undefined || Date.parse(lastMessage.createdAt) > Date.parse(seen));
    return {
      botId: member.botId,
      name: member.name,
      messages: involved,
      lastMessage,
      preview: lastMessage ? plainPreview(lastMessage.text) : "",
      count: involved.length,
      state: conversationState(member.botId, lastMessage, workingBotIds),
      responseTime: lastResponseTime(involved, member.botId),
      unread,
    };
  });
  const withMessages = conversations
    .filter((conversation) => conversation.lastMessage !== null)
    .sort((a, b) => Date.parse(b.lastMessage?.createdAt ?? "") - Date.parse(a.lastMessage?.createdAt ?? ""));
  const withoutMessages = conversations.filter((conversation) => conversation.lastMessage === null);
  return [...withMessages, ...withoutMessages];
}

// The conversation to open: the requested member when the room still has them, else the first in the list
// (the most recent one, or the first member when nobody has written yet).
export function selectedBackstageBotId(
  conversations: readonly BackstageConversation[],
  requestedBotId: string | null,
): string | null {
  return (
    conversations.find((conversation) => conversation.botId === requestedBotId)?.botId ??
    conversations[0]?.botId ??
    null
  );
}

// A room needs attention when a request is waiting or when backstage has messages newer than the last visit.
// seenAt is null when the backstage was never opened, so any existing message counts as new.
export function hasRoomActivity(
  room: Room,
  backstage: readonly RoomBackstageMessage[],
  seenAt: string | null,
): boolean {
  if (pendingRoomRequests(room).length > 0) return true;
  const seen = seenAt === null ? Number.NEGATIVE_INFINITY : Date.parse(seenAt);
  return backstage.some((message) => Date.parse(message.createdAt) > seen);
}

// Purging a room needs the exact room name, so a stray click cannot delete it.
export function canPurgeRoom(room: Room, typedName: string): boolean {
  return typedName.trim() === room.name.trim();
}
