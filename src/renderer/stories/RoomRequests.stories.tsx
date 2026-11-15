import type { RoomRequest } from "@lunabot/contracts/ipc";
import { fn } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { RoomRequestCard } from "../src/components/rooms/RoomRequestCard";

const timestamp = "2026-01-01T00:00:00.000Z";

const newBotRequest: RoomRequest = {
  id: "req-new-bot",
  roomId: "room-1",
  requestedByBotId: "manager",
  kind: "new_bot",
  targetBotId: null,
  profile: {
    name: "Copywriter",
    title: "Copy lead",
    description: "Writes launch copy for the campaign.",
  },
  reason: "The launch needs campaign copy.",
  status: "pending",
  createdBotId: null,
  createdAt: timestamp,
  resolvedAt: null,
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

const dismissRequest: RoomRequest = {
  id: "req-dismiss",
  roomId: "room-1",
  requestedByBotId: "manager",
  kind: "dismiss",
  targetBotId: "writer-bot",
  profile: null,
  reason: "The writing work is finished.",
  status: "pending",
  createdBotId: null,
  createdAt: timestamp,
  resolvedAt: null,
};

const meta = {
  title: "Rooms/Requests",
  component: RoomRequestCard,
  args: {
    request: newBotRequest,
    roomName: "Launch plan",
    targetName: "Reviewer",
    disabled: false,
    onCreateBot: fn(),
    onApprove: fn(),
    onReject: fn(),
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof RoomRequestCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NewBot: Story = {};

export const HireBot: Story = {
  args: { request: hireRequest },
};

export const DismissBot: Story = {
  args: { request: dismissRequest, targetName: "Writer" },
};

export const Busy: Story = {
  args: { disabled: true },
};
