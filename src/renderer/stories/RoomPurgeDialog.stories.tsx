import type { Room } from "@lunabot/contracts/ipc";
import { fn } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { RoomPurgeDialog } from "../src/components/rooms/RoomDialogs";

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

const meta = {
  title: "Rooms/Delete Room Forever",
  component: RoomPurgeDialog,
  args: {
    room: archivedRoom,
    typedName: "",
    busy: false,
    error: null,
    onTypedNameChange: fn(),
    onOpenChange: fn(),
    onConfirm: fn(),
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof RoomPurgeDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NameNotTyped: Story = {};

export const NameTyped: Story = {
  args: { typedName: "Launch plan" },
};

export const Busy: Story = {
  args: { typedName: "Launch plan", busy: true },
};

export const Failed: Story = {
  args: { typedName: "Launch plan", error: "rooms.error.archiveFailed" },
};
