import type { WindowCloseBehavior } from "@lunabot/contracts/ipc";

/**
 * - allow: let the window close. On Windows and Linux the app then quits with its last window.
 * - hide: keep Luna Bot running and hide the window (macOS always, or the "keep" setting with a tray).
 * - ask: show the three-choice dialog.
 * - quit-with-warning: nothing can keep the app in the background, so warn and quit.
 */
export type WindowCloseAction = "allow" | "hide" | "ask" | "quit-with-warning";

export interface WindowCloseContext {
  platform: NodeJS.Platform;
  behavior: WindowCloseBehavior;
  /** True when Luna Bot itself is quitting (tray or menu Quit, or the operating system ending the session). */
  quitting: boolean;
  trayAvailable: boolean;
}

export function decideWindowClose(context: WindowCloseContext): WindowCloseAction {
  if (context.quitting) return "allow";
  if (context.platform === "darwin") return "hide";
  if (context.behavior === "quit") return "allow";
  if (!context.trayAvailable) return "quit-with-warning";
  if (context.behavior === "keep") return "hide";
  return "ask";
}

/** Button order of the close dialog. The index returned by the dialog maps onto this list. */
export const CLOSE_DIALOG_BUTTONS = ["keep", "quit", "cancel"] as const;

export interface CloseDialogChoice {
  action: "hide" | "quit" | "cancel";
  /** Set when the user ticked "remember my choice" on keep or quit. Cancel never persists. */
  persist: WindowCloseBehavior | null;
}

export function interpretCloseDialogResponse(response: number, remember: boolean): CloseDialogChoice {
  const button = CLOSE_DIALOG_BUTTONS[response];
  if (button === "keep") return { action: "hide", persist: remember ? "keep" : null };
  if (button === "quit") return { action: "quit", persist: remember ? "quit" : null };
  return { action: "cancel", persist: null };
}
