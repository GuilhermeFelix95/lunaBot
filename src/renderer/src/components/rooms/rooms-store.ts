import type { BotSummary, Room, RoomBackstageMessage, RoomsDesktopApi } from "@lunabot/contracts/ipc";
import { createSignal } from "solid-js";
import { z } from "zod";
import type { TranslationKey } from "../../i18n";
import { hasRoomActivity } from "./room-model";

export const ROOM_SECTIONS_COLLAPSED_STORAGE_KEY = "lunabot:room-sections-collapsed:v1";
export const ROOM_BACKSTAGE_SEEN_STORAGE_KEY = "lunabot:room-backstage-seen:v1";
export const ROOM_CONVERSATION_SEEN_STORAGE_KEY = "lunabot:room-conversation-seen:v1";

export type RoomTab = "conversation" | "backstage";

type CollapsedStorage = Pick<Storage, "getItem" | "setItem">;

const collapsedSchema = z.array(z.string().trim().min(1).nullable().catch(null)).catch([]);
const seenSchema = z.record(z.string(), z.string()).catch({});
const conversationSeenSchema = z.record(z.string(), z.record(z.string(), z.string())).catch({});

export function readRoomSectionsCollapsed(storage: CollapsedStorage = window.localStorage): string[] {
  try {
    const parsed = collapsedSchema.safeParse(JSON.parse(storage.getItem(ROOM_SECTIONS_COLLAPSED_STORAGE_KEY) ?? "[]"));
    if (!parsed.success) return [];
    return [...new Set(parsed.data.flatMap((value) => (value ? [value] : [])))];
  } catch {
    return [];
  }
}

export function writeRoomSectionsCollapsed(collapsed: string[], storage: CollapsedStorage = window.localStorage): void {
  try {
    storage.setItem(ROOM_SECTIONS_COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed));
  } catch {
    // A private display preference must not block room navigation.
  }
}

// Last visit to each room's backstage, as an ISO time. Stored per room so activity marks survive a reload.
export function readRoomBackstageSeen(storage: CollapsedStorage = window.localStorage): Record<string, string> {
  try {
    const parsed = seenSchema.safeParse(JSON.parse(storage.getItem(ROOM_BACKSTAGE_SEEN_STORAGE_KEY) ?? "{}"));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function writeRoomBackstageSeen(
  seen: Record<string, string>,
  storage: CollapsedStorage = window.localStorage,
): void {
  try {
    storage.setItem(ROOM_BACKSTAGE_SEEN_STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // A private display preference must not block room navigation.
  }
}

// Last time each member's conversation was read, per room, as ISO times. Drives the unread flag of a conversation.
export function readRoomConversationSeen(
  storage: CollapsedStorage = window.localStorage,
): Record<string, Record<string, string>> {
  try {
    const parsed = conversationSeenSchema.safeParse(
      JSON.parse(storage.getItem(ROOM_CONVERSATION_SEEN_STORAGE_KEY) ?? "{}"),
    );
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function writeRoomConversationSeen(
  seen: Record<string, Record<string, string>>,
  storage: CollapsedStorage = window.localStorage,
): void {
  try {
    storage.setItem(ROOM_CONVERSATION_SEEN_STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // A private display preference must not block room navigation.
  }
}

export interface RoomsStore {
  rooms: () => Room[];
  loaded: () => boolean;
  /** Translation key of the last failed action, or null. */
  error: () => TranslationKey | null;
  selectedRoomId: () => string | null;
  collapsedIds: () => string[];
  tab: () => RoomTab;
  memberFilter: () => string | null;
  selectRoom: (roomId: string | null) => void;
  /** Opens a room on a tab, optionally showing only one member's backstage messages. */
  openRoom: (roomId: string, options?: { tab?: RoomTab; memberBotId?: string | null }) => void;
  setTab: (tab: RoomTab) => void;
  setMemberFilter: (botId: string | null) => void;
  toggleCollapsed: (id: string) => void;
  backstage: (roomId: string) => RoomBackstageMessage[];
  refreshBackstage: (roomId: string) => Promise<void>;
  /** Bot profiles of the room's manager and active members. General listings never include them. */
  profiles: (roomId: string) => BotSummary[];
  refreshProfiles: (roomId: string) => Promise<void>;
  /** True when a request waits or backstage has messages newer than the last visit. */
  hasActivity: (roomId: string) => boolean;
  markBackstageSeen: (roomId: string) => void;
  /** Last-read time of each member's conversation in the room, keyed by member bot id. */
  conversationSeen: (roomId: string) => Record<string, string>;
  markConversationSeen: (roomId: string, botId: string) => void;
  archive: (roomId: string) => Promise<Room | null>;
  reopen: (roomId: string) => Promise<Room | null>;
  deleteForever: (roomId: string) => Promise<boolean>;
  dismissMember: (roomId: string, botId: string) => Promise<Room | null>;
  resolveRequest: (requestId: string, decision: "approve" | "reject", targetBotId?: string) => Promise<Room | null>;
  /** Subscribes to room and backstage events and loads the list. Returns the dispose function. */
  start: () => () => void;
}

export function createRoomsStore(
  api: RoomsDesktopApi = window.lunabot.rooms,
  storage: CollapsedStorage = window.localStorage,
): RoomsStore {
  const [rooms, setRooms] = createSignal<Room[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal<TranslationKey | null>(null);
  const [selectedRoomId, setSelectedRoomId] = createSignal<string | null>(null);
  const [collapsedIds, setCollapsedIds] = createSignal<string[]>(readRoomSectionsCollapsed(storage));
  const [backstageByRoom, setBackstageByRoom] = createSignal<Record<string, RoomBackstageMessage[]>>({});
  const [profilesByRoom, setProfilesByRoom] = createSignal<Record<string, BotSummary[]>>({});
  const [seenByRoom, setSeenByRoom] = createSignal<Record<string, string>>(readRoomBackstageSeen(storage));
  const [conversationSeenByRoom, setConversationSeenByRoom] = createSignal(readRoomConversationSeen(storage));
  const [tab, setTab] = createSignal<RoomTab>("conversation");
  const [memberFilter, setMemberFilter] = createSignal<string | null>(null);

  function replaceRoom(room: Room) {
    setRooms((current) =>
      current.some((item) => item.id === room.id)
        ? current.map((item) => (item.id === room.id ? room : item))
        : [...current, room],
    );
  }

  function applyList(list: Room[]) {
    setRooms(list);
    const selected = selectedRoomId();
    if (selected && !list.some((room) => room.id === selected)) setSelectedRoomId(null);
    // Backstage is loaded for every room, so activity marks show without opening the room.
    for (const room of list) {
      if (!(room.id in backstageByRoom())) void refreshBackstage(room.id);
    }
    const current = selectedRoomId();
    if (current) void refreshProfiles(current);
  }

  async function run<T>(failure: TranslationKey, action: () => Promise<T>): Promise<T | null> {
    setError(null);
    try {
      return await action();
    } catch {
      setError(failure);
      return null;
    }
  }

  async function refreshBackstage(roomId: string) {
    try {
      const messages = await api.backstage(roomId);
      setBackstageByRoom((current) => ({ ...current, [roomId]: messages }));
    } catch {
      setError("rooms.error.backstageFailed");
    }
  }

  async function refreshProfiles(roomId: string) {
    try {
      const bots = await api.botProfiles(roomId);
      setProfilesByRoom((current) => ({ ...current, [roomId]: bots }));
    } catch {
      setError("rooms.error.profilesFailed");
    }
  }

  function markBackstageSeen(roomId: string) {
    setSeenByRoom((current) => {
      const next = { ...current, [roomId]: new Date().toISOString() };
      writeRoomBackstageSeen(next, storage);
      return next;
    });
  }

  function markConversationSeen(roomId: string, botId: string) {
    setConversationSeenByRoom((current) => {
      const next = { ...current, [roomId]: { ...current[roomId], [botId]: new Date().toISOString() } };
      writeRoomConversationSeen(next, storage);
      return next;
    });
  }

  // Opening the backstage tab counts as seeing its messages.
  function showTab(next: RoomTab, roomId: string | null = selectedRoomId()) {
    setTab(next);
    if (next === "backstage" && roomId) markBackstageSeen(roomId);
  }

  return {
    rooms,
    loaded,
    error,
    selectedRoomId,
    collapsedIds,
    tab,
    memberFilter,
    selectRoom(roomId) {
      setSelectedRoomId(roomId);
      if (roomId) void refreshProfiles(roomId);
    },
    openRoom(roomId, options) {
      setSelectedRoomId(roomId);
      setMemberFilter(options?.memberBotId ?? null);
      showTab(options?.tab ?? "conversation", roomId);
      void refreshProfiles(roomId);
    },
    setTab: showTab,
    setMemberFilter,
    toggleCollapsed(id) {
      setCollapsedIds((current) => {
        const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
        writeRoomSectionsCollapsed(next, storage);
        return next;
      });
    },
    backstage: (roomId) => backstageByRoom()[roomId] ?? [],
    refreshBackstage,
    profiles: (roomId) => profilesByRoom()[roomId] ?? [],
    refreshProfiles,
    hasActivity(roomId) {
      const room = rooms().find((item) => item.id === roomId);
      if (!room) return false;
      return hasRoomActivity(room, backstageByRoom()[roomId] ?? [], seenByRoom()[roomId] ?? null);
    },
    markBackstageSeen,
    conversationSeen: (roomId) => conversationSeenByRoom()[roomId] ?? {},
    markConversationSeen,
    async archive(roomId) {
      const room = await run("rooms.error.archiveFailed", () => api.archive(roomId));
      if (room) replaceRoom(room);
      return room;
    },
    async reopen(roomId) {
      const room = await run("rooms.error.reopenFailed", () => api.reopen(roomId));
      if (room) replaceRoom(room);
      return room;
    },
    async deleteForever(roomId) {
      const deleted = await run("rooms.error.deleteFailed", () => api.deleteForever(roomId).then(() => true));
      if (deleted) {
        setRooms((current) => current.filter((room) => room.id !== roomId));
        if (selectedRoomId() === roomId) setSelectedRoomId(null);
      }
      return deleted === true;
    },
    async dismissMember(roomId, botId) {
      const room = await run("rooms.error.dismissFailed", () => api.dismissMember({ roomId, botId }));
      if (room) replaceRoom(room);
      return room;
    },
    async resolveRequest(requestId, decision, targetBotId) {
      const input = targetBotId === undefined ? { requestId, decision } : { requestId, decision, targetBotId };
      const room = await run("rooms.error.resolveFailed", () => api.resolveRequest(input));
      if (room) replaceRoom(room);
      return room;
    },
    start() {
      const offChanged = api.onChanged(applyList);
      const offBackstage = api.onBackstageChanged((roomId) => {
        void refreshBackstage(roomId).then(() => {
          if (selectedRoomId() === roomId && tab() === "backstage") markBackstageSeen(roomId);
        });
      });
      void (async () => {
        try {
          applyList(await api.list());
        } catch {
          setError("rooms.error.loadFailed");
        } finally {
          setLoaded(true);
        }
      })();
      return () => {
        offChanged();
        offBackstage();
      };
    },
  };
}
