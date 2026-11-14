export interface AppSettingsShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

// Cmd+, on macOS, Ctrl+, elsewhere. Shift and Alt are left out so other chords keep their own meaning.
export function isAppSettingsShortcut(event: AppSettingsShortcutEvent, macOS: boolean): boolean {
  if (event.key !== "," || event.altKey || event.shiftKey) return false;
  return macOS ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}
