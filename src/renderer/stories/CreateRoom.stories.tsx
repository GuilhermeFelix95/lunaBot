import { fn } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { CreateRoomDialog } from "../src/components/rooms/CreateRoomDialog";
import { STORY_BOTS } from "./fixtures";

const meta = {
  title: "Rooms/Create Room",
  component: CreateRoomDialog,
  args: {
    open: true,
    bots: STORY_BOTS,
    onOpenChange: fn(),
    onCreated: fn(),
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof CreateRoomDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithBots: Story = {};

export const NoBotsYet: Story = {
  args: { bots: [] },
};
