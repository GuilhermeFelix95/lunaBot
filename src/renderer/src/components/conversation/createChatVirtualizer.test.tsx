import { render, screen, waitFor } from "@solidjs/testing-library";
import { createMemo, createSignal, For } from "solid-js";
import { describe, expect, it } from "vitest";
import { type ChatVirtualizer, createChatVirtualizer } from "./createChatVirtualizer";

describe("chat virtualizer", () => {
  it("jumps a static list to its real end", () => {
    const scroller = document.createElement("div");
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 1_500 });
    let chat: ChatVirtualizer<HTMLDivElement> | undefined;

    function TestList() {
      chat = createChatVirtualizer<HTMLDivElement, HTMLDivElement>({
        count: () => 3,
        getScrollElement: () => scroller,
        estimateSize: () => 128,
        getItemKey: (index) => `message-${index}`,
        keyVersion: () => "static",
        scrollMargin: () => 0,
        isPinned: () => true,
      });
      return <div />;
    }

    render(() => <TestList />);
    chat?.scrollToEnd();

    expect(scroller.scrollTop).toBe(1_500);
  });

  it("scrolls a virtualized list to its last row instantly", async () => {
    const scroller = document.createElement("div");
    Object.defineProperties(scroller, {
      scrollHeight: { configurable: true, value: 19_200 },
      clientHeight: { configurable: true, value: 600 },
    });
    // jsdom has no Element.scrollTo, and the virtualizer scrolls through it.
    const requests: ScrollToOptions[] = [];
    Object.defineProperty(scroller, "scrollTo", {
      configurable: true,
      value: (options: ScrollToOptions) => requests.push(options),
    });
    let chat: ChatVirtualizer<HTMLDivElement> | undefined;

    function TestList() {
      chat = createChatVirtualizer<HTMLDivElement, HTMLDivElement>({
        count: () => 150,
        getScrollElement: () => scroller,
        estimateSize: () => 128,
        getItemKey: (index) => `message-${index}`,
        keyVersion: () => "virtualized",
        scrollMargin: () => 0,
        isPinned: () => true,
      });
      return <div />;
    }

    render(() => <TestList />);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    chat?.scrollToEnd();

    expect(requests.at(-1)).toEqual({ top: 18_600, behavior: "auto" });
  });

  it("renders an appended row without entering a refresh loop", async () => {
    let appendMessage: (() => void) | undefined;

    function TestList() {
      const [messageIds, setMessageIds] = createSignal(["message-0"]);
      appendMessage = () => setMessageIds((current) => [...current, "message-1"]);
      const virtualizer = createChatVirtualizer<HTMLDivElement, HTMLDivElement>({
        count: () => messageIds().length,
        getScrollElement: () => null,
        estimateSize: () => 128,
        getItemKey: (index) => messageIds()[index] ?? index,
        keyVersion: () => messageIds().join(":"),
        scrollMargin: () => 0,
        isPinned: () => true,
      });
      const rows = createMemo(() => virtualizer.getVirtualItems());

      return <For each={rows()}>{(row) => <div data-testid={`dynamic-row-${row.index}`}>{String(row.key)}</div>}</For>;
    }

    render(() => <TestList />);
    expect(screen.getByTestId("dynamic-row-0")).toHaveTextContent("message-0");

    appendMessage?.();

    await waitFor(() => expect(screen.getByTestId("dynamic-row-1")).toHaveTextContent("message-1"));
  });

  describe("follow mode", () => {
    // 150 rows of 128px in a 600px viewport: the end is at 18_600. 18_550 is 50px above it.
    function listAboveEnd(initialPinned: boolean) {
      const scroller = document.createElement("div");
      // The DOM height stays at 150 rows while the follow decision runs: the new row is not laid out yet.
      Object.defineProperties(scroller, {
        clientHeight: { configurable: true, value: 600 },
        scrollHeight: { configurable: true, value: 19_200 },
      });
      const requests: ScrollToOptions[] = [];
      Object.defineProperty(scroller, "scrollTo", {
        configurable: true,
        value: (options: ScrollToOptions) => requests.push(options),
      });
      let pinned = initialPinned;
      let chat: ChatVirtualizer<HTMLDivElement> | undefined;
      let appendRow: (() => void) | undefined;

      function TestList() {
        const [count, setCount] = createSignal(150);
        appendRow = () => setCount((current) => current + 1);
        const virtualizer = createChatVirtualizer<HTMLDivElement, HTMLDivElement>({
          count,
          getScrollElement: () => scroller,
          estimateSize: () => 128,
          getItemKey: (index) => `message-${index}`,
          keyVersion: count,
          scrollMargin: () => 0,
          isPinned: () => pinned,
        });
        chat = virtualizer;
        const rows = createMemo(() => virtualizer.getVirtualItems());
        return <For each={rows()}>{(row) => <div data-testid={`row-${row.index}`} />}</For>;
      }

      return {
        requests,
        chat: () => chat,
        appendRow: () => appendRow?.(),
        setPinned: (value: boolean) => {
          pinned = value;
        },
        scroller,
        render: () => render(() => <TestList />),
      };
    }

    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    it("follows an appended row once pinned again, even a little above the end", async () => {
      const list = listAboveEnd(false);
      list.render();
      await nextFrame();
      list.scroller.scrollTop = 18_550;
      list.scroller.dispatchEvent(new Event("scroll"));

      list.setPinned(true);
      list.chat()?.syncFollowMode();
      list.appendRow();

      await waitFor(() => expect(screen.getByTestId("row-150")).toBeInTheDocument());
      // The end read at follow time is the previous one (18_600), so the list moves to the end instead of
      // returning to the reader's old place (18_550).
      expect(list.requests.at(-1)).toEqual({ top: 18_600, behavior: "auto" });
    });

    it("keeps a released list in place when rows are appended, even a little above the end", async () => {
      const list = listAboveEnd(false);
      list.render();
      await nextFrame();
      list.scroller.scrollTop = 18_550;
      list.scroller.dispatchEvent(new Event("scroll"));
      const requestsBefore = list.requests.length;

      list.appendRow();

      await waitFor(() => expect(screen.getByTestId("row-150")).toBeInTheDocument());
      expect(list.requests).toHaveLength(requestsBefore);
    });
  });
});
