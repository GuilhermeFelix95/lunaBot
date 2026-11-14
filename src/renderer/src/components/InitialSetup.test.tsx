import { render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORY_AGENT_STATUS } from "../preview/fixtures";
import { createMockLunaBot, type MockLunaBotControls } from "../preview/mock-lunabot";
import { InitialSetup } from "./InitialSetup";

let mock: MockLunaBotControls | undefined;
const previousApi = window.lunabot;

afterEach(() => {
  mock?.dispose();
  mock = undefined;
  window.lunabot = previousApi;
  vi.restoreAllMocks();
});

function renderReview(platform: "darwin" | "win32") {
  mock = createMockLunaBot();
  window.lunabot = mock.api;
  return render(() => (
    <InitialSetup
      reviewing
      state={{ completed: true, preferredProvider: "codex" }}
      agentStatus={STORY_AGENT_STATUS}
      platform={platform}
      onSave={async () => undefined}
      onClose={vi.fn()}
    />
  ));
}

describe("InitialSetup", () => {
  it("shows macOS permissions on darwin", async () => {
    const view = renderReview("darwin");

    expect(view.getByRole("heading", { name: "Providers & permissions" })).toBeInTheDocument();
    expect(await view.findByRole("heading", { name: "Enable Computer Use" })).toBeInTheDocument();
  });

  it("hides the macOS permissions block on other platforms", () => {
    const view = renderReview("win32");

    expect(view.getByRole("heading", { name: "Providers" })).toBeInTheDocument();
    expect(view.queryByRole("heading", { name: "Enable Computer Use" })).toBeNull();
    expect(view.queryByText("Screen Recording")).toBeNull();
  });
});
