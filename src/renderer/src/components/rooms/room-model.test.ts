import type { Room, RoomBackstageMessage, RoomMember } from "@lunabot/contracts/ipc";
import { ROOM_ACTIVE_BOT_LIMIT, ROOM_NAME_MAX_LENGTH } from "@lunabot/contracts/ipc";
import { describe, expect, it } from "vitest";
import {
  activeRoomMembers,
  backstageForMember,
  canPurgeRoom,
  canSelectRoomBot,
  dismissedRoomMembers,
  hasRoomActivity,
  pendingRoomRequests,
  roomIdOfBot,
  roomManager,
  roomNameError,
  toggleRoomBot,
} from "./room-model";

describe("roomNameError", () => {
  it("requires a name once surrounding spaces are removed", () => {
    expect(roomNameError("")).toBe("required");
    expect(roomNameError("   ")).toBe("required");
    expect(roomNameError("  Launch  ")).toBeNull();
  });

  it("accepts a name up to the maximum length and rejects one longer", () => {
    expect(roomNameError("a".repeat(ROOM_NAME_MAX_LENGTH))).toBeNull();
    expect(roomNameError("a".repeat(ROOM_NAME_MAX_LENGTH + 1))).toBe("tooLong");
  });
});

describe("toggleRoomBot", () => {
  it("adds a bot, and removes it when toggled again", () => {
    const added = toggleRoomBot([], "bot-a");
    expect(added).toEqual(["bot-a"]);
    expect(toggleRoomBot(added, "bot-a")).toEqual([]);
  });

  it("refuses a ninth bot, and keeps the selection unchanged", () => {
    const full = Array.from({ length: ROOM_ACTIVE_BOT_LIMIT }, (_, index) => `bot-${index}`);

    expect(canSelectRoomBot(full, "bot-extra")).toBe(false);
    expect(toggleRoomBot(full, "bot-extra")).toEqual(full);
  });

  it("still allows unticking a bot when the limit is reached", () => {
    const full = Array.from({ length: ROOM_ACTIVE_BOT_LIMIT }, (_, index) => `bot-${index}`);

    expect(canSelectRoomBot(full, "bot-0")).toBe(true);
    expect(toggleRoomBot(full, "bot-0")).toHaveLength(ROOM_ACTIVE_BOT_LIMIT - 1);
  });
});

const member = (botId: string, role: RoomMember["role"], status: RoomMember["status"] = "active"): RoomMember => ({
  botId,
  name: botId,
  role,
  status,
  addedAt: "2026-01-01T00:00:00.000Z",
  dismissedAt: status === "dismissed" ? "2026-01-02T00:00:00.000Z" : null,
});

const room: Room = {
  id: "room-1",
  name: "Launch plan",
  status: "active",
  browserMode: "exclusive",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  archivedAt: null,
  members: [member("manager", "manager"), member("writer", "member"), member("reviewer", "member", "dismissed")],
  requests: [
    {
      id: "req-1",
      roomId: "room-1",
      requestedByBotId: "manager",
      kind: "hire",
      targetBotId: "general-marketing",
      profile: null,
      reason: "Needs campaign copy.",
      status: "pending",
      createdBotId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: null,
    },
    {
      id: "req-2",
      roomId: "room-1",
      requestedByBotId: "manager",
      kind: "dismiss",
      targetBotId: "writer",
      profile: null,
      reason: "Done.",
      status: "rejected",
      createdBotId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: "2026-01-01T01:00:00.000Z",
    },
  ],
};

describe("room member and request selection", () => {
  it("finds the manager, the active members and the dismissed members", () => {
    expect(roomManager(room)?.botId).toBe("manager");
    expect(activeRoomMembers(room).map((item) => item.botId)).toEqual(["writer"]);
    expect(dismissedRoomMembers(room).map((item) => item.botId)).toEqual(["reviewer"]);
  });

  it("returns only requests still waiting for a decision", () => {
    expect(pendingRoomRequests(room).map((request) => request.id)).toEqual(["req-1"]);
  });
});

describe("backstageForMember", () => {
  const message = (id: string, authorBotId: string, recipientBotIds: string[]): RoomBackstageMessage => ({
    id,
    authorBotId,
    authorName: authorBotId,
    recipientBotIds,
    text: id,
    attachmentNames: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const messages = [
    message("m1", "writer", ["manager"]),
    message("m2", "manager", ["reviewer"]),
    message("m3", "manager", ["writer"]),
  ];

  it("keeps messages where the member wrote or received", () => {
    expect(backstageForMember(messages, "writer").map((item) => item.id)).toEqual(["m1", "m3"]);
    expect(backstageForMember(messages, "reviewer").map((item) => item.id)).toEqual(["m2"]);
  });
});

describe("hasRoomActivity", () => {
  const quiet: Room = { ...room, requests: [] };
  const note = (createdAt: string): RoomBackstageMessage => ({
    id: createdAt,
    authorBotId: "manager",
    authorName: "Room manager",
    recipientBotIds: ["writer"],
    text: "Note",
    attachmentNames: [],
    createdAt,
  });

  it("is active while a request waits, even with nothing new on the backstage", () => {
    expect(hasRoomActivity(room, [], "2026-01-02T00:00:00.000Z")).toBe(true);
  });

  it("is active only for backstage messages newer than the last visit", () => {
    const messages = [note("2026-01-01T10:00:00.000Z")];

    expect(hasRoomActivity(quiet, messages, null)).toBe(true);
    expect(hasRoomActivity(quiet, messages, "2026-01-01T09:00:00.000Z")).toBe(true);
    expect(hasRoomActivity(quiet, messages, "2026-01-01T11:00:00.000Z")).toBe(false);
  });

  it("is quiet when the room has no waiting request and no backstage messages", () => {
    expect(hasRoomActivity(quiet, [], null)).toBe(false);
  });
});

describe("canPurgeRoom", () => {
  it("allows a purge only when the typed name matches the room name", () => {
    expect(canPurgeRoom(room, "Launch plan")).toBe(true);
    expect(canPurgeRoom(room, "  Launch plan  ")).toBe(true);
    expect(canPurgeRoom(room, "Launch")).toBe(false);
    expect(canPurgeRoom(room, "")).toBe(false);
  });
});

describe("roomIdOfBot", () => {
  it("finds the room of a manager, member, or dismissed member, and returns null for a general bot", () => {
    const other: Room = { ...room, id: "room-2", members: [member("other-manager", "manager")] };
    const rooms = [other, room];

    expect(roomIdOfBot(rooms, "manager")).toBe("room-1");
    expect(roomIdOfBot(rooms, "writer")).toBe("room-1");
    expect(roomIdOfBot(rooms, "reviewer")).toBe("room-1");
    expect(roomIdOfBot(rooms, "other-manager")).toBe("room-2");
    expect(roomIdOfBot(rooms, "general-marketing")).toBeNull();
  });
});
