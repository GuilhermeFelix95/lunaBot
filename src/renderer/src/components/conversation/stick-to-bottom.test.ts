import { afterEach, describe, expect, it } from "vitest";
import { triggerResize } from "../../setupTests";
import { attachStickToBottom, type StickScrollSnapshot, StickToBottom } from "./stick-to-bottom";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function at(scrollTop: number, scrollHeight = 2_000, clientHeight = 1_000): StickScrollSnapshot {
  return { scrollTop, scrollHeight, clientHeight };
}

describe("stick to bottom state", () => {
  it("keeps following when content grows and a scroll event is measured afterwards", () => {
    const stick = new StickToBottom();
    stick.observeScroll(at(1_000), 0);

    stick.observeScroll(at(1_000, 2_700), 10);

    expect(stick.isPinned()).toBe(true);
  });

  it("keeps following when growth moves the viewport up without a user gesture", () => {
    const stick = new StickToBottom();
    stick.observeScroll(at(1_000), 0);

    stick.observeScroll(at(900, 1_800), 10);

    expect(stick.isPinned()).toBe(true);
  });

  it("keeps following when the viewport moves up and the height reads the same, as after a layout that grew and shrank within one frame", () => {
    const stick = new StickToBottom();
    stick.observeScroll(at(1_000), 0);

    stick.observeScroll(at(900), 10);

    expect(stick.isPinned()).toBe(true);
  });

  it("stops following after an explicit release and ignores growth while released", () => {
    const stick = new StickToBottom();
    stick.observeScroll(at(1_000), 0);

    stick.release();
    stick.observeScroll(at(1_000, 2_700), 10);

    expect(stick.isPinned()).toBe(false);
  });

  it("resumes following once the user scrolls down to within the resume distance", () => {
    const stick = new StickToBottom();
    stick.observeScroll(at(0), 0);
    stick.release();

    stick.observeScroll(at(929), 10);
    expect(stick.isPinned()).toBe(false);

    stick.observeScroll(at(930), 20);
    expect(stick.isPinned()).toBe(true);
  });

  it("ignores a programmatic scroll until its window ends", () => {
    const stick = new StickToBottom();
    stick.observeScroll(at(1_000), 0);
    stick.setScrollbarDragging(true);
    stick.expectProgrammaticScroll(100, { durationMs: 1_000 });

    stick.observeScroll(at(800), 200);
    expect(stick.isPinned()).toBe(true);

    stick.observeScroll(at(700), 1_200);
    expect(stick.isPinned()).toBe(false);
  });

  it("closes a programmatic window when its target is reached", () => {
    const stick = new StickToBottom();
    stick.observeScroll(at(1_200), 0);
    stick.setScrollbarDragging(true);
    stick.expectProgrammaticScroll(0, { target: 1_000 });

    stick.observeScroll(at(1_000), 50);
    stick.observeScroll(at(900), 60);

    expect(stick.isPinned()).toBe(false);
  });

  it("releases on an upward scrollbar drag even when the content changed", () => {
    const stick = new StickToBottom();
    stick.observeScroll(at(1_000), 0);
    stick.setScrollbarDragging(true);

    stick.observeScroll(at(900, 2_100), 10);

    expect(stick.isPinned()).toBe(false);
  });

  it("pin() resumes following after a release, as on a conversation switch, send, or jump to latest", () => {
    const stick = new StickToBottom();
    stick.observeScroll(at(0), 0);
    stick.release();

    stick.pin();

    expect(stick.isPinned()).toBe(true);
  });

  it("notifies the pinned listener only when the pinned state changes", () => {
    const stick = new StickToBottom();
    const states: boolean[] = [];
    stick.onPinnedChange((pinned) => states.push(pinned));
    stick.observeScroll(at(1_000), 0);

    stick.pin();
    stick.release();
    stick.release();
    stick.observeScroll(at(900), 10);
    stick.pin();
    stick.setScrollbarDragging(true);
    stick.observeScroll(at(800), 20);

    expect(states).toEqual([false, true, false]);
  });

  it("does not loop when a pinned listener pins again from inside the notification", () => {
    const stick = new StickToBottom();
    let calls = 0;
    stick.onPinnedChange((pinned) => {
      calls += 1;
      if (!pinned) stick.pin();
    });

    stick.release();

    expect(calls).toBe(2);
    expect(stick.isPinned()).toBe(true);
  });
});

describe("stick to bottom scroller binding", () => {
  function scrollerWith(scrollHeight: number, clientHeight: number): HTMLDivElement {
    const scroller = document.createElement("div");
    Object.defineProperties(scroller, {
      scrollHeight: { configurable: true, value: scrollHeight },
      clientHeight: { configurable: true, value: clientHeight },
    });
    document.body.append(scroller);
    cleanups.push(() => scroller.remove());
    return scroller;
  }

  it("releases on a wheel up over overflowing content and follows the latest message once pinned again", () => {
    const scroller = scrollerWith(2_000, 500);
    const stick = new StickToBottom();
    const attachment = attachStickToBottom(scroller, stick);
    cleanups.push(() => attachment.dispose());

    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -120 }));
    expect(stick.isPinned()).toBe(false);

    stick.pin();
    attachment.followIfPinned();
    expect(scroller.scrollTop).toBe(2_000);
  });

  it("does not release on a wheel up when the content does not overflow", () => {
    const scroller = scrollerWith(500, 500);
    const stick = new StickToBottom();
    const attachment = attachStickToBottom(scroller, stick);
    cleanups.push(() => attachment.dispose());

    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -120 }));

    expect(stick.isPinned()).toBe(true);
  });

  it("follows through the injected scrollToEnd instead of writing scrollTop", () => {
    const scroller = scrollerWith(2_000, 500);
    const stick = new StickToBottom();
    let ends = 0;
    const attachment = attachStickToBottom(scroller, stick, {
      scrollToEnd: () => {
        ends += 1;
      },
    });
    cleanups.push(() => attachment.dispose());

    attachment.followIfPinned();

    expect(ends).toBe(1);
    expect(scroller.scrollTop).toBe(0);
  });

  it("uses the injected scrollToEnd when the scroller resizes while pinned", () => {
    const scroller = scrollerWith(2_000, 500);
    const stick = new StickToBottom();
    let ends = 0;
    const attachment = attachStickToBottom(scroller, stick, {
      scrollToEnd: () => {
        ends += 1;
      },
    });
    cleanups.push(() => attachment.dispose());

    triggerResize(scroller);

    expect(ends).toBe(1);
  });

  it("does not follow a resize after an explicit release", () => {
    const scroller = scrollerWith(2_000, 500);
    const stick = new StickToBottom();
    let ends = 0;
    const attachment = attachStickToBottom(scroller, stick, {
      scrollToEnd: () => {
        ends += 1;
      },
    });
    cleanups.push(() => attachment.dispose());
    stick.release();

    triggerResize(scroller);

    expect(ends).toBe(0);
  });

  it("stops repeating the follow on frames once the height is stable", async () => {
    const scroller = scrollerWith(2_000, 500);
    const stick = new StickToBottom();
    let ends = 0;
    const attachment = attachStickToBottom(scroller, stick, {
      scrollToEnd: () => {
        ends += 1;
      },
    });
    cleanups.push(() => attachment.dispose());

    triggerResize(scroller);
    for (let frame = 0; frame < 10; frame += 1) await nextFrame();

    expect(ends).toBe(2);
  });

  it("keeps following while the height changes, but only up to the frame limit", async () => {
    const scroller = document.createElement("div");
    let height = 2_000;
    Object.defineProperties(scroller, {
      scrollHeight: {
        configurable: true,
        get: () => {
          height += 10;
          return height;
        },
      },
      clientHeight: { configurable: true, value: 500 },
    });
    document.body.append(scroller);
    cleanups.push(() => scroller.remove());
    const stick = new StickToBottom();
    let ends = 0;
    const attachment = attachStickToBottom(scroller, stick, {
      scrollToEnd: () => {
        ends += 1;
      },
    });
    cleanups.push(() => attachment.dispose());

    triggerResize(scroller);
    for (let frame = 0; frame < 20; frame += 1) await nextFrame();

    // One immediate follow plus five frame follows, then the loop stops.
    expect(ends).toBe(6);
  });
});
