import type { Room, RoomsDesktopApi } from "@lunabot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
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

function createApi(list: Room[]): RoomsDesktopApi {
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
    botProfiles: async () => [],
    onChanged: () => () => {},
    onBackstageChanged: () => () => {},
  };
}

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
});
