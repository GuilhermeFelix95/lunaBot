import type { ConversationMessage, CreateBotInput } from "./ipc-conversation";
import { isDynamicRecord, isOneOf, isString } from "./runtime-values";

export const ROOM_NAME_MAX_LENGTH = 60;
export const ROOM_ACTIVE_BOT_LIMIT = 8;
// Stands in for a room id where the app asks for the managers room: the feed of messages between managers of different rooms. It is not a stored room.
export const MANAGERS_ROOM_ID = "managers";

export type RoomStatus = "active" | "archived";
export type RoomBrowserMode = "exclusive" | "shared";
export type RoomMemberRole = "manager" | "member";
export type RoomMemberStatus = "active" | "dismissed";
export type RoomRequestStatus = "pending" | "rejected" | "fulfilled";

export interface RoomMember {
  botId: string;
  name: string;
  role: RoomMemberRole;
  status: RoomMemberStatus;
  addedAt: string;
  dismissedAt: string | null;
}

export type RoomRequestKind = "hire" | "dismiss" | "new_bot";

export interface RoomRequestProfile {
  name: string;
  title: string;
  description: string;
}

export interface RoomRequest {
  id: string;
  roomId: string;
  requestedByBotId: string;
  kind: RoomRequestKind;
  // hire: the general bot to copy. dismiss: the room member to dismiss. new_bot: null.
  targetBotId: string | null;
  profile: RoomRequestProfile | null;
  reason: string;
  status: RoomRequestStatus;
  createdBotId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Room {
  id: string;
  name: string;
  status: RoomStatus;
  browserMode: RoomBrowserMode;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  members: RoomMember[];
  requests: RoomRequest[];
}

export interface CreateRoomInput {
  name: string;
  manager: Omit<CreateBotInput, "initialMessage">;
  // Optional: defaults to "exclusive" and no hired members.
  browserMode?: RoomBrowserMode;
  // General bots to hire as copies at creation. At most ROOM_ACTIVE_BOT_LIMIT, all unique.
  memberBotIds?: string[];
}

export interface DismissRoomMemberInput {
  roomId: string;
  botId: string;
}

export interface ResolveRoomRequestInput {
  requestId: string;
  decision: "approve" | "reject";
  // Required when approving a new_bot request: the general bot the user created for it.
  targetBotId?: string;
}

// What the room manager is told when the user resolves one of its requests. The name is the bot the decision is about.
export interface RoomRequestNotice {
  decision: "approve" | "reject";
  requestKind: RoomRequestKind;
  name: string;
}

export const ROOM_REQUEST_NOTICE_ITEM_TYPE_PREFIX = "room-request-notice:";
const NOTICE_DECISIONS = ["approve", "reject"] as const;
const NOTICE_REQUEST_KINDS = ["hire", "dismiss", "new_bot"] as const;

export function roomRequestNoticeItemType(notice: RoomRequestNotice): string {
  return `${ROOM_REQUEST_NOTICE_ITEM_TYPE_PREFIX}${notice.decision}:${notice.requestKind}`;
}

export function isRoomRequestNotice(value: unknown): value is RoomRequestNotice {
  return (
    isDynamicRecord(value) &&
    isOneOf(NOTICE_DECISIONS, value.decision) &&
    isOneOf(NOTICE_REQUEST_KINDS, value.requestKind) &&
    isString(value.name) &&
    value.name.length > 0
  );
}

// The conversation note shown for a notice. Its name is the message text, and its decision and kind are in the item type.
export function roomRequestNoticeConversationEvent(message: ConversationMessage): RoomRequestNotice | null {
  if (message.author !== "system" || message.source !== "system" || message.status !== "completed") return null;
  if (!message.itemType?.startsWith(ROOM_REQUEST_NOTICE_ITEM_TYPE_PREFIX)) return null;
  const [decision, requestKind, ...extra] = message.itemType
    .slice(ROOM_REQUEST_NOTICE_ITEM_TYPE_PREFIX.length)
    .split(":");
  const notice = { decision, requestKind, name: message.text.trim() };
  return extra.length === 0 && isRoomRequestNotice(notice) ? notice : null;
}

// Read-only backstage: messages whose author and every recipient are active members of the room.
export interface RoomBackstageMessage {
  id: string;
  authorBotId: string;
  authorName: string;
  recipientBotIds: string[];
  text: string;
  attachmentNames: string[];
  createdAt: string;
}
