import { fn } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { RoomArchiveDialog } from "../src/components/rooms/RoomDialogs";

const meta = {
  title: "Rooms/Archive Room",
  component: RoomArchiveDialog,
  args: {
    open: true,
    roomName: "Launch plan",
    busy: false,
    error: null,
    onOpenChange: fn(),
    onConfirm: fn(),
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof RoomArchiveDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Archive: Story = {};

export const ArchiveFailed: Story = {
  args: { error: "rooms.error.archiveFailed" },
};

export const ArchiveBusy: Story = {
  args: { busy: true },
};
