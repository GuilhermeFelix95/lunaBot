import { fireEvent, render, waitFor, within } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockLunaBot, type MockLunaBotControls } from "../preview/mock-lunabot";
import { ComputerUseMacSetup } from "./ComputerUseMacSetup";
import { Toaster, toast } from "./ui";

let mock: MockLunaBotControls | undefined;
const previousApi = window.lunabot;

afterEach(() => {
  mock?.dispose();
  mock = undefined;
  window.lunabot = previousApi;
  toast.dismiss();
  vi.restoreAllMocks();
});

describe("ComputerUseMacSetup", () => {
  it("opens each macOS permission setup and reports that System Settings opened", async () => {
    mock = createMockLunaBot();
    window.lunabot = mock.api;
    const openSetup = vi.spyOn(mock.api, "openComputerUsePermissionSetup");
    const view = render(() => (
      <>
        <ComputerUseMacSetup platform="darwin" variant="settings" />
        <Toaster />
      </>
    ));

    expect(await view.findByText("Codex Computer Use")).toBeInTheDocument();
    const permissions = view.getByRole("heading", { name: "System permissions" }).closest("section");
    if (!permissions) throw new Error("System permissions section is missing.");
    const actions = within(permissions).getAllByRole("button", { name: "Open settings" });
    await fireEvent.click(actions[0]);

    await waitFor(() => expect(openSetup).toHaveBeenCalledWith("screen-recording"));
    expect(await view.findByText("System Settings opened")).toBeInTheDocument();
  });

  it("shows an actionable unavailable state without permission buttons", async () => {
    mock = createMockLunaBot();
    mock.api.getComputerUseMacSetupState = vi.fn().mockResolvedValue({
      status: "unavailable",
      helperName: "Codex Computer Use",
      helperIconDataUrl: null,
      message: "Install or enable Computer Use.",
    });
    window.lunabot = mock.api;
    const view = render(() => <ComputerUseMacSetup platform="darwin" variant="compact" />);

    expect(await view.findByText("Computer Use can't be turned on yet")).toBeInTheDocument();
    expect(view.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(view.queryByRole("button", { name: "Set up" })).not.toBeInTheDocument();
  });

  it("does not query Computer Use setup on other platforms", async () => {
    mock = createMockLunaBot();
    window.lunabot = mock.api;
    const getState = vi.spyOn(mock.api, "getComputerUseMacSetupState");
    const view = render(() => <ComputerUseMacSetup platform="win32" variant="compact" />);

    expect(view.container).toBeEmptyDOMElement();
    expect(getState).not.toHaveBeenCalled();
  });
});
