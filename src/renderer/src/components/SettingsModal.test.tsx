import type { UpdateStatus } from "@lunabot/contracts/ipc";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GENERAL_SETTINGS } from "../app-settings";
import { localePreference, setLocalePreference } from "../i18n";
import { modePreference, setModePreference, setThemePreference, themePreference } from "../theme";
import { SettingsModal } from "./SettingsModal";

const idleUpdateStatus: UpdateStatus = {
  phase: "idle",
  currentVersion: "0.2.1",
  availableVersion: null,
  progress: null,
  checkedAt: null,
  message: null,
  errorCode: null,
};

describe("SettingsModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setLocalePreference("en");
    setThemePreference("auto");
    setModePreference("system");
  });

  it("keeps dependent notch options selected but unavailable while the MacBook notch is disabled", () => {
    render(() => (
      <SettingsModal
        open
        onOpenChange={() => undefined}
        value={{ ...DEFAULT_GENERAL_SETTINGS, macBookNotch: false }}
        onValueChange={() => undefined}
        appInfo={{ name: "Luna Bot", version: "0.2.1", platform: "darwin", variant: "dev" }}
        updateStatus={idleUpdateStatus}
        onUpdateAction={vi.fn(async () => undefined)}
      />
    ));

    expect(screen.getByRole("switch", { name: "Haptic feedback" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Haptic feedback" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Show idle island" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Show idle island" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Also display on other screens" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Also display on other screens" })).toBeDisabled();
  });

  it("keeps General preferences controlled across close and reopen", async () => {
    const [open, setOpen] = createSignal(true);
    const [value, setValue] = createSignal({ ...DEFAULT_GENERAL_SETTINGS });
    let openTrigger: HTMLButtonElement | undefined;

    render(() => (
      <>
        <button ref={(element) => (openTrigger = element)} type="button" onClick={() => setOpen(true)}>
          Open settings
        </button>
        <SettingsModal
          open={open()}
          onOpenChange={setOpen}
          value={value()}
          onValueChange={setValue}
          appInfo={{ name: "Luna Bot", version: "0.2.1", platform: "darwin", variant: "dev" }}
          updateStatus={idleUpdateStatus}
          onUpdateAction={vi.fn(async () => undefined)}
          restoreFocusTarget={openTrigger}
        />
      </>
    ));

    const launchSwitch = screen.getByRole("switch", { name: "Launch Luna Bot at login" });
    await fireEvent.click(launchSwitch);
    expect(value().launchAtLogin).toBe(false);

    const select = screen.getByRole("button", { name: /^Where external links should open/ });
    await fireEvent.pointerDown(select, { pointerType: "mouse", button: 0 });
    await fireEvent.click(screen.getByRole("option", { name: "Luna Bot" }));
    expect(value().externalLinkTarget).toBe("Luna Bot");

    await fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "General" })).not.toBeInTheDocument());
    await fireEvent.click(screen.getByRole("button", { name: "Open settings" }));

    expect(await screen.findByRole("switch", { name: "Launch Luna Bot at login" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /^Where external links should open/ })).toHaveTextContent("Luna Bot");
  });

  it("keeps the automatic download preference controlled across close and reopen", async () => {
    const [open, setOpen] = createSignal(true);
    const [value, setValue] = createSignal({ ...DEFAULT_GENERAL_SETTINGS });
    let openTrigger: HTMLButtonElement | undefined;

    render(() => (
      <>
        <button ref={(element) => (openTrigger = element)} type="button" onClick={() => setOpen(true)}>
          Open settings
        </button>
        <SettingsModal
          open={open()}
          onOpenChange={setOpen}
          value={value()}
          onValueChange={setValue}
          appInfo={{ name: "Luna Bot", version: "0.2.1", platform: "darwin", variant: "dev" }}
          updateStatus={idleUpdateStatus}
          onUpdateAction={vi.fn(async () => undefined)}
          restoreFocusTarget={openTrigger}
        />
      </>
    ));

    await fireEvent.click(screen.getByRole("tab", { name: "Updates" }));
    const autoDownload = await screen.findByRole("switch", { name: "Automatically download updates" });
    expect(autoDownload).toBeChecked();

    await fireEvent.click(autoDownload);
    expect(value().autoDownloadUpdates).toBe(false);

    await fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    // The dialog is named after the active tab, so the wait has to target the Updates title.
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Updates" })).not.toBeInTheDocument());
    await fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    await fireEvent.click(await screen.findByRole("tab", { name: "Updates" }));

    expect(await screen.findByRole("switch", { name: "Automatically download updates" })).not.toBeChecked();
  });

  it("runs the updater and reflects its live status", async () => {
    const [status, setStatus] = createSignal<UpdateStatus>(idleUpdateStatus);
    const onUpdateAction = vi.fn(async () => {
      setStatus({ ...idleUpdateStatus, phase: "up-to-date", checkedAt: "2026-08-26T12:00:00.000Z" });
    });

    render(() => (
      <SettingsModal
        open
        onOpenChange={() => undefined}
        value={DEFAULT_GENERAL_SETTINGS}
        onValueChange={() => undefined}
        appInfo={{ name: "Luna Bot", version: "0.2.1", platform: "darwin", variant: "dev" }}
        updateStatus={status()}
        onUpdateAction={onUpdateAction}
      />
    ));

    await fireEvent.click(screen.getByRole("tab", { name: "Updates" }));
    await fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await waitFor(() => expect(onUpdateAction).toHaveBeenCalledOnce());
    expect(await screen.findByText("Luna Bot is up to date on the Stable track.")).toBeInTheDocument();
  });

  it("shows the Stable track and the target update across download states", async () => {
    const [status, setStatus] = createSignal<UpdateStatus>({
      ...idleUpdateStatus,
      phase: "available",
      availableVersion: "0.3.0",
    });

    render(() => (
      <SettingsModal
        open
        onOpenChange={() => undefined}
        value={DEFAULT_GENERAL_SETTINGS}
        onValueChange={() => undefined}
        appInfo={{ name: "Luna Bot", version: "0.2.1", platform: "darwin", variant: "dev" }}
        updateStatus={status()}
        onUpdateAction={vi.fn(async () => undefined)}
      />
    ));

    await fireEvent.click(screen.getByRole("tab", { name: "Updates" }));
    await fireEvent.pointerDown(screen.getByRole("button", { name: /^Update track/ }), {
      pointerType: "mouse",
      button: 0,
    });
    expect(screen.getByRole("option", { name: "Stable" })).toHaveAttribute("aria-selected", "true");
    await fireEvent.click(screen.getByRole("option", { name: "Stable" }));

    expect(screen.getByText("Version 0.2.1")).toBeInTheDocument();
    expect(screen.getByText("Luna Bot v0.3.0 can be downloaded now.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download update" })).toBeEnabled();

    setStatus({ ...status(), phase: "downloading", progress: 42 });
    expect(await screen.findByText("Downloading Luna Bot v0.3.0 · 42%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Downloading update…" })).toBeDisabled();

    setStatus({ ...status(), phase: "ready", progress: 100 });
    expect(
      await screen.findByText("Luna Bot v0.3.0 has finished downloading. Relaunch to finish."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart to update" })).toBeEnabled();
  });

  it("disables busy update actions and shows action failures", async () => {
    const onUpdateAction = vi.fn(async () => {
      throw new Error("Update service is offline.");
    });
    const view = render(() => (
      <SettingsModal
        open
        onOpenChange={() => undefined}
        value={DEFAULT_GENERAL_SETTINGS}
        onValueChange={() => undefined}
        appInfo={{ name: "Luna Bot", version: "0.2.1", platform: "darwin", variant: "dev" }}
        updateStatus={idleUpdateStatus}
        onUpdateAction={onUpdateAction}
      />
    ));

    await fireEvent.click(screen.getByRole("tab", { name: "Updates" }));
    await fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("Update service is offline.")).toBeInTheDocument();

    view.unmount();
    render(() => (
      <SettingsModal
        open
        onOpenChange={() => undefined}
        value={DEFAULT_GENERAL_SETTINGS}
        onValueChange={() => undefined}
        appInfo={{ name: "Luna Bot", version: "0.2.1", platform: "darwin", variant: "dev" }}
        updateStatus={{ ...idleUpdateStatus, phase: "checking" }}
        onUpdateAction={onUpdateAction}
      />
    ));

    await fireEvent.click(screen.getByRole("tab", { name: "Updates" }));
    expect(screen.getByRole("button", { name: "Checking for updates…" })).toBeDisabled();
  });

  it("switches the interface language from the General tab", async () => {
    render(() => (
      <SettingsModal
        open
        onOpenChange={() => undefined}
        value={DEFAULT_GENERAL_SETTINGS}
        onValueChange={() => undefined}
        appInfo={{ name: "Luna Bot", version: "0.2.1", platform: "darwin", variant: "dev" }}
        updateStatus={idleUpdateStatus}
        onUpdateAction={vi.fn(async () => undefined)}
      />
    ));

    const select = screen.getByRole("button", { name: /^Interface language/ });
    expect(select).toHaveTextContent("English");
    await fireEvent.pointerDown(select, { pointerType: "mouse", button: 0 });
    await fireEvent.click(screen.getByRole("option", { name: "Português (Brasil)" }));

    expect(localePreference()).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(select).toHaveTextContent("Português (Brasil)");
  });

  it("changes the theme and mode from the General tab and applies them to the document", async () => {
    render(() => (
      <SettingsModal
        open
        onOpenChange={() => undefined}
        value={DEFAULT_GENERAL_SETTINGS}
        onValueChange={() => undefined}
        appInfo={{ name: "Luna Bot", version: "0.2.1", platform: "darwin", variant: "dev" }}
        updateStatus={idleUpdateStatus}
        onUpdateAction={vi.fn(async () => undefined)}
      />
    ));

    await fireEvent.click(screen.getByRole("radio", { name: /^Eclipse/ }));
    expect(themePreference()).toBe("eclipse");
    expect(document.documentElement.dataset.theme).toBe("eclipse");

    await fireEvent.pointerDown(screen.getByRole("button", { name: /^Mode/ }), { pointerType: "mouse", button: 0 });
    await fireEvent.click(screen.getByRole("option", { name: "Light" }));
    expect(modePreference()).toBe("light");
    expect(document.documentElement.dataset.mode).toBe("light");
  });
});
