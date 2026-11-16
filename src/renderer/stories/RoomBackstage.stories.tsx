import type { Room, RoomBackstageMessage, RoomMember, RoomsDesktopApi } from "@lunabot/contracts/ipc";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { RoomBackstage } from "../src/components/rooms/RoomBackstage";
import { createRoomsStore } from "../src/components/rooms/rooms-store";

const timestamp = "2026-01-01T09:00:00.000Z";

const manager: RoomMember = {
  botId: "manager",
  name: "Room manager",
  title: "",
  role: "manager",
  status: "active",
  addedAt: timestamp,
  dismissedAt: null,
};

const writer: RoomMember = {
  botId: "writer",
  name: "Writer",
  title: "",
  role: "member",
  status: "active",
  addedAt: timestamp,
  dismissedAt: null,
};

const reviewer: RoomMember = {
  botId: "reviewer",
  name: "Reviewer",
  title: "",
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

const conversationMessages: RoomBackstageMessage[] = [
  {
    id: "m1",
    authorBotId: "manager",
    authorName: "Room manager",
    recipientBotIds: ["writer"],
    text: "Please draft the launch announcement. Keep it under **150 words**.",
    attachmentNames: ["brief.md"],
    createdAt: "2026-01-01T09:00:00.000Z",
  },
  {
    id: "m2",
    authorBotId: "writer",
    authorName: "Writer",
    recipientBotIds: ["manager"],
    text: "Draft ready. I kept the pricing line as it was in the brief.",
    attachmentNames: [],
    createdAt: "2026-01-01T09:04:00.000Z",
  },
  {
    id: "m3",
    authorBotId: "manager",
    authorName: "Room manager",
    recipientBotIds: ["reviewer"],
    text: "Reviewer, check the draft against the brief before we publish.",
    attachmentNames: [],
    createdAt: "2026-01-01T09:10:00.000Z",
  },
];

const longText = Array.from(
  { length: 24 },
  (_, index) => `Checklist item ${index + 1}: confirm the launch copy matches the approved brief before Friday.`,
).join("\n\n");

const longMessages: RoomBackstageMessage[] = [
  {
    id: "long-1",
    authorBotId: "manager",
    authorName: "Room manager",
    recipientBotIds: ["writer"],
    text: longText,
    attachmentNames: [],
    createdAt: "2026-01-01T09:00:00.000Z",
  },
];

// Builds a store that serves the given messages, the same way the app's store does.
function storeWith(current: Room, messages: RoomBackstageMessage[]) {
  const unused = async (): Promise<never> => {
    throw new Error("not used in this story");
  };
  const api: RoomsDesktopApi = {
    list: async () => [current],
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
  const store = createRoomsStore(api);
  void store.refreshBackstage(current.id);
  return store;
}

function Backstage(props: { messages: RoomBackstageMessage[]; workingBotIds?: ReadonlySet<string> }) {
  const store = storeWith(room, props.messages);
  return <RoomBackstage store={store} room={() => room} workingBotIds={props.workingBotIds} />;
}

const meta = {
  title: "Rooms/Backstage",
  component: RoomBackstage,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof RoomBackstage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Conversations: Story = {
  render: () => <Backstage messages={conversationMessages} />,
};

export const Working: Story = {
  render: () => <Backstage messages={conversationMessages} workingBotIds={new Set(["writer"])} />,
};

export const LongMessage: Story = {
  render: () => <Backstage messages={longMessages} />,
};

export const NoMessages: Story = {
  render: () => <Backstage messages={[]} />,
};
