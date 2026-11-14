import { describe, expect, it, vi } from "vitest";
import {
  defaultSidebarLayout,
  readSidebarCollapsed,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  splitHiddenAgents,
  writeSidebarCollapsed,
} from "./sidebar-sections";

describe("sidebar collapsed sections", () => {
  it("reads the collapsed list and removes duplicates and invalid values", () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify(["people", "demo", "demo", null, ""])),
      setItem: vi.fn(),
    };

    expect(readSidebarCollapsed(storage)).toEqual(["people", "demo"]);
  });

  it("returns an empty list for damaged storage", () => {
    expect(readSidebarCollapsed({ getItem: () => "not-json", setItem: vi.fn() })).toEqual([]);
  });

  it("writes the versioned preference without blocking on storage errors", () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    const collapsed = ["people", "demo"];
    writeSidebarCollapsed(collapsed, storage);
    expect(storage.setItem).toHaveBeenCalledWith(SIDEBAR_COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed));

    expect(() =>
      writeSidebarCollapsed(collapsed, {
        getItem: vi.fn(),
        setItem: () => {
          throw new Error("full");
        },
      }),
    ).not.toThrow();
  });
});

describe("hidden sidebar agents", () => {
  it("splits hidden agents out of the visible list and keeps their original order", () => {
    const bots = [{ id: "chief" }, { id: "research" }, { id: "sales" }];
    expect(splitHiddenAgents(bots, ["research", "unknown"])).toEqual({
      visible: [{ id: "chief" }, { id: "sales" }],
      hidden: [{ id: "research" }],
    });
  });

  it("keeps every agent visible when nothing is hidden", () => {
    const bots = [{ id: "chief" }];
    expect(splitHiddenAgents(bots, [])).toEqual({ visible: bots, hidden: [] });
  });

  it("starts a default layout with no hidden agents", () => {
    expect(defaultSidebarLayout().hiddenAgentIds).toEqual([]);
  });
});
