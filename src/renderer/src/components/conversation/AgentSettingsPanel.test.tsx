import type { Routine } from "@lunabot/contracts/ipc";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORY_AGENT_STATUS, STORY_BOTS, STORY_MODELS } from "../../preview/fixtures";
import { createMockLunaBot, type MockLunaBotControls } from "../../preview/mock-lunabot";
import AgentSettingsPanel from "./AgentSettingsPanel";

const routine: Routine = {
  id: "routine-1",
  botId: "chief",
  name: "Morning brief",
  instruction: "Summarize the overnight changes.",
  active: true,
  timezone: "Europe/Warsaw",
  trigger: {
    id: "trigger-1",
    routineId: "routine-1",
    schedule: { kind: "weekdays", time: "07:00" },
    nextRunAt: "2026-08-26T05:00:00.000Z",
    createdAt: "2026-08-25T12:00:00.000Z",
    updatedAt: "2026-08-25T12:00:00.000Z",
  },
  createdAt: "2026-08-25T12:00:00.000Z",
  updatedAt: "2026-08-25T12:00:00.000Z",
};

let mock: MockLunaBotControls;

beforeEach(() => {
  mock = createMockLunaBot({ routines: { chief: [routine] } });
  window.lunabot = mock.api;
});

afterEach(() => {
  mock.dispose();
  vi.restoreAllMocks();
});

describe("AgentSettingsPanel", () => {
  it("opens the requested routine when the settings panel mounts", async () => {
    const bot = STORY_BOTS[0];
    if (!bot) throw new Error("Expected the Chief fixture.");
    const onRoutineSelectionRequestHandled = vi.fn();
    render(() => (
      <AgentSettingsPanel
        bot={bot}
        runtimeSettings={{ provider: bot.provider, model: bot.model, reasoningEffort: bot.reasoningEffort }}
        agentStatus={STORY_AGENT_STATUS}
        modelOptions={STORY_MODELS}
        working={false}
        maxWidth={() => 800}
        onClose={vi.fn()}
        onWidthChange={vi.fn()}
        onUpdateBot={vi.fn(async () => undefined)}
        onUpdateRuntimeSettings={vi.fn(async () => true)}
        onSetAgentAvatar={vi.fn(async () => undefined)}
        routineSelectionRequest={{ routineId: routine.id, routineName: routine.name, nonce: 1 }}
        onRoutineSelectionRequestHandled={onRoutineSelectionRequestHandled}
      />
    ));

    expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue("Morning brief");
    expect(onRoutineSelectionRequestHandled).toHaveBeenCalledWith(1);
  });

  it("shows the approval mode saved for this agent", async () => {
    const bot = chiefFixture();
    await window.lunabot.agentPreferences.setApprovalPolicy({ botId: bot.id, mode: "safe-project" });

    renderApprovalSettings();

    const trigger = await screen.findByRole("button", { name: /Automatic approvals/ });
    await waitFor(() => expect(trigger).toHaveTextContent("Project, when the location is known"));
  });

  it("saves the chosen approval mode for this agent", async () => {
    const savePolicy = vi.spyOn(window.lunabot.agentPreferences, "setApprovalPolicy");
    const bot = chiefFixture();
    renderApprovalSettings();

    const trigger = await screen.findByRole("button", { name: /Automatic approvals/ });
    await chooseApprovalMode(trigger, "Whole project");

    await waitFor(() => expect(savePolicy).toHaveBeenCalledWith({ botId: bot.id, mode: "project-all" }));
    await waitFor(() => expect(trigger).toHaveTextContent("Whole project"));
  });

  it("reverts the approval mode and reports the failure when saving is rejected", async () => {
    vi.spyOn(window.lunabot.agentPreferences, "setApprovalPolicy").mockRejectedValueOnce(new Error("Disk is full."));
    renderApprovalSettings();

    const trigger = await screen.findByRole("button", { name: /Automatic approvals/ });
    await chooseApprovalMode(trigger, "Project, when the location is known");

    expect(await screen.findByRole("alert")).toHaveTextContent("Disk is full.");
    await waitFor(() => expect(trigger).toHaveTextContent("Ask every time"));
  });

  it("shows a risk note next to the automatic approval control", async () => {
    renderApprovalSettings();

    expect(await screen.findByRole("note")).toBeInTheDocument();
  });
});

function chiefFixture() {
  const bot = STORY_BOTS[0];
  if (!bot) throw new Error("Expected the Chief fixture.");
  return bot;
}

function renderApprovalSettings(): void {
  const bot = chiefFixture();
  render(() => (
    <AgentSettingsPanel
      bot={bot}
      runtimeSettings={{ provider: bot.provider, model: bot.model, reasoningEffort: bot.reasoningEffort }}
      agentStatus={STORY_AGENT_STATUS}
      modelOptions={STORY_MODELS}
      working={false}
      maxWidth={() => 800}
      onClose={vi.fn()}
      onWidthChange={vi.fn()}
      onUpdateBot={vi.fn(async () => undefined)}
      onUpdateRuntimeSettings={vi.fn(async () => true)}
      onSetAgentAvatar={vi.fn(async () => undefined)}
    />
  ));
}

async function chooseApprovalMode(trigger: HTMLElement, label: string): Promise<void> {
  fireEvent.pointerDown(trigger, { pointerType: "mouse", button: 0 });
  fireEvent.click(await screen.findByRole("option", { name: label }));
}
