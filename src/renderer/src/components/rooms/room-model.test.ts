import type { Room, RoomBackstageMessage, RoomMember } from "@lunabot/contracts/ipc";
import { MANAGERS_ROOM_ID, ROOM_ACTIVE_BOT_LIMIT, ROOM_NAME_MAX_LENGTH } from "@lunabot/contracts/ipc";
import { describe, expect, it } from "vitest";
import {
  activeRoomMembers,
  type BackstageConversation,
  backstageConversations,
  backstageForMember,
  buildManagersRoom,
  canPurgeRoom,
  canSelectRoomBot,
  dismissedRoomMembers,
  hasRoomActivity,
  pendingRoomRequests,
  plainPreview,
  roomIdOfBot,
  roomManager,
  roomNameError,
  selectedBackstageBotId,
  toggleRoomBot,
  toResponseTime,
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

describe("plainPreview", () => {
  it("turns markdown into one plain line", () => {
    expect(plainPreview("**Olá**, `code` e [site](https://x.test)\n## Título")).toBe("Olá, code e site Título");
  });

  it("keeps underscores that are part of a word", () => {
    expect(plainPreview("snake_case_name e _ênfase_")).toBe("snake_case_name e ênfase");
  });
});

describe("toResponseTime", () => {
  it("uses seconds, minutes and hours by size", () => {
    expect(toResponseTime(45_000)).toEqual({ unit: "seconds", value: 45 });
    expect(toResponseTime(59_999)).toEqual({ unit: "seconds", value: 59 });
    expect(toResponseTime(60_000)).toEqual({ unit: "minutes", value: 1 });
    expect(toResponseTime(3_600_000)).toEqual({ unit: "hours", value: 1 });
  });
});

describe("backstageConversations", () => {
  const at = (time: string) => `2026-01-01T${time}.000Z`;
  const note = (
    id: string,
    authorBotId: string,
    recipientBotIds: string[],
    createdAt: string,
    text = id,
  ): RoomBackstageMessage => ({
    id,
    authorBotId,
    authorName: authorBotId,
    recipientBotIds,
    text,
    attachmentNames: [],
    createdAt,
  });
  const team: Room = {
    ...room,
    requests: [],
    members: [
      member("manager", "manager"),
      member("writer", "member"),
      member("reviewer", "member"),
      member("quiet", "member"),
    ],
  };
  const messages = [
    note("a", "manager", ["writer"], at("10:00:00")),
    note("b", "writer", ["manager"], at("10:01:30")),
    note("c", "reviewer", ["writer"], at("11:00:00")),
    note("e", "manager", ["reviewer"], at("12:00:00"), "Veja [o plano](https://x.test)"),
  ];
  const ids = (list: BackstageConversation[], botId: string) =>
    list.find((conversation) => conversation.botId === botId)?.messages.map((item) => item.id);

  it("groups messages per active member, and a message between two members appears in both", () => {
    const list = backstageConversations(team, messages, { seenAt: {} });

    expect(ids(list, "writer")).toEqual(["a", "b", "c"]);
    expect(ids(list, "reviewer")).toEqual(["c", "e"]);
    expect(list.find((conversation) => conversation.botId === "quiet")?.count).toBe(0);
  });

  it("orders the most recent conversation first and lists members without messages last", () => {
    const list = backstageConversations(team, messages, { seenAt: {} });

    expect(list.map((conversation) => conversation.botId)).toEqual(["reviewer", "writer", "quiet"]);
  });

  it("reports done, waiting, working and idle states", () => {
    const stateOf = (list: BackstageConversation[], botId: string) =>
      list.find((conversation) => conversation.botId === botId)?.state;

    const waiting = backstageConversations(team, messages, { seenAt: {} });
    expect(stateOf(waiting, "writer")).toBe("waiting");
    expect(stateOf(waiting, "reviewer")).toBe("waiting");
    expect(stateOf(waiting, "quiet")).toBe("idle");

    const working = backstageConversations(team, messages, { seenAt: {}, workingBotIds: new Set(["reviewer"]) });
    expect(stateOf(working, "reviewer")).toBe("working");
    expect(stateOf(working, "writer")).toBe("waiting");

    const answered = backstageConversations(team, [messages[0], messages[1]], { seenAt: {} });
    expect(stateOf(answered, "writer")).toBe("done");
  });

  it("shows the last message as one plain line", () => {
    const list = backstageConversations(team, messages, { seenAt: {} });

    expect(list[0]?.preview).toBe("Veja o plano");
    expect(list[0]?.lastMessage?.id).toBe("e");
  });

  it("measures the last request-to-answer time", () => {
    const list = backstageConversations(team, messages, { seenAt: {} });
    expect(list.find((conversation) => conversation.botId === "writer")?.responseTime).toEqual({
      unit: "minutes",
      value: 1,
    });
    expect(list.find((conversation) => conversation.botId === "reviewer")?.responseTime).toBeNull();

    const quick = [note("q", "manager", ["writer"], at("10:00:00")), note("r", "writer", ["manager"], at("10:00:45"))];
    const fast = backstageConversations(team, quick, { seenAt: {} });
    expect(fast.find((conversation) => conversation.botId === "writer")?.responseTime).toEqual({
      unit: "seconds",
      value: 45,
    });
  });

  it("is unread when its last message is newer than the member's last seen time", () => {
    const unreadOf = (list: BackstageConversation[], botId: string) =>
      list.find((conversation) => conversation.botId === botId)?.unread;

    const never = backstageConversations(team, messages, { seenAt: {} });
    expect(unreadOf(never, "writer")).toBe(true);
    expect(unreadOf(never, "quiet")).toBe(false);

    const caughtUp = backstageConversations(team, messages, {
      seenAt: { writer: at("11:00:00"), reviewer: at("12:30:00") },
    });
    expect(unreadOf(caughtUp, "writer")).toBe(false);
    expect(unreadOf(caughtUp, "reviewer")).toBe(false);

    const behind = backstageConversations(team, messages, { seenAt: { writer: at("10:30:00") } });
    expect(unreadOf(behind, "writer")).toBe(true);
  });

  it("opens the requested member, else the most recent conversation, else null", () => {
    const list = backstageConversations(team, messages, { seenAt: {} });

    expect(selectedBackstageBotId(list, "writer")).toBe("writer");
    expect(selectedBackstageBotId(list, null)).toBe("reviewer");
    expect(selectedBackstageBotId(list, "former-member")).toBe("reviewer");
    expect(selectedBackstageBotId([], null)).toBeNull();
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

describe("buildManagersRoom", () => {
  const other: Room = {
    ...room,
    id: "room-2",
    name: "Content",
    members: [member("lead", "manager"), member("designer", "member")],
    requests: [],
  };

  it("lists only the active managers of active rooms, named after their room", () => {
    const managers = buildManagersRoom([room, other], "Managers");

    expect(managers?.id).toBe(MANAGERS_ROOM_ID);
    expect(managers?.members.map((item) => item.name)).toEqual(["manager (Launch plan)", "lead (Content)"]);
  });

  it("does not exist until two rooms are active", () => {
    expect(buildManagersRoom([room], "Managers")).toBeNull();
    expect(buildManagersRoom([room, { ...other, status: "archived" }], "Managers")).toBeNull();
  });
});
