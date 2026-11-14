import { expect, fireEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { App } from "../src/App";
import { LunaBotPlayground } from "../src/preview/LunaBotPlayground";
import { STORY_AGENT_STATUS, STORY_BOT_SUMMARIES } from "./fixtures";

const meta = {
  title: "App",
  component: App,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: () => <LunaBotPlayground />,
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("navigation", { name: "Chat list" })).toBeInTheDocument();
    await expect(canvas.findByRole("heading", { name: "Agents" })).resolves.toBeInTheDocument();

    const editor = canvas.getByRole("textbox", { name: "Message Chief" });
    await userEvent.click(editor);
    editor.textContent = "Show me the next step";
    await fireEvent.input(editor);
    await expect(editor).toHaveTextContent("Show me the next step");
    await userEvent.click(canvas.getByRole("button", { name: "Send message" }));
    await expect(
      canvas.findByText("Show me the next step", undefined, { timeout: 3_000 }),
    ).resolves.toBeInTheDocument();

    await expect(
      canvas.findByText(/Mock reply from Chief: I received/, undefined, { timeout: 3_000 }),
    ).resolves.toBeInTheDocument();
  },
};

export const SettingsTyping: Story = {
  render: () => <LunaBotPlayground />,
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("heading", { name: "Chief" });
    await userEvent.click(canvas.getByRole("button", { name: "View agent settings" }));

    const name = canvas.getByRole("textbox", { name: "Agent name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Rapid name editing");
    await expect(name).toHaveValue("Rapid name editing");
    await expect(name).toHaveFocus();
    const title = canvas.getByRole("textbox", { name: "Agent title" });
    await userEvent.clear(title);
    await userEvent.type(title, "Every character remains");
    const description = canvas.getByRole("textbox", { name: "Agent description" });
    await userEvent.clear(description);
    await userEvent.type(description, "Drafts survive reactive profile updates.");

    await expect(canvas.getByRole("textbox", { name: "Agent name" })).toHaveValue("Rapid name editing");
    await expect(canvas.getByRole("textbox", { name: "Agent title" })).toHaveValue("Every character remains");
    await expect(canvas.getByRole("textbox", { name: "Agent description" })).toHaveValue(
      "Drafts survive reactive profile updates.",
    );
  },
};

export const CommandSearch: Story = {
  render: () => <LunaBotPlayground />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("heading", { name: "Chief" });
    await fireEvent.keyDown(window, { key: "k", metaKey: true });
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Search Luna Bot" });
    const input = page.getByRole("combobox", { name: "Search Luna Bot" });
    await expect(dialog).toBeVisible();
    await expect(input).toHaveFocus();

    await userEvent.click(page.getByRole("tab", { name: "Messages" }));
    await userEvent.type(input, "milestone");
    await expect(page.findByRole("option", { name: /launch milestones/i })).resolves.toBeInTheDocument();

    await userEvent.clear(input);
    await userEvent.click(page.getByRole("tab", { name: "Bots" }));
    await userEvent.type(input, "research");
    await expect(page.findByRole("option", { name: /Research/ })).resolves.toBeInTheDocument();

    await userEvent.clear(input);
    await userEvent.click(page.getByRole("tab", { name: "All" }));
  },
};

export const EmptyWorkspace: Story = {
  render: () => (
    <LunaBotPlayground
      options={{
        bots: [],
        browserTabs: [],
      }}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.findByText("No chats yet")).resolves.toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: "People" })).not.toBeInTheDocument();
    await expect(canvas.getAllByRole("listitem")).toHaveLength(6);

    const createButton = canvas.getByRole("button", { name: "Create Bot" });
    await expect(createButton).toBeDisabled();
    const nameInput = canvas.getByRole("textbox", { name: "Name" });
    const purposeInput = canvas.getByRole("textbox", { name: "What should this Bot help with?" });
    await expect(nameInput).toHaveValue("New Bot");
    await expect(purposeInput).toHaveValue("");
  },
};

export const Onboarding: Story = {
  render: () => <LunaBotPlayground options={{ setupState: { completed: false, preferredProvider: null } }} />,
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.findByRole("heading", { name: "Meet Luna Bot" })).resolves.toBeInTheDocument();
    await expect(canvas.getByRole("radiogroup", { name: "Default provider" })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(
      canvas.findByRole("heading", { name: "Luna Bot might control your computer" }),
    ).resolves.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Back" }));
    await expect(canvas.findByRole("heading", { name: "Meet Luna Bot" })).resolves.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(canvas.findByRole("heading", { name: "Give each bot a job" })).resolves.toBeInTheDocument();
    await expect(canvas.getByRole("region", { name: "Example bot jobs" })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Open Luna Bot" }));
    await expect(canvas.findByRole("heading", { name: "Chief" })).resolves.toBeInTheDocument();
  },
};

export const AgentStarting: Story = {
  render: () => (
    <LunaBotPlayground
      options={{
        agentStatus: {
          ...STORY_AGENT_STATUS,
          phase: "starting",
          message: "Starting local agent CLIs…",
        },
        bots: STORY_BOT_SUMMARIES.slice(0, 1),
      }}
    />
  ),
};
