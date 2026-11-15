import { fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { avatarProfile } from "../avatar";
import { mascotAt } from "../mascots";
import { setThemePreference } from "../theme";
import { AgentAvatar } from "./AgentAvatar";

afterEach(() => {
  vi.unstubAllGlobals();
  setThemePreference("eclipse");
});

describe("AgentAvatar", () => {
  it("falls back to the generated avatar when a custom image fails", async () => {
    const view = render(() => <AgentAvatar seed="chief" hue={215} url="mock-avatar://missing" />);
    const image = view.container.querySelector("img");
    if (!(image instanceof HTMLImageElement)) throw new Error("Custom avatar image is missing.");

    await fireEvent.error(image);

    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.querySelector(".bot-avatar-art > svg")).not.toBeNull();
  });

  it("keeps a working avatar still when reduced motion is requested", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    const view = render(() => <AgentAvatar seed="chief" hue={215} motion="working" />);

    expect(view.container.querySelector("svg")?.getAttribute("data-state")).toBe("rest");
  });

  it("draws the mascot its seed picks, in every theme", () => {
    const expected = mascotAt(avatarProfile("chief", 215).mascot).id;
    for (const theme of ["papel", "eclipse"] as const) {
      setThemePreference(theme);
      const view = render(() => <AgentAvatar seed="chief" hue={215} motion="always" />);

      expect(view.container.querySelector("svg")?.getAttribute("data-mascot")).toBe(expected);
      view.unmount();
    }
  });
});
