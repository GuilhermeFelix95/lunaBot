import type { BotSummary, Room, RoomsDesktopApi } from "@lunabot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { avatarProfile } from "../../avatar";
import { mascotAt } from "../../mascots";
import { RoomsSidebar } from "./RoomsSidebar";
import { createRoomsStore } from "./rooms-store";

const timestamp = "2026-01-01T00:00:00.000Z";

const archivedRoom: Room = {
  id: "room-1",
  name: "Launch plan",
  status: "archived",
  browserMode: "exclusive",
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: timestamp,
  members: [],
  requests: [],
};

function createApi(list: Room[], profiles: BotSummary[] = []): RoomsDesktopApi {
  const unused = async (): Promise<never> => {
    throw new Error("not used in this test");
  };
  return {
    list: async () => list,
    create: unused,
    archive: unused,
    reopen: unused,
    deleteForever: unused,
    dismissMember: unused,
    resolveRequest: unused,
    backstage: async () => [],
    botProfiles: async () => profiles,
    onChanged: () => () => {},
    onBackstageChanged: () => () => {},
  };
}

const managerProfile: BotSummary = {
  id: "bot-manager",
  provider: "claude",
  name: "Room manager",
  title: "",
  description: "Runs the room.",
  notifications: "all",
  model: "claude-haiku-5-5",
  reasoningEffort: "medium",
  threadId: null,
  workspacePath: "/mock/LunaBot/Bots/bot-manager",
  preview: "",
  updatedAt: null,
  avatarSeed: "the-chosen-avatar",
  avatarHue: 215,
  avatarUrl: null,
};

const activeRoom: Room = {
  ...archivedRoom,
  id: "room-2",
  name: "Videos",
  status: "active",
  archivedAt: null,
  members: [
    {
      botId: "bot-manager",
      name: "Room manager",
      role: "manager",
      status: "active",
      addedAt: timestamp,
      dismissedAt: null,
    },
  ],
};

afterEach(() => cleanup());

describe("RoomsSidebar", () => {
  it("keeps delete forever disabled until the typed name matches the archived room", async () => {
    const store = createRoomsStore(createApi([archivedRoom]));
    store.start();
    render(() => <RoomsSidebar store={store} />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete forever…" }));

    const confirm = await screen.findByRole("button", { name: "Delete forever" });
    expect(confirm).toBeDisabled();

    fireEvent.input(screen.getByRole("textbox"), { target: { value: "Launch" } });
    await waitFor(() => expect(confirm).toBeDisabled());

    fireEvent.input(screen.getByRole("textbox"), { target: { value: "Launch plan" } });
    await waitFor(() => expect(confirm).toBeEnabled());
  });

  it("draws a room bot with the avatar of its profile, the same one the conversation shows", async () => {
    const store = createRoomsStore(createApi([activeRoom], [managerProfile]));
    store.start();
    const view = render(() => <RoomsSidebar store={store} />);

    const expected = mascotAt(avatarProfile("the-chosen-avatar", 215).mascot).id;
    await waitFor(() =>
      expect(view.container.querySelector(".rooms-sidebar-member .avatar-svg")?.getAttribute("data-mascot")).toBe(
        expected,
      ),
    );
    expect(expected).not.toBe(mascotAt(avatarProfile("bot-manager", null).mascot).id);
  });
});
