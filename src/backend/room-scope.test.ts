import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type BotScope,
  botScope,
  browserPartitionForScope,
  canReachBot,
  GENERAL_BROWSER_PARTITION,
  type RoomMembership,
  roomBrowserPartition,
  sharedRootForScope,
} from "./room-scope";

const exclusive: RoomMembership = {
  roomId: "room-a",
  role: "member",
  memberActive: true,
  roomActive: true,
  browserMode: "exclusive",
};

const memberships = new Map<string, RoomMembership>([
  ["manager-a", { ...exclusive, role: "manager" }],
  ["member-a", exclusive],
  ["dismissed-a", { ...exclusive, memberActive: false }],
  ["member-b", { ...exclusive, roomId: "room-b" }],
  ["member-archived", { ...exclusive, roomActive: false }],
]);

describe("room scope", () => {
  it("keeps general bots out of every room and lets them reach only general bots", () => {
    const general = botScope("general-bot", memberships);
    expect(general.kind).toBe("general");
    expect(canReachBot(general, "general-other", memberships)).toBe(true);
    for (const roomBot of memberships.keys()) {
      expect(canReachBot(general, roomBot, memberships)).toBe(false);
    }
  });

  it("lets a room bot reach only active members of its own room", () => {
    const scope = botScope("member-a", memberships);
    expect(canReachBot(scope, "manager-a", memberships)).toBe(true);
    expect(canReachBot(scope, "member-a", memberships)).toBe(true);
    expect(canReachBot(scope, "dismissed-a", memberships)).toBe(false);
    expect(canReachBot(scope, "member-b", memberships)).toBe(false);
    expect(canReachBot(scope, "general-bot", memberships)).toBe(false);
  });

  it("gives dismissed members and archived rooms no reach at all", () => {
    expect(canReachBot(botScope("dismissed-a", memberships), "manager-a", memberships)).toBe(false);
    const archived = botScope("member-archived", memberships);
    expect(archived.kind === "room" && archived.active).toBe(false);
    expect(canReachBot(archived, "member-archived", memberships)).toBe(false);
  });

  it("points room bots at the room's own shared folder and general bots at the general one", () => {
    const general = botScope("general-bot", memberships);
    expect(sharedRootForScope(general, "/lunabot/Shared", "/lunabot/Rooms")).toBe("/lunabot/Shared");
    const room = botScope("member-a", memberships);
    expect(sharedRootForScope(room, "/lunabot/Shared", "/lunabot/Rooms")).toBe(
      join("/lunabot/Rooms", "room-a", "shared"),
    );
  });
});

describe("browser partition choice", () => {
  const scopeWith = (overrides: Partial<RoomMembership>): BotScope =>
    botScope("member-a", new Map([["member-a", { ...exclusive, ...overrides }]]));

  it("always uses the general partition for general bots", () => {
    expect(browserPartitionForScope(botScope("general-bot", memberships))).toBe(GENERAL_BROWSER_PARTITION);
  });

  it("gives an exclusive room its own partition", () => {
    expect(browserPartitionForScope(scopeWith({ browserMode: "exclusive" }))).toBe(
      "persist:lunabot-browser-room-room-a",
    );
    expect(browserPartitionForScope(scopeWith({ browserMode: "exclusive" }))).toBe(roomBrowserPartition("room-a"));
  });

  it("uses the general partition for an active shared room", () => {
    expect(browserPartitionForScope(scopeWith({ browserMode: "shared" }))).toBe(GENERAL_BROWSER_PARTITION);
  });

  it("keeps inactive bots of a shared room out of the general partition", () => {
    expect(browserPartitionForScope(scopeWith({ browserMode: "shared", memberActive: false }))).toBe(
      "persist:lunabot-browser-room-room-a",
    );
  });
});
