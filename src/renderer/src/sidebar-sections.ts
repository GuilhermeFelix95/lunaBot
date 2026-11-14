import {
  SIDEBAR_PEOPLE_SECTION_ID,
  SIDEBAR_UNASSIGNED_SECTION_ID,
  type SidebarLayoutSnapshot,
} from "@lunabot/contracts/ipc";
import { z } from "zod";

export const SIDEBAR_COLLAPSED_STORAGE_KEY = "lunabot:sidebar-collapsed:v1";
/** Collapse-state id of the "Hidden" section at the end of the sidebar. Custom section ids are UUIDs, so it cannot collide. */
export const SIDEBAR_HIDDEN_SECTION_ID = "hidden";

type SidebarCollapsedStorage = Pick<Storage, "getItem" | "setItem">;

const collapsedSchema = z.array(z.string().trim().min(1).nullable().catch(null)).catch([]);

export function defaultSidebarLayout(): SidebarLayoutSnapshot {
  return {
    revision: 0,
    sections: [],
    order: [SIDEBAR_PEOPLE_SECTION_ID, SIDEBAR_UNASSIGNED_SECTION_ID],
    agentAssignments: {},
    agentOrder: [],
    hiddenAgentIds: [],
  };
}

/** Hidden agents stay in the app but are kept out of the visible sidebar lists and the dock. */
export function splitHiddenAgents<T extends { id: string }>(
  bots: readonly T[],
  hiddenAgentIds: readonly string[],
): { visible: T[]; hidden: T[] } {
  const hidden = new Set(hiddenAgentIds);
  return {
    visible: bots.filter((bot) => !hidden.has(bot.id)),
    hidden: bots.filter((bot) => hidden.has(bot.id)),
  };
}

export function readSidebarCollapsed(storage: SidebarCollapsedStorage = window.localStorage): string[] {
  try {
    const parsed = collapsedSchema.safeParse(JSON.parse(storage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) ?? "[]"));
    if (!parsed.success) return [];
    return [...new Set(parsed.data.flatMap((value) => (value ? [value] : [])))];
  } catch {
    return [];
  }
}

export function writeSidebarCollapsed(
  collapsed: string[],
  storage: SidebarCollapsedStorage = window.localStorage,
): void {
  try {
    storage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed));
  } catch {
    // A private display preference must not block shared sidebar navigation.
  }
}
