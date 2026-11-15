import type { Room, RoomBackstageMessage, RoomMember, RoomRequest, RoomsDesktopApi } from "@lunabot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomView } from "./RoomView";
import { createRoomsStore, type RoomsStore } from "./rooms-store";

const timestamp = "2026-01-01T00:00:00.000Z";

const manager: RoomMember = {
  botId: "manager",
  name: "Room manager",
  role: "manager",
  status: "active",
  addedAt: timestamp,
  dismissedAt: null,
};

const writer: RoomMember = {
  botId: "writer",
  name: "Writer",
  role: "member",
  status: "active",
  addedAt: timestamp,
  dismissedAt: null,
};

const hireRequest: RoomRequest = {
  id: "req-hire",
  roomId: "room-1",
  requestedByBotId: "manager",
  kind: "hire",
  targetBotId: "reviewer-bot",
  profile: null,
  reason: "The launch needs a reviewer.",
  status: "pending",
  createdBotId: null,
  createdAt: timestamp,
  resolvedAt: null,
};

const room: Room = {
  id: "room-1",
  name: "Launch plan",
  status: "active",
  browserMode: "exclusive",
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: null,
  members: [manager, writer],
  requests: [hireRequest],
};

function createApi(overrides: Partial<RoomsDesktopApi> = {}): RoomsDesktopApi {
  const unused = async (): Promise<never> => {
    throw new Error("not used in this test");
  };
  return {
    list: async () => [room],
    create: unused,
    archive: unused,
    reopen: unused,
    deleteForever: unused,
    dismissMember: unused,
    resolveRequest: unused,
    backstage: async () => [],
    botProfiles: async () => [],
    onChanged: () => () => {},
    onBackstageChanged: () => () => {},
    ...overrides,
  };
}

async function loadedStore(api: RoomsDesktopApi): Promise<RoomsStore> {
  const store = createRoomsStore(api);
  store.start();
  await waitFor(() => {
    flush();
    expect(store.loaded()).toBe(true);
  });
  store.openRoom("room-1");
  flush();
  return store;
}

function renderRoomView(store: RoomsStore, roomId = "room-1") {
  return render(() => (
    <RoomView
      store={store}
      roomId={roomId}
      nameOfBot={(botId) => (botId === "reviewer-bot" ? "Reviewer" : undefined)}
      creatingRequestId={null}
      onCreateBotForRequest={() => {}}
      renderConversation={() => <p>Conversation with the manager</p>}
    />
  ));
}

afterEach(() => cleanup());

describe("RoomView", () => {
  it("sends an approval when the user hires the bot the manager asked for", async () => {
    const resolveRequest = vi.fn(async () => room);
    const store = await loadedStore(createApi({ resolveRequest }));
    renderRoomView(store);

    fireEvent.click(screen.getByRole("button", { name: "Hire" }));

    await waitFor(() => expect(resolveRequest).toHaveBeenCalledWith({ requestId: "req-hire", decision: "approve" }));
  });

  it("shows only one member's backstage messages when that member's filter is pressed", async () => {
    const messages: RoomBackstageMessage[] = [
      {
        id: "m1",
        authorBotId: "manager",
        authorName: "Room manager",
        recipientBotIds: ["writer"],
        text: "Draft for the writer",
        attachmentNames: [],
        createdAt: timestamp,
      },
      {
        id: "m2",
        authorBotId: "manager",
        authorName: "Room manager",
        recipientBotIds: ["unrelated-bot"],
        text: "Note for someone else",
        attachmentNames: [],
        createdAt: timestamp,
      },
    ];
    const store = await loadedStore(createApi({ backstage: async () => messages }));
    renderRoomView(store);
    store.setTab("backstage");
    flush();

    const filter = await screen.findByRole("button", { name: "Show only Writer" });
    expect(await screen.findByText("Note for someone else")).toBeInTheDocument();

    fireEvent.click(filter);

    await waitFor(() => {
      flush();
      expect(filter).toHaveAttribute("aria-pressed", "true");
    });
    await waitFor(() => {
      flush();
      expect(screen.queryByText("Note for someone else")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Draft for the writer")).toBeInTheDocument();
  });

  it("says the room is missing when it is not in the list", async () => {
    const store = await loadedStore(createApi());
    renderRoomView(store, "room-unknown");

    expect(screen.getByRole("status")).toHaveTextContent("This room is no longer available.");
  });
});
