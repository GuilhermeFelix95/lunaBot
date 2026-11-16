// @vitest-environment node

import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgentModelOption,
  type BrowserControlState,
  type BrowserTab,
  MANAGERS_ROOM_ID,
} from "@lunabot/contracts/ipc";
import { afterEach, describe, expect, it, vi } from "vitest";
import { removeDirectory } from "../test-utils/fs";
import { AgentService } from "./agent-service";
import { BotStore } from "./bot-store";
import { MailboxStore } from "./mailbox-store";
import { roomRequestNoticeMessage } from "./room-manager-instructions";
import { RoomService, roomCopyName, roomManagerRuntime } from "./room-service";

const roots: string[] = [];
const openStores: BotStore[] = [];

const MANAGER = {
  name: "Room Lead",
  description: "Coordinates the room.",
  avatarSeed: "setup:room-lead",
  avatarHue: 215,
} as const;

const SOURCE = {
  name: "Planning Bot",
  description: "Builds clear plans.",
  avatarSeed: "setup:planning",
  avatarHue: 215,
} as const;

afterEach(async () => {
  for (const store of openStores.splice(0)) store.database.close();
  await Promise.all(roots.splice(0).map((root) => removeDirectory(root)));
});

describe("RoomService", () => {
  it("hires a profile-only copy and leaves the original bot and its data untouched", async () => {
    const { store, agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    await writeFile(join(source.workspacePath, "notes.txt"), "private notes");
    agents.createMemory({ botId: source.id, text: "The client prefers mornings." });
    agents.createRoutine({
      botId: source.id,
      name: "Daily check",
      instruction: "Check the plan.",
      active: true,
      timezone: "Europe/Warsaw",
      schedule: { kind: "weekdays", time: "07:00" },
    });
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });

    const copyId = await rooms.copyBotIntoRoom(room.id, source.id);

    const copy = store.list().find((bot) => bot.id === copyId);
    expect(copy).toMatchObject({ description: SOURCE.description, avatarSeed: SOURCE.avatarSeed });
    expect(agents.listMemories(copyId)).toEqual([]);
    expect(agents.listRoutines(copyId)).toEqual([]);
    await expect(stat(join(copy?.workspacePath ?? "", "notes.txt"))).rejects.toThrow();

    expect(store.list().find((bot) => bot.id === source.id)).toMatchObject({ name: SOURCE.name });
    expect(agents.listMemories(source.id)).toHaveLength(1);
    expect(agents.listRoutines(source.id)).toHaveLength(1);
    await expect(stat(join(source.workspacePath, "notes.txt"))).resolves.toBeDefined();
    expect(rooms.getRoom(room.id).members.find((member) => member.botId === copyId)).toMatchObject({
      role: "member",
      status: "active",
    });
  });

  it("hides manager and copied bots from general listings, and refuses to hire a room bot", async () => {
    const { agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const manager = room.members.find((member) => member.role === "manager");
    const copyId = await rooms.copyBotIntoRoom(room.id, source.id);

    expect(agents.listBots().map((bot) => bot.id)).toEqual([source.id]);
    expect(manager).toBeDefined();
    await expect(rooms.copyBotIntoRoom(room.id, manager?.botId ?? "")).rejects.toThrow("already belongs to a room");
    await expect(rooms.copyBotIntoRoom(room.id, copyId)).rejects.toThrow("already belongs to a room");
  });

  it("keeps room bots out of general listings, search and runtime state, but not out of their own room", async () => {
    const { store, agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const copyId = await rooms.copyBotIntoRoom(room.id, source.id);
    const managerId = room.members.find((member) => member.role === "manager")?.botId ?? "";
    const now = new Date().toISOString();

    for (const botId of [source.id, managerId, copyId]) {
      const threadId = store.ensureThreadIdNow(botId);
      await agents.updateBot({ botId, provider: "codex", model: "gpt-5.6-terra" });
      store.database.appendConversationMessage({
        botId,
        threadId,
        activeTurnId: null,
        eventType: "message.created",
        message: {
          id: `msg-${botId}`,
          author: "user",
          source: "user",
          text: "plan notes",
          createdAt: now,
          status: "completed",
        },
      });
    }

    expect(agents.listBots().map((bot) => bot.id)).toEqual([source.id]);
    expect(agents.getRuntimeSnapshot().bots.map((bot) => bot.id)).toEqual([source.id]);
    expect(agents.searchConversationMessages("plan notes").results.map((result) => result.botId)).toEqual([source.id]);
    const reads = agents.listConversationReads(source.id);
    expect(reads[managerId]).toBeUndefined();
    expect(reads[copyId]).toBeUndefined();
    expect(agents.searchConversationMessages("plan notes", managerId).results.map((result) => result.botId)).toEqual([
      managerId,
    ]);
    expect(
      rooms
        .botProfiles(room.id)
        .map((bot) => bot.id)
        .sort(),
    ).toEqual([managerId, copyId].sort());
  });

  it("saves a room manager's provider, model and effort through its bot id, and lists them in the room", async () => {
    const { store, agents, rooms } = await setup();
    vi.spyOn(agents, "ensureProvider").mockResolvedValue(undefined);
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const managerId = room.members.find((member) => member.role === "manager")?.botId ?? "";

    await agents.updateBot({ botId: managerId, provider: "claude", model: "claude-haiku-5-5", reasoningEffort: "low" });

    expect(store.database.listAgents().find((bot) => bot.id === managerId)).toMatchObject({
      provider: "claude",
      model: "claude-haiku-5-5",
      reasoningEffort: "low",
    });
    expect(rooms.botProfiles(room.id).find((bot) => bot.id === managerId)).toMatchObject({
      provider: "claude",
      model: "claude-haiku-5-5",
    });
  });

  it("starts the manager on the first connected provider in order when the app's provider is not connected", async () => {
    const { store, agents, rooms } = await setup();
    vi.spyOn(agents, "availableProviders").mockReturnValue(["grok", "claude"]);
    vi.spyOn(agents, "ensureProvider").mockResolvedValue(undefined);

    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const managerId = room.members.find((member) => member.role === "manager")?.botId ?? "";

    expect(store.list().find((bot) => bot.id === managerId)).toMatchObject({
      provider: "claude",
      model: "claude-haiku-5-5",
    });
  });

  it("deletes the manager bot when room setup fails after it was created, so no general bot is left behind", async () => {
    const { store, agents, rooms } = await setup();
    vi.spyOn(agents, "availableProviders").mockReturnValue(["claude"]);
    vi.spyOn(agents, "ensureProvider").mockResolvedValue(undefined);
    vi.spyOn(agents, "updateBot").mockRejectedValueOnce(new Error("runtime unavailable"));

    await expect(rooms.createRoom({ name: "Launch", manager: MANAGER })).rejects.toThrow("runtime unavailable");

    expect(store.list()).toEqual([]);
    expect(agents.listBots()).toEqual([]);
    expect(rooms.listRooms()).toEqual([]);
  });

  it("allows at most eight active copies, and a dismissed copy frees its slot", async () => {
    const { agents, rooms } = await setup();
    const sources = [];
    for (let index = 0; index < 9; index += 1) {
      sources.push(
        await agents.createBotProfile({ ...SOURCE, name: `Helper ${index}`, avatarSeed: `setup:helper-${index}` }),
      );
    }
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const copyIds: string[] = [];
    for (const source of sources.slice(0, 8)) copyIds.push(await rooms.copyBotIntoRoom(room.id, source.id));

    await expect(rooms.copyBotIntoRoom(room.id, sources[8]?.id ?? "")).rejects.toThrow("8 active bots");
    expect(rooms.getRoom(room.id).members.filter((member) => member.role === "member")).toHaveLength(8);

    await rooms.dismissMember(room.id, copyIds[0] ?? "");
    await expect(rooms.copyBotIntoRoom(room.id, sources[8]?.id ?? "")).resolves.toEqual(expect.any(String));
  });

  it("archives a room without touching its bots, and blocks hiring until it is reopened", async () => {
    const { agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    await rooms.copyBotIntoRoom(room.id, source.id);

    const archived = rooms.archiveRoom(room.id);
    expect(archived).toMatchObject({ status: "archived" });
    expect(archived.members.every((member) => member.status === "active")).toBe(true);
    expect(agents.listBots().map((bot) => bot.id)).toEqual([source.id]);
    await expect(rooms.copyBotIntoRoom(room.id, source.id)).rejects.toThrow("active room");

    expect(rooms.reopenRoom(room.id)).toMatchObject({ status: "active", archivedAt: null });
  });

  it("deletes an archived room forever with its copies and folder, and never the originals", async () => {
    const { store, agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const copyId = await rooms.copyBotIntoRoom(room.id, source.id);

    await expect(rooms.deleteRoomForever(room.id)).rejects.toThrow("Archive the room");

    rooms.archiveRoom(room.id);
    await rooms.deleteRoomForever(room.id);

    expect(rooms.listRooms()).toEqual([]);
    const botIds = store.list().map((bot) => bot.id);
    expect(botIds).toEqual([source.id]);
    expect(botIds).not.toContain(copyId);
    await expect(stat(join(store.roomsRoot, room.id))).rejects.toThrow();
  });

  it("leaves no bot row behind when a deleted room's manager is still asked for", async () => {
    const { store, agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER, memberBotIds: [source.id] });
    const managerId = room.members.find((member) => member.role === "manager")?.botId ?? "";
    const copyId = room.members.find((member) => member.role === "member")?.botId ?? "";
    rooms.archiveRoom(room.id);
    await rooms.deleteRoomForever(room.id);

    // The open conversation may still request the deleted manager. Those reads must not recreate it.
    expect((await agents.readConversation(managerId)).messages).toEqual([]);
    expect((await agents.readConversationPageFor(managerId, "member-reader")).messages).toEqual([]);
    expect(rooms.botProfiles(room.id)).toEqual([]);

    expect(store.list().map((bot) => bot.id)).toEqual([source.id]);
    expect(agents.listBots().map((bot) => bot.id)).toEqual([source.id]);
    expect(tablesMentioning(store, managerId)).toEqual([]);
    expect(tablesMentioning(store, copyId)).toEqual([]);
  });

  it("keeps the source name on a hired copy, and suffixes only a clash inside the same room", async () => {
    const { agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });

    await rooms.copyBotIntoRoom(room.id, source.id);
    await rooms.copyBotIntoRoom(room.id, source.id);

    const names = rooms
      .getRoom(room.id)
      .members.filter((member) => member.role === "member")
      .map((member) => member.name);
    expect(names).toEqual([SOURCE.name, `${SOURCE.name} 2`]);
    expect(agents.listBots().map((bot) => bot.name)).toEqual([SOURCE.name]);
  });

  it("approves a manager request into a copy, and rejects another without hiring", async () => {
    const { agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    const other = await agents.createBotProfile({ ...SOURCE, name: "Other Bot", avatarSeed: "setup:other" });
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const managerId = room.members.find((member) => member.role === "manager")?.botId ?? "";

    const approved = rooms.createRequest({
      roomId: room.id,
      requestedByBotId: managerId,
      kind: "hire",
      targetBotId: source.id,
      reason: "Needs planning help.",
    });
    const rejected = rooms.createRequest({
      roomId: room.id,
      requestedByBotId: managerId,
      kind: "hire",
      targetBotId: other.id,
      reason: "Not needed.",
    });
    expect(approved.status).toBe("pending");

    const afterApprove = await rooms.resolveRequest(approved.id, "approve");
    const fulfilled = afterApprove.requests.find((request) => request.id === approved.id);
    expect(fulfilled).toMatchObject({ status: "fulfilled" });
    expect(afterApprove.members.some((member) => member.botId === fulfilled?.createdBotId)).toBe(true);

    const afterReject = await rooms.resolveRequest(rejected.id, "reject");
    expect(afterReject.requests.find((request) => request.id === rejected.id)).toMatchObject({ status: "rejected" });
    expect(afterReject.members.filter((member) => member.role === "member")).toHaveLength(1);
    await expect(rooms.resolveRequest(approved.id, "approve")).rejects.toThrow("already resolved");
  });

  it("fulfills a new-bot request only with the bot the user created, and never twice", async () => {
    const { agents, rooms } = await setup();
    const created = await agents.createBotProfile({ ...SOURCE, name: "Copywriter", avatarSeed: "setup:copywriter" });
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const managerId = room.members.find((member) => member.role === "manager")?.botId ?? "";
    const request = rooms.createRequest({
      roomId: room.id,
      requestedByBotId: managerId,
      kind: "new_bot",
      profile: { name: "Copywriter", title: "", description: "Writes copy." },
      reason: "Needs campaign copy.",
    });

    await expect(rooms.resolveRequest(request.id, "approve")).rejects.toThrow("Choose the bot created");
    expect(rooms.getRoom(room.id).requests.find((item) => item.id === request.id)).toMatchObject({ status: "pending" });

    const afterApprove = await rooms.resolveRequest(request.id, "approve", created.id);
    expect(afterApprove.requests.find((item) => item.id === request.id)).toMatchObject({
      status: "fulfilled",
      createdBotId: created.id,
    });
    await expect(rooms.resolveRequest(request.id, "approve", created.id)).rejects.toThrow("already resolved");
  });

  it("tells the manager how each answered hire went, and only the manager", async () => {
    const { agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    const other = await agents.createBotProfile({ ...SOURCE, name: "Other Bot", avatarSeed: "setup:other" });
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const managerId = room.members.find((member) => member.role === "manager")?.botId ?? "";
    const approved = rooms.createRequest({
      roomId: room.id,
      requestedByBotId: managerId,
      kind: "hire",
      targetBotId: source.id,
      reason: "Needs planning help.",
    });
    const declined = rooms.createRequest({
      roomId: room.id,
      requestedByBotId: managerId,
      kind: "hire",
      targetBotId: other.id,
      reason: "Not needed.",
    });

    const afterApprove = await rooms.resolveRequest(approved.id, "approve");
    await rooms.resolveRequest(declined.id, "reject");

    const copyId = afterApprove.members.find((member) => member.role === "member")?.botId ?? "";
    expect(noticeTexts(agents, managerId)).toEqual([
      "The user approved hiring Planning Bot. Planning Bot is now an active member of the room.",
      "The user declined hiring Other Bot.",
    ]);
    expect(agents.listQueue(copyId).deliveries).toEqual([]);
    expect(agents.listQueue(source.id).deliveries).toEqual([]);
  });

  it("tells the manager when the user dismisses a member, using the member's name", async () => {
    const { agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const managerId = room.members.find((member) => member.role === "manager")?.botId ?? "";
    const copyId = await rooms.copyBotIntoRoom(room.id, source.id);
    const dismissal = rooms.createRequest({
      roomId: room.id,
      requestedByBotId: managerId,
      kind: "dismiss",
      targetBotId: copyId,
      reason: "Done.",
    });

    await rooms.resolveRequest(dismissal.id, "approve");

    expect(noticeTexts(agents, managerId)).toEqual(["The user dismissed Planning Bot from the room."]);
  });

  it("tells the manager which new bot the user created, and which one the user declined", async () => {
    const { agents, rooms } = await setup();
    const created = await agents.createBotProfile({ ...SOURCE, name: "Copywriter", avatarSeed: "setup:copywriter" });
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const managerId = room.members.find((member) => member.role === "manager")?.botId ?? "";
    const made = rooms.createRequest({
      roomId: room.id,
      requestedByBotId: managerId,
      kind: "new_bot",
      profile: { name: "Copywriter", title: "", description: "Writes copy." },
      reason: "Needs campaign copy.",
    });
    const declined = rooms.createRequest({
      roomId: room.id,
      requestedByBotId: managerId,
      kind: "new_bot",
      profile: { name: "Designer", title: "", description: "Designs pages." },
      reason: "Needs a designer.",
    });

    await rooms.resolveRequest(made.id, "approve", created.id);
    await rooms.resolveRequest(declined.id, "reject");

    expect(noticeTexts(agents, managerId)).toEqual([
      "The user created the bot Copywriter for your request; you can ask to hire it now.",
      "The user declined your request for a new bot named Designer.",
    ]);
  });

  it("sends one notice per answer, and none once the room is archived", async () => {
    const { agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    const helper = await agents.createBotProfile({ ...SOURCE, name: "Helper", avatarSeed: "setup:helper" });
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const managerId = room.members.find((member) => member.role === "manager")?.botId ?? "";
    const request = rooms.createRequest({
      roomId: room.id,
      requestedByBotId: managerId,
      kind: "hire",
      targetBotId: source.id,
      reason: "Needs planning help.",
    });
    const laterRequest = rooms.createRequest({
      roomId: room.id,
      requestedByBotId: managerId,
      kind: "hire",
      targetBotId: helper.id,
      reason: "Needs help.",
    });

    await rooms.resolveRequest(request.id, "reject");
    await expect(rooms.resolveRequest(request.id, "reject")).rejects.toThrow("already resolved");
    expect(noticeTexts(agents, managerId)).toEqual(["The user declined hiring Planning Bot."]);

    rooms.archiveRoom(room.id);
    await rooms.resolveRequest(laterRequest.id, "reject");
    expect(noticeTexts(agents, managerId)).toEqual(["The user declined hiring Planning Bot."]);
  });

  it("lists only the manager and active members in the room conversation", async () => {
    const { agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    const other = await agents.createBotProfile({ ...SOURCE, name: "Other Bot", avatarSeed: "setup:other" });
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const managerId = room.members.find((member) => member.role === "manager")?.botId ?? "";
    const copyId = await rooms.copyBotIntoRoom(room.id, source.id);
    const dismissedId = await rooms.copyBotIntoRoom(room.id, other.id);
    await rooms.dismissMember(room.id, dismissedId);

    expect(
      rooms
        .botProfiles(room.id)
        .map((bot) => bot.id)
        .sort(),
    ).toEqual([managerId, copyId].sort());
  });

  it("lets only the room manager request bots", async () => {
    const { agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    const helper = await agents.createBotProfile({ ...SOURCE, name: "Helper", avatarSeed: "setup:helper" });
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const copyId = await rooms.copyBotIntoRoom(room.id, helper.id);

    expect(() =>
      rooms.createRequest({
        roomId: room.id,
        requestedByBotId: copyId,
        kind: "hire",
        targetBotId: source.id,
        reason: "Please add.",
      }),
    ).toThrow("Only the room manager");
  });

  it("shows room tools only to the active manager, and its catalog lists general agents but no room bots", async () => {
    const { agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    const helper = await agents.createBotProfile({ ...SOURCE, name: "Helper", avatarSeed: "setup:helper" });
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const managerId = room.members.find((member) => member.role === "manager")?.botId ?? "";
    const copyId = await rooms.copyBotIntoRoom(room.id, helper.id);

    expect(rooms.managerTool(managerId, "room_members", {})).toEqual({
      members: expect.arrayContaining([expect.objectContaining({ botId: copyId, role: "member" })]),
    });
    // A copy is a new bot, so the original helper stays in the general catalog. Room bots never appear in it.
    const catalog = JSON.stringify(rooms.managerTool(managerId, "room_catalog", {}));
    expect(catalog).toContain(source.id);
    expect(catalog).toContain(helper.id);
    expect(catalog).not.toContain(copyId);
    expect(catalog).not.toContain(managerId);
    expect(() => rooms.managerTool(copyId, "room_members", {})).toThrow("Only the active room manager");
    expect(() => rooms.managerTool(copyId, "room_catalog", {})).toThrow("Only the active room manager");
  });

  it("lets a manager list the other active rooms with their manager and members, and nothing else", async () => {
    const { agents, rooms } = await setup();
    const helper = await agents.createBotProfile({
      ...SOURCE,
      name: "Banner Maker",
      description: "Designs banners.",
      avatarSeed: "setup:banner",
    });
    const dev = await rooms.createRoom({ name: "Dev", manager: MANAGER });
    const instagram = await rooms.createRoom({
      name: "Instagram",
      manager: { ...MANAGER, name: "Instagram Lead", avatarSeed: "setup:ig-lead" },
    });
    const copyId = await rooms.copyBotIntoRoom(instagram.id, helper.id);
    const archived = await rooms.createRoom({
      name: "Old",
      manager: { ...MANAGER, name: "Old Lead", avatarSeed: "setup:old-lead" },
    });
    rooms.archiveRoom(archived.id);
    const devManagerId = dev.members.find((member) => member.role === "manager")?.botId ?? "";
    const instagramManagerId = instagram.members.find((member) => member.role === "manager")?.botId ?? "";

    const result = JSON.stringify(rooms.managerTool(devManagerId, "list_rooms", {}));

    expect(result).toContain("Instagram");
    expect(result).toContain(instagramManagerId);
    expect(result).toContain("Banner Maker");
    expect(result).toContain("Designs banners.");
    // Its own room and archived rooms are left out, and a member's id is never handed out: only the manager is addressable.
    expect(result).not.toContain(devManagerId);
    expect(result).not.toContain("Old");
    expect(result).not.toContain(copyId);
    expect(() => rooms.managerTool(copyId, "list_rooms", {})).toThrow("Only the active room manager");
  });

  it("files manager requests as pending, refuses duplicates and manager dismissal, and applies an approved dismissal", async () => {
    const { agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    const helper = await agents.createBotProfile({ ...SOURCE, name: "Helper", avatarSeed: "setup:helper" });
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const managerId = room.members.find((member) => member.role === "manager")?.botId ?? "";
    const copyId = await rooms.copyBotIntoRoom(room.id, helper.id);

    expect(rooms.managerTool(managerId, "request_hire", { botId: source.id, reason: "Needs planning." })).toEqual({
      requestId: expect.any(String),
      kind: "hire",
      status: "pending",
    });
    expect(() => rooms.managerTool(managerId, "request_hire", { botId: source.id, reason: "Again." })).toThrow(
      "already pending",
    );
    expect(() => rooms.managerTool(managerId, "request_dismiss", { botId: managerId, reason: "No." })).toThrow(
      "can't be dismissed",
    );
    expect(() => rooms.managerTool(managerId, "request_new_bot", { name: " ", reason: "Need a designer." })).toThrow(
      "name must be text",
    );
    expect(
      rooms.managerTool(managerId, "request_new_bot", { name: "Designer", reason: "Need a designer." }),
    ).toMatchObject({ kind: "new_bot", status: "pending" });

    const dismissal = rooms.managerTool(managerId, "request_dismiss", { botId: copyId, reason: "Done." });
    if (!("requestId" in dismissal)) throw new Error("The dismissal was not filed as a request.");
    const afterApprove = await rooms.resolveRequest(dismissal.requestId, "approve");
    expect(afterApprove.members.find((member) => member.botId === copyId)).toMatchObject({ status: "dismissed" });
    expect(afterApprove.requests.find((request) => request.id === dismissal.requestId)).toMatchObject({
      kind: "dismiss",
      status: "fulfilled",
      targetBotId: copyId,
    });
  });

  it("dismisses a copy by stopping it, keeping its history, and refuses to dismiss the manager", async () => {
    const { agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const copyId = await rooms.copyBotIntoRoom(room.id, source.id);
    agents.createMemory({ botId: copyId, text: "Kept after dismissal." });
    const managerId = room.members.find((member) => member.role === "manager")?.botId ?? "";

    const dismissed = await rooms.dismissMember(room.id, copyId);
    expect(dismissed.members.find((member) => member.botId === copyId)).toMatchObject({ status: "dismissed" });
    expect(agents.listBots().map((bot) => bot.id)).toEqual([source.id]);
    expect(agents.listMemories(copyId).map((memory) => memory.text)).toEqual(["Kept after dismissal."]);
    await expect(rooms.dismissMember(room.id, managerId)).rejects.toThrow("can't be dismissed");
  });

  it("removes the membership row when a hire fails, so no half-hired copy stays in the room", async () => {
    const { store, agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    vi.spyOn(agents, "copyBotProfileIntoRoom").mockRejectedValueOnce(new Error("copy failed"));

    await expect(rooms.copyBotIntoRoom(room.id, source.id)).rejects.toThrow("copy failed");

    const [manager] = rooms.getRoom(room.id).members;
    expect(rooms.getRoom(room.id).members.map((member) => member.role)).toEqual(["manager"]);
    expect(
      store
        .list()
        .map((bot) => bot.id)
        .sort(),
    ).toEqual([manager.botId, source.id].sort());
  });

  it("keeps the room and its copies when a member is still working at delete time", async () => {
    const { store, agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const copyId = await rooms.copyBotIntoRoom(room.id, source.id);
    rooms.archiveRoom(room.id);
    vi.spyOn(agents, "waitUntilIdle").mockResolvedValueOnce(false);

    await expect(rooms.deleteRoomForever(room.id)).rejects.toThrow("still working");

    expect(rooms.getRoom(room.id).status).toBe("archived");
    expect(store.list().map((bot) => bot.id)).toContain(copyId);
  });

  it("clears the room's browser data when it is deleted forever", async () => {
    const { agents, rooms } = await setup();
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    rooms.archiveRoom(room.id);
    const clear = vi.spyOn(agents, "clearRoomBrowserData");

    await rooms.deleteRoomForever(room.id);

    expect(clear).toHaveBeenCalledWith(room.id);
  });

  it("shows the managers room feed only for messages between managers of different rooms", async () => {
    const { agents, mailbox, rooms } = await setup();
    const helper = await agents.createBotProfile(SOURCE);
    const dev = await rooms.createRoom({ name: "Dev", manager: MANAGER });
    const content = await rooms.createRoom({
      name: "Content",
      manager: { ...MANAGER, name: "Content Lead", avatarSeed: "setup:content-lead" },
    });
    const devManager = dev.members.find((member) => member.role === "manager")?.botId ?? "";
    const contentManager = content.members.find((member) => member.role === "manager")?.botId ?? "";
    const copyId = await rooms.copyBotIntoRoom(content.id, helper.id);
    await mailbox.enqueue({
      sender: { kind: "bot", botId: devManager },
      recipientBotIds: [contentManager],
      text: "Need a banner",
    });
    await mailbox.enqueue({
      sender: { kind: "bot", botId: contentManager },
      recipientBotIds: [copyId],
      text: "Inside",
    });
    await mailbox.enqueue({ sender: { kind: "user" }, recipientBotIds: [devManager], text: "From the user" });

    const feed = rooms.backstage(MANAGERS_ROOM_ID);

    expect(feed.map((message) => message.text)).toEqual(["Need a banner"]);
    expect(feed[0]).toMatchObject({
      authorBotId: devManager,
      authorName: `${MANAGER.name} (Dev)`,
      recipientBotIds: [contentManager],
    });
  });

  it("shows the backstage only for messages between active members of the room", async () => {
    const { agents, mailbox, rooms } = await setup();
    const outsider = await agents.createBotProfile(SOURCE);
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const managerId = room.members.find((member) => member.role === "manager")?.botId ?? "";
    const copyId = await rooms.copyBotIntoRoom(room.id, outsider.id);
    await mailbox.enqueue({ sender: { kind: "bot", botId: managerId }, recipientBotIds: [copyId], text: "Inside" });
    await mailbox.enqueue({
      sender: { kind: "bot", botId: managerId },
      recipientBotIds: [outsider.id],
      text: "Outbound",
    });
    await mailbox.enqueue({ sender: { kind: "bot", botId: outsider.id }, recipientBotIds: [copyId], text: "Inbound" });
    await mailbox.enqueue({ sender: { kind: "user" }, recipientBotIds: [copyId], text: "From the user" });

    const backstage = rooms.backstage(room.id);
    expect(backstage.map((message) => message.text)).toEqual(["Inside"]);
    expect(backstage[0]).toMatchObject({ authorBotId: managerId, authorName: MANAGER.name, recipientBotIds: [copyId] });
  });

  it("refuses a user message that mixes room bots with general agents", async () => {
    const { agents, mailbox, rooms } = await setup();
    const outsider = await agents.createBotProfile(SOURCE);
    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });
    const managerId = room.members.find((member) => member.role === "manager")?.botId ?? "";

    await expect(
      mailbox.enqueue({ sender: { kind: "user" }, recipientBotIds: [managerId, outsider.id], text: "Hi" }),
    ).rejects.toThrow("Choose recipients from one room or from general agents.");
  });

  it("rejects an empty room name before creating a manager bot", async () => {
    const { store, rooms } = await setup();

    await expect(rooms.createRoom({ name: "   ", manager: MANAGER })).rejects.toThrow("A room needs a name");
    expect(store.list()).toEqual([]);
    expect(rooms.listRooms()).toEqual([]);
  });

  it("creates a room with the chosen browser mode and hires the selected bots as copies", async () => {
    const { store, agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);

    const room = await rooms.createRoom({
      name: "Launch",
      manager: MANAGER,
      browserMode: "shared",
      memberBotIds: [source.id],
    });

    expect(room.browserMode).toBe("shared");
    const hired = room.members.filter((member) => member.role === "member");
    expect(hired).toHaveLength(1);
    expect(hired[0]).toMatchObject({ status: "active", name: SOURCE.name });
    expect(hired[0]?.botId).not.toBe(source.id);
    expect(store.list().find((bot) => bot.id === source.id)).toMatchObject({ name: SOURCE.name });
  });

  it("defaults to an exclusive browser with no hired members", async () => {
    const { rooms } = await setup();

    const room = await rooms.createRoom({ name: "Launch", manager: MANAGER });

    expect(room.browserMode).toBe("exclusive");
    expect(room.members.map((member) => member.role)).toEqual(["manager"]);
  });

  it("refuses unknown or repeated members, and too many members, before creating anything", async () => {
    const { store, agents, rooms } = await setup();
    const source = await agents.createBotProfile(SOURCE);

    await expect(rooms.createRoom({ name: "Launch", manager: MANAGER, memberBotIds: ["bot-missing"] })).rejects.toThrow(
      "Unknown bot: bot-missing",
    );
    await expect(
      rooms.createRoom({ name: "Launch", manager: MANAGER, memberBotIds: [source.id, source.id] }),
    ).rejects.toThrow("A bot can only be hired once.");
    const nine = Array.from({ length: 9 }, (_, index) => `bot-missing-${index}`);
    await expect(rooms.createRoom({ name: "Launch", manager: MANAGER, memberBotIds: nine })).rejects.toThrow(
      "A room can hold 8 active bots.",
    );
    expect(rooms.listRooms()).toEqual([]);
    expect(store.list().map((bot) => bot.id)).toEqual([source.id]);
  });
});

describe("roomRequestNoticeMessage", () => {
  it("writes the English note the room manager reads for each answer", () => {
    expect(roomRequestNoticeMessage({ decision: "approve", requestKind: "hire", name: "Chief" })).toBe(
      "The user approved hiring Chief. Chief is now an active member of the room.",
    );
    expect(roomRequestNoticeMessage({ decision: "reject", requestKind: "hire", name: "Chief" })).toBe(
      "The user declined hiring Chief.",
    );
    expect(roomRequestNoticeMessage({ decision: "approve", requestKind: "dismiss", name: "Research" })).toBe(
      "The user dismissed Research from the room.",
    );
    expect(roomRequestNoticeMessage({ decision: "approve", requestKind: "new_bot", name: "Analyst" })).toBe(
      "The user created the bot Analyst for your request; you can ask to hire it now.",
    );
  });
});

describe("roomCopyName", () => {
  it("keeps the source name when the room has no clash", () => {
    expect(roomCopyName("Planning Bot", ["Room Lead"], 80)).toBe("Planning Bot");
  });

  it("adds the next free number when the name is already in the room, ignoring case and spacing", () => {
    expect(roomCopyName("Planning Bot", ["planning bot "], 80)).toBe("Planning Bot 2");
    expect(roomCopyName("Planning Bot", ["Planning Bot", "Planning Bot 2"], 80)).toBe("Planning Bot 3");
  });

  it("keeps the suffixed name within the length limit", () => {
    const result = roomCopyName("a".repeat(80), ["a".repeat(80)], 80);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result.endsWith(" 2")).toBe(true);
  });
});

describe("roomManagerRuntime", () => {
  const option = (
    provider: AgentModelOption["provider"],
    id: string,
    defaultReasoningEffort: AgentModelOption["defaultReasoningEffort"] = "medium",
  ): AgentModelOption => ({
    provider,
    id,
    name: id,
    description: "",
    defaultReasoningEffort,
    supportedReasoningEfforts: [defaultReasoningEffort],
  });
  const models = [
    option("codex", "gpt-5.6-terra"),
    option("codex", "gpt-5.6-luna"),
    option("claude", "claude-sonnet-x"),
    option("claude", "claude-haiku-5-5", "low"),
    option("grok", "grok-a"),
  ];

  it("uses the app's preferred provider with its default model when that provider is connected", () => {
    expect(roomManagerRuntime({ preferredProvider: "codex", availableProviders: ["codex", "claude"], models })).toEqual(
      { provider: "codex", model: "gpt-5.6-luna", reasoningEffort: "medium" },
    );
  });

  it("falls back to Claude first, then ChatGPT, then Grok, when the preferred provider is not connected", () => {
    expect(roomManagerRuntime({ preferredProvider: "grok", availableProviders: ["codex", "claude"], models })).toEqual({
      provider: "claude",
      model: "claude-haiku-5-5",
      reasoningEffort: "low",
    });
    expect(
      roomManagerRuntime({ preferredProvider: "claude", availableProviders: ["grok", "codex"], models }),
    ).toMatchObject({ provider: "codex", model: "gpt-5.6-luna" });
  });

  it("uses the first listed model when the provider has no default model", () => {
    expect(roomManagerRuntime({ preferredProvider: "codex", availableProviders: ["grok"], models })).toEqual({
      provider: "grok",
      model: "grok-a",
      reasoningEffort: "medium",
    });
  });

  it("returns null when no provider is connected, so the manager keeps the store default", () => {
    expect(roomManagerRuntime({ preferredProvider: "codex", availableProviders: [], models })).toBeNull();
  });
});

// The English notes the manager will read, in the order they were queued.
function noticeTexts(agents: AgentService, botId: string): string[] {
  return agents
    .listQueue(botId)
    .deliveries.flatMap((delivery) =>
      delivery.sender.kind === "system" ? [roomRequestNoticeMessage(delivery.sender.notice)] : [],
    );
}

function tablesMentioning(store: BotStore, value: string): string[] {
  const connection = store.database.connection;
  const tables = connection
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => String(row.name));
  return tables.filter((name) => {
    const rows = connection.prepare(`SELECT * FROM "${name}"`).all();
    return rows.some((row) => Object.values(row).some((cell) => String(cell).includes(value)));
  });
}

async function setup(): Promise<{ store: BotStore; agents: AgentService; rooms: RoomService; mailbox: MailboxStore }> {
  const root = await mkdtemp(join(tmpdir(), "lunabot-room-"));
  roots.push(root);
  const store = new BotStore(join(root, "user-data"), join(root, "home"));
  await store.initialize();
  openStores.push(store);
  const mailbox = new MailboxStore(join(root, "user-data"), store.sharedRoot, store.database);
  const agents = new AgentService(store, mailbox, fakeBrowser());
  return { store, agents, rooms: new RoomService(store, agents), mailbox };
}

function fakeBrowser() {
  return {
    onChanged: (_listener: (tabs: BrowserTab[], activeTabId: string | null) => void) => () => undefined,
    onControlChanged: (_listener: (state: BrowserControlState) => void) => () => undefined,
    clearControls: () => undefined,
    endControl: () => undefined,
    listTabs: () => [],
    handleDynamicTool: async () => ({ success: true, contentItems: [] }),
    clearRoomBrowserData: async (_roomId: string) => undefined,
  };
}
