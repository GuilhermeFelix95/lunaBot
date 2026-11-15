import type { Room, RoomBackstageMessage, RoomMember, RoomsDesktopApi } from "@lunabot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { RoomBackstage } from "./RoomBackstage";
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

const reviewer: RoomMember = {
  botId: "reviewer",
  name: "Reviewer",
  role: "member",
  status: "active",
  addedAt: timestamp,
  dismissedAt: null,
};

const room: Room = {
  id: "room-1",
  name: "Launch plan",
  status: "active",
  browserMode: "exclusive",
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: null,
  members: [manager, writer, reviewer],
  requests: [],
};

// The reviewer's message is newer, so the reviewer's conversation is listed first and opens by default.
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
    recipientBotIds: ["reviewer"],
    text: "Reviewer note",
    attachmentNames: [],
    createdAt: "2026-01-01T01:00:00.000Z",
  },
];

function createApi(): RoomsDesktopApi {
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
    backstage: async () => messages,
    botProfiles: async () => [],
    onChanged: () => () => {},
    onBackstageChanged: () => () => {},
  };
}

async function loadedStore(): Promise<RoomsStore> {
  const store = createRoomsStore(createApi());
  store.start();
  await waitFor(() => {
    flush();
    expect(store.loaded()).toBe(true);
  });
  await store.refreshBackstage("room-1");
  flush();
  return store;
}

afterEach(() => cleanup());

describe("RoomBackstage keyboard selection", () => {
  it("moves through the conversation list with arrow keys and opens one with Enter", async () => {
    const store = await loadedStore();
    render(() => <RoomBackstage store={store} room={() => room} />);

    const reviewerOption = await screen.findByRole("option", { name: /Reviewer/ });
    const writerOption = screen.getByRole("option", { name: /Writer/ });
    expect(reviewerOption).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(reviewerOption, { key: "ArrowDown" });
    expect(writerOption).toHaveFocus();

    fireEvent.keyDown(writerOption, { key: "Enter" });

    await waitFor(() => {
      flush();
      expect(screen.getByRole("option", { name: /Writer/ })).toHaveAttribute("aria-selected", "true");
    });
    const log = screen.getByRole("log");
    expect(await within(log).findByText("Draft for the writer")).toBeInTheDocument();
    expect(within(log).queryByText("Reviewer note")).not.toBeInTheDocument();
  });
});
