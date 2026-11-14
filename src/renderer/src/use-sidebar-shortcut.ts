import { onSettled } from "solid-js";

interface SidebarShortcutOptions {
  macOS: () => boolean;
  onToggle: () => void;
}

// Cmd+B on macOS, Ctrl+B elsewhere. Ignored while typing so the composer and fields keep their own input.
export function useSidebarShortcut(options: SidebarShortcutOptions): void {
  onSettled(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLocaleLowerCase() !== "b" || event.altKey || event.shiftKey) return;
      const primary = options.macOS() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!primary || isEditableTarget(event.target)) return;
      event.preventDefault();
      options.onToggle();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches("input, textarea, select");
}
