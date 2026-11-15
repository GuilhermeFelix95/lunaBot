import type { BotSummary, CreateRoomInput, Room } from "@lunabot/contracts/ipc";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockLunaBot, type MockLunaBotControls } from "../../preview/mock-lunabot";
import { CreateRoomDialog } from "./CreateRoomDialog";

const planningBot: BotSummary = {
  id: "bot-planning",
  provider: "codex",
  name: "Planning Bot",
  title: "Planner",
  description: "Builds clear plans.",
  notifications: "all",
  model: "gpt-5.6-luna",
  reasoningEffort: "medium",
  threadId: null,
  workspacePath: "/mock/LunaBot/Bots/bot-planning",
  preview: "No messages yet",
  updatedAt: null,
  avatarSeed: "bot-planning",
  avatarHue: null,
  avatarUrl: null,
};

const createdRoom: Room = {
  id: "room-1",
  name: "Launch plan",
  status: "active",
  browserMode: "shared",
  createdAt: "2026-11-15T10:00:00.000Z",
  updatedAt: "2026-11-15T10:00:00.000Z",
  archivedAt: null,
  members: [],
  requests: [],
};

let activeMock: MockLunaBotControls | undefined;
let create: ReturnType<typeof vi.fn<(input: CreateRoomInput) => Promise<Room>>>;

beforeEach(() => {
  activeMock = createMockLunaBot();
  create = vi.fn(async (input: CreateRoomInput) => ({ ...createdRoom, name: input.name }));
  activeMock.api.rooms.create = create;
  window.lunabot = activeMock.api;
});

afterEach(() => {
  activeMock?.dispose();
  activeMock = undefined;
});

describe("CreateRoomDialog", () => {
  it("creates a shared-browser room with the chosen bot and reports the new room", async () => {
    const onCreated = vi.fn();
    render(() => <CreateRoomDialog open bots={[planningBot]} onOpenChange={vi.fn()} onCreated={onCreated} />);

    expect(await screen.findByRole("dialog", { name: "Create room" })).toBeInTheDocument();
    fireEvent.input(screen.getByRole("textbox", { name: "Room name" }), { target: { value: "  Launch plan  " } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Planning Bot/ }));
    expect(await screen.findByText("1 of 8 selected")).toBeInTheDocument();
    const sharedBrowser = screen.getByRole("radio", { name: "Shared profile" });
    fireEvent.click(sharedBrowser);
    await waitFor(() => expect(sharedBrowser).toBeChecked());
    fireEvent.click(screen.getByRole("button", { name: "Create room" }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        name: "Launch plan",
        browserMode: "shared",
        memberBotIds: ["bot-planning"],
        manager: expect.objectContaining({ name: "Room manager", description: expect.any(String) }),
      }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "room-1" })));
  });

  it("asks for a name and does not call the backend when the name is blank", async () => {
    render(() => <CreateRoomDialog open bots={[]} onOpenChange={vi.fn()} onCreated={vi.fn()} />);

    fireEvent.input(await screen.findByRole("textbox", { name: "Room name" }), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Create room" }));

    expect(await screen.findByText("Give the room a name.")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("shows the backend error, keeps the form open, and does not report a room", async () => {
    create.mockRejectedValueOnce(new Error("A room needs a name."));
    const onCreated = vi.fn();
    render(() => <CreateRoomDialog open bots={[]} onOpenChange={vi.fn()} onCreated={onCreated} />);

    fireEvent.input(await screen.findByRole("textbox", { name: "Room name" }), { target: { value: "Launch" } });
    fireEvent.click(screen.getByRole("button", { name: "Create room" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A room needs a name.");
    expect(screen.getByRole("dialog", { name: "Create room" })).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
