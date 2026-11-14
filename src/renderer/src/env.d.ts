/// <reference types="vite/client" />

import type { LunaBotDesktopApi } from "@lunabot/contracts/ipc";

declare global {
  interface HighlightRegistry {
    set(name: string, highlight: Highlight): this;
    delete(name: string): boolean;
  }

  interface Window {
    lunabot: LunaBotDesktopApi;
  }
}
