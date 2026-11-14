import { z } from "zod";

export type SidebarPinnedItem = Readonly<{
  kind: "agent" | "person";
  id: string;
}>;

export const SIDEBAR_PINS_STORAGE_KEY = "lunabot:sidebar-pins:v1";
export const MAX_SIDEBAR_PINNED_ITEMS = 6;

type SidebarPinStorage = Pick<Storage, "getItem" | "setItem">;

const sidebarPinnedItemSchema = z.object({
  kind: z.enum(["agent", "person"]),
  id: z.string().trim().min(1),
});
const sidebarPinsSchema = z.array(sidebarPinnedItemSchema.nullable().catch(null)).catch([]);

export function sidebarPinnedItemKey(item: SidebarPinnedItem): string {
  return `${item.kind}:${item.id}`;
}

export function normalizeSidebarPinnedItems(value: readonly SidebarPinnedItem[]): SidebarPinnedItem[] {
  const seen = new Set<string>();
  const items: SidebarPinnedItem[] = [];
  for (const candidate of value) {
    if (candidate.kind !== "agent") continue;
    const key = sidebarPinnedItemKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ kind: candidate.kind, id: candidate.id });
    if (items.length === MAX_SIDEBAR_PINNED_ITEMS) break;
  }
  return items;
}

export function readSidebarPins(storage: SidebarPinStorage = window.localStorage): SidebarPinnedItem[] {
  try {
    const parsed = sidebarPinsSchema.safeParse(JSON.parse(storage.getItem(SIDEBAR_PINS_STORAGE_KEY) ?? "[]"));
    if (!parsed.success) return [];
    return normalizeSidebarPinnedItems(parsed.data.flatMap((item) => (item ? [item] : [])));
  } catch {
    return [];
  }
}

export function writeSidebarPins(pins: SidebarPinnedItem[], storage: SidebarPinStorage = window.localStorage): void {
  try {
    storage.setItem(SIDEBAR_PINS_STORAGE_KEY, JSON.stringify(pins));
  } catch {
    // A UI preference must not block navigation when browser storage is unavailable.
  }
}
