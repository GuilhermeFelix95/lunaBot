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
