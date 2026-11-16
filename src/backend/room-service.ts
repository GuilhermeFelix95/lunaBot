import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { INPUT_LIMITS } from "@lunabot/contracts/input-limits";
import {
  type AgentModelId,
  type AgentModelOption,
  type AgentProviderId,
  type AgentReasoningEffort,
  type BotSummary,
  type CreateRoomInput,
  MANAGERS_ROOM_ID,
  ROOM_ACTIVE_BOT_LIMIT,
  ROOM_NAME_MAX_LENGTH,
  type Room,
  type RoomBackstageMessage,
  type RoomMember,
  type RoomMemberRole,
  type RoomMemberStatus,
  type RoomRequest,
  type RoomRequestKind,
  type RoomRequestProfile,
  type RoomRequestStatus,
} from "@lunabot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord, isOneOf, isString } from "@lunabot/contracts/runtime-values";
import type { AgentService } from "./agent-service";
import type { BotStore } from "./bot-store";
import type { LunaBotDatabase } from "./lunabot-database";
import { databaseRows, optionalStringColumn, requiredStringColumn } from "./lunabot-database";

export type CreateRoomRequestInput = {
  roomId: string;
  requestedByBotId: string;
  reason: string;
} & ({ kind: "hire" | "dismiss"; targetBotId: string } | { kind: "new_bot"; profile: RoomRequestProfile });

const REQUEST_REASON_MAX_LENGTH = 1_000;

export type RoomManagerToolResult =
  | { members: Array<{ botId: string; name: string; role: RoomMemberRole }> }
  | { agents: Array<{ botId: string; name: string; title: string; description: string }> }
  | {
      rooms: Array<{
        roomId: string;
        name: string;
        managerBotId: string;
        members: Array<{ name: string; title: string; description: string }>;
      }>;
    }
  | { requestId: string; kind: RoomRequestKind; status: RoomRequestStatus };

// A room is a manager bot plus profile-only copies. Room bots are hidden from general listings through room_members.
export class RoomService extends EventEmitter {
  readonly #store: BotStore;
  readonly #agents: AgentService;
  readonly #database: LunaBotDatabase;

  constructor(store: BotStore, agents: AgentService) {
    super();
    this.#store = store;
    this.#agents = agents;
    this.#database = store.database;
    agents.attachRoomManagerTools(this);
  }

  listRooms(): Room[] {
    return databaseRows(this.#connection().prepare("SELECT * FROM rooms ORDER BY created_at, room_id").all()).map(
      (row) => this.#toRoom(row),
    );
  }

  getRoom(roomId: string): Room {
    return this.#requireRoom(roomId);
  }

  // Profiles of the manager and active members, for the room conversation. Not a general listing.
  botProfiles(roomId: string): BotSummary[] {
    if (roomId === MANAGERS_ROOM_ID) {
      const managerIds = new Set(this.#activeManagerNames().keys());
      return this.#store.list().filter((bot) => managerIds.has(bot.id));
    }
    const [row] = databaseRows(this.#connection().prepare("SELECT * FROM rooms WHERE room_id = ?").all(roomId));
    // A room deleted forever has no members left, so a late request for its profiles gets an empty list.
    if (!row) return [];
    const room = this.#toRoom(row);
    const activeIds = new Set(
      room.members.filter((member) => member.status === "active").map((member) => member.botId),
    );
    return this.#store.list().filter((bot) => activeIds.has(bot.id));
  }

  // Read-only backstage: only messages whose author and recipients are all active members of this room.
  backstage(roomId: string): RoomBackstageMessage[] {
    if (roomId === MANAGERS_ROOM_ID) return this.#managersFeed();
    const room = this.#requireRoom(roomId);
    const activeIds = new Set(
      room.members.filter((member) => member.status === "active").map((member) => member.botId),
    );
    const names = new Map(room.members.map((member) => [member.botId, member.name]));
    return this.#agents.roomMessages(activeIds).map((message) => ({
      ...message,
      authorName: names.get(message.authorBotId) ?? message.authorBotId,
    }));
  }

  // The managers room is virtual: messages whose author and recipients are all active managers, which can only be managers of different rooms.
  #activeManagerNames(): Map<string, string> {
    const names = new Map<string, string>();
    for (const room of this.listRooms()) {
      if (room.status !== "active") continue;
      for (const member of room.members) {
        if (member.role === "manager" && member.status === "active")
          names.set(member.botId, `${member.name} (${room.name})`);
      }
    }
    return names;
  }

  #managersFeed(): RoomBackstageMessage[] {
    const names = this.#activeManagerNames();
    return this.#agents.roomMessages(new Set(names.keys())).map((message) => ({
      ...message,
      authorName: names.get(message.authorBotId) ?? message.authorBotId,
    }));
  }

  // Membership rows are written before the bot record, so the bot is never listed as a general agent.
  async createRoom(input: CreateRoomInput): Promise<Room> {
    const name = roomName(input.name);
    const browserMode = input.browserMode ?? "exclusive";
    const memberBotIds = input.memberBotIds ?? [];
    // Checked before anything is written, so a bad member list never leaves a half-created room.
    if (memberBotIds.length > ROOM_ACTIVE_BOT_LIMIT) throw hireLimitError();
    if (new Set(memberBotIds).size !== memberBotIds.length) throw new Error("A bot can only be hired once.");
    for (const botId of memberBotIds) this.#assertHireableBot(botId);
    const roomId = `room-${randomUUID()}`;
    const managerId = `bot-${randomUUID()}`;
    const now = new Date().toISOString();
    const copyIds: string[] = [];
    let managerCreated = false;
    try {
      await mkdir(this.#sharedFolder(roomId), { recursive: true });
      this.#transaction(() => {
        this.#connection()
          .prepare(
            "INSERT INTO rooms (room_id, name, status, browser_mode, created_at, updated_at, archived_at) VALUES (?, ?, 'active', ?, ?, ?, NULL)",
          )
          .run(roomId, name, browserMode, now, now);
        this.#connection()
          .prepare(
            "INSERT INTO room_members (room_id, bot_id, role, status, added_at, dismissed_at) VALUES (?, ?, 'manager', 'active', ?, NULL)",
          )
          .run(roomId, managerId, now);
      });
      await this.#agents.createBotProfile(input.manager, managerId);
      managerCreated = true;
      const runtime = roomManagerRuntime({
        preferredProvider: this.#agents.preferredProvider(),
        availableProviders: this.#agents.availableProviders(),
        models: this.#agents.listModels(),
      });
      if (runtime) await this.#agents.updateBot({ botId: managerId, ...runtime });
      for (const botId of memberBotIds) copyIds.push(await this.copyBotIntoRoom(roomId, botId));
    } catch (error) {
      for (const copyId of copyIds) await this.#agents.deleteBot(copyId);
      // The manager is removed before its membership row, or it would show up as a general bot.
      if (managerCreated) await this.#agents.deleteBot(managerId);
      await rm(join(this.#store.roomsRoot, roomId), { recursive: true, force: true });
      this.#connection().prepare("DELETE FROM room_members WHERE room_id = ?").run(roomId);
      this.#connection().prepare("DELETE FROM rooms WHERE room_id = ?").run(roomId);
      throw error;
    }
    this.#changed();
    return this.#requireRoom(roomId);
  }

  // Hires a profile-only copy of a general bot. The original bot is never changed.
  // Room copies count toward the app-wide limit of 100 agents, so a hire can fail with that limit's error.
  async copyBotIntoRoom(roomId: string, sourceBotId: string): Promise<string> {
    const source = this.#assertCanHire(roomId, sourceBotId);
    const name = roomCopyName(
      source.name,
      this.#requireRoom(roomId).members.map((member) => member.name),
      INPUT_LIMITS.agentName,
    );
    const copyId = `bot-${randomUUID()}`;
    // Count and insert run in one statement, so the active-bot limit holds even if two hires race.
    const result = this.#connection()
      .prepare(
        `INSERT INTO room_members (room_id, bot_id, role, status, added_at, dismissed_at)
         SELECT ?, ?, 'member', 'active', ?, NULL
         WHERE EXISTS (SELECT 1 FROM rooms WHERE room_id = ? AND status = 'active')
           AND (SELECT COUNT(*) FROM room_members WHERE room_id = ? AND role = 'member' AND status = 'active') < ?`,
      )
      .run(roomId, copyId, new Date().toISOString(), roomId, roomId, ROOM_ACTIVE_BOT_LIMIT);
    if (Number(result.changes) === 0) throw hireLimitError();
    try {
      await this.#agents.copyBotProfileIntoRoom(sourceBotId, copyId, name);
    } catch (error) {
      this.#connection().prepare("DELETE FROM room_members WHERE bot_id = ?").run(copyId);
      throw error;
    }
    this.#agents.publishBotsChanged();
    this.#changed();
    return copyId;
  }

  archiveRoom(roomId: string): Room {
    this.#requireRoom(roomId);
    const now = new Date().toISOString();
    this.#connection()
      .prepare("UPDATE rooms SET status = 'archived', archived_at = ?, updated_at = ? WHERE room_id = ?")
      .run(now, now, roomId);
    this.#changed();
    return this.#requireRoom(roomId);
  }

  reopenRoom(roomId: string): Room {
    this.#requireRoom(roomId);
    this.#connection()
      .prepare("UPDATE rooms SET status = 'active', archived_at = NULL, updated_at = ? WHERE room_id = ?")
      .run(new Date().toISOString(), roomId);
    this.#changed();
    return this.#requireRoom(roomId);
  }

  // Dismissal stops the copy and keeps its history. The row stays in room_members, so the copy stays out of general listings.
  async dismissMember(roomId: string, botId: string): Promise<Room> {
    this.#requireRoom(roomId);
    const member = this.#memberRow(roomId, botId);
    if (member.role === "manager") throw new Error("The room manager can't be dismissed.");
    if (member.status === "dismissed") return this.#requireRoom(roomId);
    await this.#agents.stopBot(botId);
    this.#connection()
      .prepare(
        "UPDATE room_members SET status = 'dismissed', dismissed_at = ? WHERE room_id = ? AND bot_id = ? AND status = 'active'",
      )
      .run(new Date().toISOString(), roomId, botId);
    this.#changed();
    return this.#requireRoom(roomId);
  }

  createRequest(input: CreateRoomRequestInput): RoomRequest {
    const room = this.#requireRoom(input.roomId);
    if (room.status !== "active") throw new Error("Requests can only be made in an active room.");
    const member = this.#memberRow(input.roomId, input.requestedByBotId);
    if (member.role !== "manager" || member.status !== "active") {
      throw new Error("Only the room manager can request bots.");
    }
    const reason = input.reason.trim();
    if (!reason) throw new Error("A request needs a reason.");
    const payload = this.#requestPayload(input);
    const key = requestKey(input.kind, payload.targetBotId, payload.profile);
    if (
      room.requests.some(
        (request) =>
          request.status === "pending" && requestKey(request.kind, request.targetBotId, request.profile) === key,
      )
    ) {
      throw new Error("A matching request is already pending.");
    }
    const requestId = `request-${randomUUID()}`;
    this.#connection()
      .prepare(
        `INSERT INTO room_requests (request_id, room_id, requested_by_bot_id, kind, status, payload_json, created_bot_id, created_at, resolved_at)
         VALUES (?, ?, ?, ?, 'pending', ?, NULL, ?, NULL)`,
      )
      .run(
        requestId,
        input.roomId,
        input.requestedByBotId,
        input.kind,
        JSON.stringify({ targetBotId: payload.targetBotId, profile: payload.profile, reason }),
        new Date().toISOString(),
      );
    this.#changed();
    return this.#requireRequest(requestId);
  }

  // Approval hires the copy or dismisses the member, then marks the request fulfilled. If that fails, the request stays pending.
  // A new bot is created by the user in the general list. Approving that kind records the created bot as targetBotId.
  async resolveRequest(requestId: string, decision: "approve" | "reject", targetBotId?: string): Promise<Room> {
    const request = this.#requireRequest(requestId);
    if (request.status !== "pending") throw new Error("That request was already resolved.");
    const now = new Date().toISOString();
    let createdBotId: string | null = null;
    if (decision === "reject") {
      this.#connection()
        .prepare("UPDATE room_requests SET status = 'rejected', resolved_at = ? WHERE request_id = ?")
        .run(now, requestId);
    } else {
      createdBotId = await this.#fulfillRequest(request, targetBotId);
      this.#connection()
        .prepare(
          "UPDATE room_requests SET status = 'fulfilled', created_bot_id = ?, resolved_at = ? WHERE request_id = ?",
        )
        .run(createdBotId, now, requestId);
    }
    this.#changed();
    await this.#noticeManager(request, decision, createdBotId);
    return this.#requireRoom(request.roomId);
  }

  // Tells the room manager how the user answered its request, so it can carry on. Archived rooms get no notice.
  async #noticeManager(
    request: RoomRequest,
    decision: "approve" | "reject",
    createdBotId: string | null,
  ): Promise<void> {
    const room = this.#requireRoom(request.roomId);
    const manager = room.members.find((member) => member.role === "manager" && member.status === "active");
    if (room.status !== "active" || !manager) return;
    const subjectId = createdBotId ?? request.targetBotId;
    const subject = subjectId ? this.#store.list().find((bot) => bot.id === subjectId) : undefined;
    await this.#agents.deliverRoomRequestNotice({
      botId: manager.botId,
      notice: { decision, requestKind: request.kind, name: subject?.name ?? request.profile?.name ?? "" },
      idempotencyKey: `room-request:${request.id}`,
    });
  }

  // Permanent deletion is allowed only after archiving. It stops the members, waits for their turns to end, then removes
  // every room bot, its data, its browser data, and the shared folder. Originals are never touched.
  async deleteRoomForever(roomId: string): Promise<void> {
    const room = this.#requireRoom(roomId);
    if (room.status !== "archived") throw new Error("Archive the room before deleting it forever.");
    const knownBotIds = new Set(this.#store.list().map((bot) => bot.id));
    const memberBotIds = room.members.map((member) => member.botId).filter((botId) => knownBotIds.has(botId));
    for (const botId of memberBotIds) await this.#agents.stopBot(botId);
    if (!(await this.#agents.waitUntilIdle(memberBotIds, ROOM_IDLE_WAIT_MS))) {
      throw new Error("A room member is still working. Wait for it to finish, then delete the room forever again.");
    }
    for (const member of room.members) {
      if (knownBotIds.has(member.botId)) await this.#agents.deleteBot(member.botId);
      this.#connection().prepare("DELETE FROM room_members WHERE room_id = ? AND bot_id = ?").run(roomId, member.botId);
    }
    await this.#agents.clearRoomBrowserData(roomId);
    await rm(join(this.#store.roomsRoot, roomId), { recursive: true, force: true });
    this.#connection().prepare("DELETE FROM rooms WHERE room_id = ?").run(roomId);
    this.#changed();
  }

  #assertCanHire(roomId: string, sourceBotId: string): BotSummary {
    const room = this.#requireRoom(roomId);
    if (room.status !== "active") throw new Error("Bots can only be hired into an active room.");
    if (
      room.members.filter((member) => member.role === "member" && member.status === "active").length >=
      ROOM_ACTIVE_BOT_LIMIT
    ) {
      throw hireLimitError();
    }
    return this.#assertHireableBot(sourceBotId);
  }

  #assertHireableBot(botId: string): BotSummary {
    const bot = this.#store.list().find((candidate) => candidate.id === botId);
    if (!bot) throw new Error(`Unknown bot: ${botId}`);
    if (this.#database.roomMemberBotIds().has(botId)) throw new Error("That bot already belongs to a room.");
    return bot;
  }

  #connection(): DatabaseSync {
    return this.#database.connection;
  }

  #changed(): void {
    this.emit("changed");
  }

  #sharedFolder(roomId: string): string {
    return join(this.#store.roomsRoot, roomId, "shared");
  }

  #transaction(work: () => void): void {
    this.#connection().exec("BEGIN IMMEDIATE");
    try {
      work();
      this.#connection().exec("COMMIT");
    } catch (error) {
      if (this.#connection().isTransaction) this.#connection().exec("ROLLBACK");
      throw error;
    }
  }

  #memberRow(roomId: string, botId: string): { role: RoomMemberRole; status: RoomMemberStatus } {
    const row = databaseRows(
      this.#connection()
        .prepare("SELECT role, status FROM room_members WHERE room_id = ? AND bot_id = ?")
        .all(roomId, botId),
    )[0];
    if (!row) throw new Error("That bot is not a member of this room.");
    return {
      role: enumColumn(row, "role", MEMBER_ROLES),
      status: enumColumn(row, "status", MEMBER_STATUSES),
    };
  }

  // Tools for the active room manager. They only read the room or file a pending request for the user to decide.
  managerTool(botId: string, tool: string, args: unknown): RoomManagerToolResult {
    const membership = this.#database.roomMemberships().get(botId);
    if (membership?.role !== "manager" || !membership.memberActive || !membership.roomActive) {
      throw new Error("Only the active room manager can use room tools.");
    }
    const roomId = membership.roomId;
    const input = isDynamicRecord(args) ? args : {};
    if (tool === "room_members") {
      const members = this.#requireRoom(roomId).members.filter((member) => member.status === "active");
      return { members: members.map((member) => ({ botId: member.botId, name: member.name, role: member.role })) };
    }
    if (tool === "room_catalog") {
      const memberships = this.#database.roomMemberships();
      const agents = this.#store
        .list()
        .filter((bot) => !memberships.has(bot.id))
        .map((bot) => ({
          botId: bot.id,
          name: bot.name,
          title: bot.title,
          description: bot.description.slice(0, 240),
        }));
      return { agents };
    }
    if (tool === "list_rooms") {
      const bots = new Map(this.#store.list().map((bot) => [bot.id, bot]));
      const rooms = this.listRooms()
        .filter((room) => room.status === "active" && room.id !== roomId)
        .map((room) => {
          const active = room.members.filter((member) => member.status === "active");
          return {
            roomId: room.id,
            name: room.name,
            managerBotId: active.find((member) => member.role === "manager")?.botId ?? "",
            members: active
              .filter((member) => member.role !== "manager")
              .map((member) => ({
                name: member.name,
                title: bots.get(member.botId)?.title ?? "",
                description: (bots.get(member.botId)?.description ?? "").slice(0, 240),
              })),
          };
        });
      return { rooms };
    }
    if (tool === "request_hire" || tool === "request_dismiss") {
      const request = this.createRequest({
        roomId,
        requestedByBotId: botId,
        kind: tool === "request_hire" ? "hire" : "dismiss",
        targetBotId: textArg(input, "botId", INPUT_LIMITS.identifier, true),
        reason: textArg(input, "reason", REQUEST_REASON_MAX_LENGTH, true),
      });
      return { requestId: request.id, kind: request.kind, status: request.status };
    }
    if (tool === "request_new_bot") {
      const request = this.createRequest({
        roomId,
        requestedByBotId: botId,
        kind: "new_bot",
        profile: {
          name: textArg(input, "name", 80, true),
          title: textArg(input, "title", 120, false),
          description: textArg(input, "description", 2_000, false),
        },
        reason: textArg(input, "reason", REQUEST_REASON_MAX_LENGTH, true),
      });
      return { requestId: request.id, kind: request.kind, status: request.status };
    }
    throw new Error(`Unknown room tool: ${tool}`);
  }

  #requestPayload(input: CreateRoomRequestInput): { targetBotId: string | null; profile: RoomRequestProfile | null } {
    if (input.kind === "new_bot") {
      const name = input.profile.name.trim();
      if (!name) throw new Error("A new bot needs a name.");
      return {
        targetBotId: null,
        profile: {
          name,
          title: input.profile.title.trim(),
          description: input.profile.description.trim(),
        },
      };
    }
    if (input.kind === "hire") {
      this.#assertHireableBot(input.targetBotId);
      return { targetBotId: input.targetBotId, profile: null };
    }
    const member = this.#memberRow(input.roomId, input.targetBotId);
    if (member.role === "manager") throw new Error("The room manager can't be dismissed.");
    if (member.status !== "active") throw new Error("That room member is already dismissed.");
    return { targetBotId: input.targetBotId, profile: null };
  }

  async #fulfillRequest(request: RoomRequest, targetBotId?: string): Promise<string | null> {
    if (request.kind === "new_bot") {
      if (!targetBotId) throw new Error("Choose the bot created for this request.");
      this.#assertHireableBot(targetBotId);
      return targetBotId;
    }
    if (!request.targetBotId) throw new Error("Invalid room request target.");
    if (request.kind === "hire") return this.copyBotIntoRoom(request.roomId, request.targetBotId);
    await this.dismissMember(request.roomId, request.targetBotId);
    return null;
  }

  #requireRoom(roomId: string): Room {
    const row = databaseRows(this.#connection().prepare("SELECT * FROM rooms WHERE room_id = ?").all(roomId))[0];
    if (!row) throw new Error(`Unknown room: ${roomId}`);
    return this.#toRoom(row);
  }

  #requireRequest(requestId: string): RoomRequest {
    const row = databaseRows(
      this.#connection().prepare("SELECT * FROM room_requests WHERE request_id = ?").all(requestId),
    )[0];
    if (!row) throw new Error(`Unknown room request: ${requestId}`);
    return toRoomRequest(row);
  }

  #toRoom(row: DynamicRecord): Room {
    const roomId = requiredStringColumn(row, "room_id");
    const bots = this.#store.list();
    const members = databaseRows(
      this.#connection()
        .prepare(
          `SELECT bot_id, role, status, added_at, dismissed_at FROM room_members WHERE room_id = ?
           ORDER BY CASE role WHEN 'manager' THEN 0 ELSE 1 END, added_at, bot_id`,
        )
        .all(roomId),
    ).map((member): RoomMember => {
      const botId = requiredStringColumn(member, "bot_id");
      return {
        botId,
        name: bots.find((bot) => bot.id === botId)?.name ?? botId,
        role: enumColumn(member, "role", MEMBER_ROLES),
        status: enumColumn(member, "status", MEMBER_STATUSES),
        addedAt: requiredStringColumn(member, "added_at"),
        dismissedAt: optionalStringColumn(member, "dismissed_at"),
      };
    });
    const requests = databaseRows(
      this.#connection()
        .prepare("SELECT * FROM room_requests WHERE room_id = ? ORDER BY created_at, request_id")
        .all(roomId),
    ).map(toRoomRequest);
    return {
      id: roomId,
      name: requiredStringColumn(row, "name"),
      status: enumColumn(row, "status", ROOM_STATUSES),
      browserMode: enumColumn(row, "browser_mode", ROOM_BROWSER_MODES),
      createdAt: requiredStringColumn(row, "created_at"),
      updatedAt: requiredStringColumn(row, "updated_at"),
      archivedAt: optionalStringColumn(row, "archived_at"),
      members,
      requests,
    };
  }
}

function toRoomRequest(row: DynamicRecord): RoomRequest {
  const payload = JSON.parse(requiredStringColumn(row, "payload_json"));
  if (!isDynamicRecord(payload) || !isString(payload.reason)) throw new Error("Invalid room request payload.");
  return {
    id: requiredStringColumn(row, "request_id"),
    roomId: requiredStringColumn(row, "room_id"),
    requestedByBotId: requiredStringColumn(row, "requested_by_bot_id"),
    kind: enumColumn(row, "kind", REQUEST_KINDS),
    targetBotId: isString(payload.targetBotId) ? payload.targetBotId : null,
    profile: isDynamicRecord(payload.profile) ? parseProfile(payload.profile) : null,
    reason: payload.reason,
    status: enumColumn(row, "status", REQUEST_STATUSES),
    createdBotId: optionalStringColumn(row, "created_bot_id"),
    createdAt: requiredStringColumn(row, "created_at"),
    resolvedAt: optionalStringColumn(row, "resolved_at"),
  };
}

const MEMBER_ROLES = ["manager", "member"] as const;
const MEMBER_STATUSES = ["active", "dismissed"] as const;
const ROOM_STATUSES = ["active", "archived"] as const;
const ROOM_BROWSER_MODES = ["exclusive", "shared"] as const;
const REQUEST_STATUSES = ["pending", "rejected", "fulfilled"] as const;
const REQUEST_KINDS = ["hire", "dismiss", "new_bot"] as const;
const ROOM_IDLE_WAIT_MS = 15_000;

// Two pending requests with the same key are duplicates. A new bot is keyed by its name.
function requestKey(kind: RoomRequestKind, targetBotId: string | null, profile: RoomRequestProfile | null): string {
  return kind === "new_bot" ? `new_bot:${profile?.name.toLowerCase() ?? ""}` : `${kind}:${targetBotId ?? ""}`;
}

function parseProfile(value: DynamicRecord): RoomRequestProfile {
  if (!isString(value.name) || !isString(value.title) || !isString(value.description)) {
    throw new Error("Invalid room request payload.");
  }
  return { name: value.name, title: value.title, description: value.description };
}

function textArg(args: DynamicRecord, key: string, maxLength: number, required: boolean): string {
  const value = args[key];
  if (value === undefined && !required) return "";
  if (!isString(value) || value.trim().length > maxLength || (required && !value.trim())) {
    throw new Error(`${key} must be text up to ${maxLength} characters.`);
  }
  return value.trim();
}

function enumColumn<T extends string>(row: DynamicRecord, key: string, options: readonly T[]): T {
  const value = requiredStringColumn(row, key);
  if (isOneOf(options, value)) return value;
  throw new Error(`Invalid room ${key}: ${value}`);
}

function hireLimitError(): Error {
  return new Error(`A room can hold ${ROOM_ACTIVE_BOT_LIMIT} active bots.`);
}

// Used when the app's preferred provider is not connected. Claude, ChatGPT (codex), then Grok.
const ROOM_MANAGER_PROVIDER_ORDER: readonly AgentProviderId[] = ["claude", "codex", "grok"];
// Same defaults as createBot. A provider without one of these uses its first listed model.
const ROOM_MANAGER_DEFAULT_MODEL: Partial<Record<AgentProviderId, AgentModelId>> = {
  codex: "gpt-5.6-luna",
  claude: "claude-haiku-5-5",
};

// The manager runs on the app's preferred provider when it is connected, otherwise on the first connected one in order.
// Returns null when no provider is connected, so the manager keeps the store default.
export function roomManagerRuntime(input: {
  preferredProvider: AgentProviderId;
  availableProviders: readonly AgentProviderId[];
  models: readonly AgentModelOption[];
}): { provider: AgentProviderId; model: AgentModelId; reasoningEffort: AgentReasoningEffort } | null {
  const available = new Set(input.availableProviders);
  const provider = available.has(input.preferredProvider)
    ? input.preferredProvider
    : ROOM_MANAGER_PROVIDER_ORDER.find((candidate) => available.has(candidate));
  if (!provider) return null;
  const option =
    input.models.find((model) => model.provider === provider && model.id === ROOM_MANAGER_DEFAULT_MODEL[provider]) ??
    input.models.find((model) => model.provider === provider);
  if (!option) return null;
  return { provider, model: option.id, reasoningEffort: option.defaultReasoningEffort };
}

// A hired copy keeps the source name; only a clash with a name already in the room gets " 2", " 3", and so on.
export function roomCopyName(sourceName: string, roomMemberNames: readonly string[], maxLength: number): string {
  const taken = new Set(roomMemberNames.map((name) => name.trim().toLocaleLowerCase()));
  let index = 1;
  let candidate = sourceName;
  while (taken.has(candidate.toLocaleLowerCase())) {
    index += 1;
    const suffix = ` ${index}`;
    candidate = `${sourceName.slice(0, Math.max(1, maxLength - suffix.length)).trimEnd()}${suffix}`;
  }
  return candidate;
}

function roomName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("A room needs a name.");
  if (trimmed.length > ROOM_NAME_MAX_LENGTH) {
    throw new Error(`A room name can't be longer than ${ROOM_NAME_MAX_LENGTH} characters.`);
  }
  return trimmed;
}
