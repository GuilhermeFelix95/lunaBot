import type { PinnedMessage } from "@lunabot/contracts/ipc";
import { createSignal } from "solid-js";

const [pinsByBot, setPinsByBot] = createSignal<Record<string, PinnedMessage[]>>({});

export function messagePinsFor(botId: string): PinnedMessage[] {
  return pinsByBot()[botId] ?? [];
}

export async function loadMessagePins(botId: string): Promise<void> {
  const snapshot = await window.lunabot.agent.listPinnedMessages(botId);
  setPinsByBot((current) => ({ ...current, [snapshot.botId]: snapshot.pins }));
}

export async function setMessagePin(botId: string, messageId: string, pinned: boolean): Promise<void> {
  const snapshot = await window.lunabot.agent.setMessagePinned({ botId, messageId, pinned });
  setPinsByBot((current) => ({ ...current, [snapshot.botId]: snapshot.pins }));
}
