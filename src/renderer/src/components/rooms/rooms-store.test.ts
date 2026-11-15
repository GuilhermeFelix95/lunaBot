import type { Room, RoomBackstageMessage, RoomsDesktopApi } from "@lunabot/contracts/ipc";
import { flush } from "solid-js";
import { describe, expect, it } from "vitest";
import {
  createRoomsStore,
  ROOM_SECTIONS_COLLAPSED_STORAGE_KEY,
  readRoomBackstageSeen,
  readRoomSectionsCollapsed,
  writeRoomBackstageSeen,
} from "./rooms-store";

const room: Room = {
  id: "room-1",
  name: "Launch plan",
  status: "active",
  browserMode: "exclusive",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  archivedAt: null,
  members: [],
  requests: [],
};

const message: RoomBackstageMessage = {
  id: "m1",
  authorBotId: "manager",
  authorName: "Manager",
  recipientBotIds: ["writer"],
  text: "Draft the post",
  attachmentNames: [],
  createdAt: "2026-01-01T00:00:00.000Z",
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeApi(overrides: Partial<RoomsDesktopApi> = {}) {
  const changed = new Set<(rooms: Room[]) => void>();
  const backstageChanged = new Set<(roomId: string) => void>();
  const unused = async (): Promise<never> => {
    throw new Error("not used in this test");
  };
  const api: RoomsDesktopApi = {
    list: async () => [],
    create: unused,
    archive: unused,
    reopen: unused,
    deleteForever: unused,
    dismissMember: unused,
    resolveRequest: unused,
    backstage: async () => [],
    botProfiles: async () => [],
    onChanged: (listener) => {
      changed.add(listener);
      return () => changed.delete(listener);
    },
    onBackstageChanged: (listener) => {
      backstageChanged.add(listener);
      return () => backstageChanged.delete(listener);
    },
    ...overrides,
  };
  return {
    api,
    emitChanged: (rooms: Room[]) => {
      changed.forEach((listener) => {
        listener(rooms);
      });
    },
    emitBackstage: (roomId: string) => {
      backstageChanged.forEach((listener) => {
        listener(roomId);
      });
    },
  };
}

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

describe("rooms store", () => {
  it("loads the rooms and follows the backend when the list changes", async () => {
    const { api, emitChanged } = fakeApi({ list: async () => [room] });
    const store = createRoomsStore(api, memoryStorage());
    const dispose = store.start();
    await settle();

    expect(store.loaded()).toBe(true);
    expect(store.rooms().map((item) => item.id)).toEqual(["room-1"]);

    emitChanged([]);
    flush();
    expect(store.rooms()).toEqual([]);
    dispose();
  });

  it("keeps the list and reports the failure when archiving is rejected", async () => {
    const { api } = fakeApi({
      list: async () => [room],
      archive: async () => {
        throw new Error("disk full");
      },
    });
    const store = createRoomsStore(api, memoryStorage());
    store.start();
    await settle();

    const result = await store.archive("room-1");

    expect(result).toBeNull();
    expect(store.error()).toBe("rooms.error.archiveFailed");
    expect(store.rooms().map((item) => item.id)).toEqual(["room-1"]);
  });

  it("clears the selection when the selected room is deleted", async () => {
    const { api } = fakeApi({ list: async () => [room], deleteForever: async () => undefined });
    const store = createRoomsStore(api, memoryStorage());
    store.start();
    await settle();
    store.selectRoom("room-1");
    flush();

    expect(await store.deleteForever("room-1")).toBe(true);
    expect(store.selectedRoomId()).toBeNull();
    expect(store.rooms()).toEqual([]);
  });

  it("clears the selection when a change event no longer lists the selected room", async () => {
    const { api, emitChanged } = fakeApi({ list: async () => [room] });
    const store = createRoomsStore(api, memoryStorage());
    store.start();
    await settle();
    store.selectRoom("room-1");
    flush();

    emitChanged([]);
    flush();

    expect(store.selectedRoomId()).toBeNull();
  });

  it("refreshes backstage messages live when a room's backstage changes", async () => {
    const requested: string[] = [];
    let messages: RoomBackstageMessage[] = [message];
    const { api, emitBackstage } = fakeApi({
      list: async () => [room],
      backstage: async (roomId) => {
        requested.push(roomId);
        return messages;
      },
    });
    const store = createRoomsStore(api, memoryStorage());
    store.start();
    await settle();
    await store.refreshBackstage("room-1");
    expect(store.backstage("room-1")).toEqual([message]);

    messages = [message, { ...message, id: "m2", text: "Approved" }];
    emitBackstage("room-1");
    emitBackstage("room-2");
    await settle();

    expect(store.backstage("room-1")).toHaveLength(2);
    expect(requested).toContain("room-2");
  });

  it("keeps collapse state across reloads and never throws when storage is unavailable", () => {
    const storage = memoryStorage();
    createRoomsStore(fakeApi().api, storage).toggleCollapsed("room-1");
    expect(readRoomSectionsCollapsed(storage)).toEqual(["room-1"]);

    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const store = createRoomsStore(fakeApi().api, broken);
    expect(() => store.toggleCollapsed("room-2")).not.toThrow();
    flush();
    expect(store.collapsedIds()).toEqual(["room-2"]);
    expect(readRoomSectionsCollapsed(broken)).toEqual([]);
  });

  it("ignores a stored collapse value that is not a list", () => {
    const storage = memoryStorage();
    storage.setItem(ROOM_SECTIONS_COLLAPSED_STORAGE_KEY, '{"room":1}');
    expect(readRoomSectionsCollapsed(storage)).toEqual([]);
  });

  it("marks a room active for new backstage messages until its backstage is opened", async () => {
    const storage = memoryStorage();
    const { api } = fakeApi({ list: async () => [room], backstage: async () => [message] });
    const store = createRoomsStore(api, storage);
    store.start();
    await settle();

    expect(store.hasActivity("room-1")).toBe(true);

    store.openRoom("room-1", { tab: "backstage" });
    flush();

    expect(store.hasActivity("room-1")).toBe(false);
    expect(readRoomBackstageSeen(storage)["room-1"]).toBeDefined();
  });

  it("keeps working when the seen marks cannot be read or written", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readRoomBackstageSeen(broken)).toEqual({});
    expect(() => writeRoomBackstageSeen({ "room-1": "2026-01-01T00:00:00.000Z" }, broken)).not.toThrow();
  });
});
