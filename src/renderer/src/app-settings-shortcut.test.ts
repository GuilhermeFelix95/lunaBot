import { describe, expect, it } from "vitest";
import { type AppSettingsShortcutEvent, isAppSettingsShortcut } from "./app-settings-shortcut";

function keyEvent(overrides: Partial<AppSettingsShortcutEvent>): AppSettingsShortcutEvent {
  return { key: ",", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...overrides };
}

describe("isAppSettingsShortcut", () => {
  it("opens settings with Cmd+, on macOS", () => {
    expect(isAppSettingsShortcut(keyEvent({ metaKey: true }), true)).toBe(true);
  });

  it("opens settings with Ctrl+, on other platforms", () => {
    expect(isAppSettingsShortcut(keyEvent({ ctrlKey: true }), false)).toBe(true);
  });

  it("uses the platform's primary modifier only", () => {
    expect(isAppSettingsShortcut(keyEvent({ ctrlKey: true }), true)).toBe(false);
    expect(isAppSettingsShortcut(keyEvent({ metaKey: true }), false)).toBe(false);
  });

  it("ignores the chord when Shift or Alt is held or another key is pressed", () => {
    expect(isAppSettingsShortcut(keyEvent({ metaKey: true, shiftKey: true }), true)).toBe(false);
    expect(isAppSettingsShortcut(keyEvent({ ctrlKey: true, altKey: true }), false)).toBe(false);
    expect(isAppSettingsShortcut(keyEvent({ key: "k", ctrlKey: true }), false)).toBe(false);
    expect(isAppSettingsShortcut(keyEvent({ key: ".", ctrlKey: true }), false)).toBe(false);
  });

  it("ignores the chord when both primary modifiers are held", () => {
    expect(isAppSettingsShortcut(keyEvent({ metaKey: true, ctrlKey: true }), true)).toBe(false);
    expect(isAppSettingsShortcut(keyEvent({ metaKey: true, ctrlKey: true }), false)).toBe(false);
  });

  it("ignores a bare comma", () => {
    expect(isAppSettingsShortcut(keyEvent({}), true)).toBe(false);
    expect(isAppSettingsShortcut(keyEvent({}), false)).toBe(false);
  });
});
