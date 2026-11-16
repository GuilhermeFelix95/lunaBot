import type { AgentEvent, Room, RoomMember, RoomsDesktopApi } from "@lunabot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagersRoomView } from "./ManagersRoomView";
import { createRoomsStore } from "./rooms-store";

const timestamp = "2026-01-01T00:00:00.000Z";

const manager = (botId: string, name: string): RoomMember => ({
  botId,
  name,
  title: "",
  role: "manager",
  status: "active",
  addedAt: timestamp,
  dismissedAt: null,
});

const room = (id: string, name: string, member: RoomMember): Room => ({
  id,
  name,
  status: "active",
  browserMode: "exclusive",
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: null,
  members: [member],
  requests: [],
});

const rooms = [room("r1", "Alpha", manager("m1", "Ana")), room("r2", "Beta", manager("m2", "Beto"))];

function createApi(): RoomsDesktopApi {
  const unused = async (): Promise<never> => {
    throw new Error("not used in this test");
  };
  return {
    list: async () => rooms,
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

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "lunabot");
});

describe("ManagersRoomView", () => {
  it("shows what the user said and each manager's answer", async () => {
    let emit: (event: AgentEvent) => void = () => {};
    Object.defineProperty(window, "lunabot", {
      configurable: true,
      value: {
        agent: {
          onEvent: (listener: (event: AgentEvent) => void) => {
            emit = listener;
            return () => {};
          },
        },
      },
    });
    const store = createRoomsStore(createApi());
    store.start();
    await waitFor(() => {
      flush();
      expect(store.loaded()).toBe(true);
    });
    const onSend = vi.fn(async () => {});
    render(() => <ManagersRoomView store={store} onSend={onSend} />);

    const input = await screen.findByRole("textbox", { name: "Talk to all managers" });
    fireEvent.input(input, { target: { value: "hello team" } });
    flush();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      flush();
      expect(screen.getByText("hello team")).toBeInTheDocument();
    });
    expect(onSend).toHaveBeenCalledWith("hello team");
    expect(input).toHaveValue("");

    emit({
      type: "conversation",
      snapshot: {
        botId: "m1",
        threadId: "t1",
        activeTurnId: null,
        revision: 1,
        messages: [
          {
            id: "a1",
            author: "assistant",
            text: "Got it, Ana here",
            createdAt: new Date(Date.now() + 1000).toISOString(),
            status: "completed",
          },
        ],
      },
    });
    await waitFor(() => {
      flush();
      expect(screen.getByText("Got it, Ana here")).toBeInTheDocument();
    });
  });
});
