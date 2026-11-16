import { isAbsolute, join, relative } from "node:path";
import type { RoomBrowserMode, RoomMemberRole } from "@lunabot/contracts/ipc";

export const GENERAL_BROWSER_PARTITION = "persist:lunabot-browser";

// Pure isolation rules for Sala. A room is closed: its bots see and reach only active members of that room,
// and general bots never see or reach room bots. Dismissed members and archived rooms reach nobody.
export interface RoomMembership {
  roomId: string;
  role: RoomMemberRole;
  memberActive: boolean;
  roomActive: boolean;
  browserMode: RoomBrowserMode;
}

export type BotScope =
  | { kind: "general" }
  | { kind: "room"; roomId: string; role: RoomMemberRole; active: boolean; browserMode: RoomBrowserMode };

export function botScope(botId: string, memberships: ReadonlyMap<string, RoomMembership>): BotScope {
  const membership = memberships.get(botId);
  if (!membership) return { kind: "general" };
  return {
    kind: "room",
    roomId: membership.roomId,
    role: membership.role,
    active: membership.memberActive && membership.roomActive,
    browserMode: membership.browserMode,
  };
}

export function canReachBot(
  scope: BotScope,
  targetBotId: string,
  memberships: ReadonlyMap<string, RoomMembership>,
): boolean {
  const target = memberships.get(targetBotId);
  if (scope.kind === "general") return target === undefined;
  if (!scope.active || !target) return false;
  return target.roomId === scope.roomId && target.memberActive && target.roomActive;
}

// Messages are wider than reach: an active manager can also message the active manager of another active room,
// so rooms can ask each other for work. Reading, routines and memory still follow canReachBot.
export function canMessageBot(
  scope: BotScope,
  targetBotId: string,
  memberships: ReadonlyMap<string, RoomMembership>,
): boolean {
  if (canReachBot(scope, targetBotId, memberships)) return true;
  if (scope.kind !== "room" || scope.role !== "manager" || !scope.active) return false;
  const target = memberships.get(targetBotId);
  return target?.role === "manager" && target.memberActive && target.roomActive;
}

export function sharedRootForScope(scope: BotScope, sharedRoot: string, roomsRoot: string): string {
  return scope.kind === "general" ? sharedRoot : roomSharedRoot(roomsRoot, scope.roomId);
}

export function roomSharedRoot(roomsRoot: string, roomId: string): string {
  return join(roomsRoot, roomId, "shared");
}

// Returns the room that owns a path under the Rooms folder, or null for general paths.
export function roomIdForPath(roomsRoot: string, path: string): string | null {
  const candidate = relative(roomsRoot, path);
  if (!candidate || candidate.startsWith("..") || isAbsolute(candidate)) return null;
  return candidate.split(/[\\/]/u)[0] || null;
}

export function roomBrowserPartition(roomId: string): string {
  return `persist:lunabot-browser-room-${roomId}`;
}

// Exclusive rooms and any inactive room bot get their own partition. Shared rooms use the general one.
export function browserPartitionForScope(scope: BotScope): string {
  if (scope.kind === "general") return GENERAL_BROWSER_PARTITION;
  if (scope.active && scope.browserMode === "shared") return GENERAL_BROWSER_PARTITION;
  return roomBrowserPartition(scope.roomId);
}
