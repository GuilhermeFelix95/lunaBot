// @vitest-environment node

import { WINDOW_CLOSE_BEHAVIORS, type WindowCloseBehavior } from "@lunabot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { decideWindowClose, interpretCloseDialogResponse, type WindowCloseAction } from "./window-close-decision";

// Outcome when Luna Bot is not quitting and the platform is Windows or Linux.
const NON_DARWIN_OUTCOME: Record<WindowCloseBehavior, { withTray: WindowCloseAction; withoutTray: WindowCloseAction }> =
  {
    ask: { withTray: "ask", withoutTray: "quit-with-warning" },
    keep: { withTray: "hide", withoutTray: "quit-with-warning" },
    quit: { withTray: "allow", withoutTray: "allow" },
  };

describe("decideWindowClose", () => {
  for (const platform of ["win32", "linux"] as const) {
    for (const behavior of WINDOW_CLOSE_BEHAVIORS) {
      for (const trayAvailable of [true, false]) {
        it(`${platform} / ${behavior} / tray ${trayAvailable ? "available" : "missing"} ends the window close as specified`, () => {
          const expected = trayAvailable
            ? NON_DARWIN_OUTCOME[behavior].withTray
            : NON_DARWIN_OUTCOME[behavior].withoutTray;
          expect(decideWindowClose({ platform, behavior, quitting: false, trayAvailable })).toBe(expected);
        });
      }
    }
  }

  for (const behavior of WINDOW_CLOSE_BEHAVIORS) {
    for (const trayAvailable of [true, false]) {
      it(`macOS keeps the current hide-on-close behavior for ${behavior} with tray ${trayAvailable}`, () => {
        expect(decideWindowClose({ platform: "darwin", behavior, quitting: false, trayAvailable })).toBe("hide");
      });
    }
  }

  for (const platform of ["win32", "linux", "darwin"] as const) {
    for (const behavior of WINDOW_CLOSE_BEHAVIORS) {
      for (const trayAvailable of [true, false]) {
        it(`${platform} / ${behavior} lets a real quit through when tray is ${trayAvailable}`, () => {
          expect(decideWindowClose({ platform, behavior, quitting: true, trayAvailable })).toBe("allow");
        });
      }
    }
  }
});

describe("interpretCloseDialogResponse", () => {
  it("keeps Luna Bot in the background for the first button and remembers it only when ticked", () => {
    expect(interpretCloseDialogResponse(0, false)).toEqual({ action: "hide", persist: null });
    expect(interpretCloseDialogResponse(0, true)).toEqual({ action: "hide", persist: "keep" });
  });

  it("quits for the second button and remembers the quit choice only when ticked", () => {
    expect(interpretCloseDialogResponse(1, false)).toEqual({ action: "quit", persist: null });
    expect(interpretCloseDialogResponse(1, true)).toEqual({ action: "quit", persist: "quit" });
  });

  it("cancels for the third button and never persists, even when ticked", () => {
    expect(interpretCloseDialogResponse(2, false)).toEqual({ action: "cancel", persist: null });
    expect(interpretCloseDialogResponse(2, true)).toEqual({ action: "cancel", persist: null });
  });

  it("treats an unknown dialog index as a cancel so the window stays open", () => {
    expect(interpretCloseDialogResponse(-1, true)).toEqual({ action: "cancel", persist: null });
    expect(interpretCloseDialogResponse(7, false)).toEqual({ action: "cancel", persist: null });
  });
});
