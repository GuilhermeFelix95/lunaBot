import { fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComputerUseSetupSurface } from "./ComputerUseSetupSurface";
import { createMockLunaBot, type MockLunaBotControls } from "./preview/mock-lunabot";

let mock: MockLunaBotControls | undefined;
const previousApi = window.lunabot;

afterEach(() => {
  mock?.dispose();
  mock = undefined;
  window.lunabot = previousApi;
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

describe("ComputerUseSetupSurface", () => {
  it("supports drag, keyboard fallback, and Escape", async () => {
    window.history.replaceState(null, "", "/?surface=computer-use-setup&permission=accessibility");
    mock = createMockLunaBot();
    window.lunabot = mock.api;
    const startDrag = vi.spyOn(mock.api, "startComputerUseHelperDrag");
    const reveal = vi.spyOn(mock.api, "revealComputerUseHelper");
    const close = vi.spyOn(mock.api, "closeComputerUsePermissionSetup");
    const view = render(() => <ComputerUseSetupSurface />);

    await fireEvent.keyDown(window, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);

    const dragCard = await view.findByRole("button", { name: /Drag Codex Computer Use into System Settings/ });
    await fireEvent.dragStart(dragCard);
    expect(startDrag).toHaveBeenCalledTimes(1);

    await fireEvent.click(dragCard);
    expect(reveal).toHaveBeenCalledTimes(1);
  });
});
