export const STICK_TO_BOTTOM_RESUME_DISTANCE = 70;
export const PROGRAMMATIC_SCROLL_WINDOW_MS = 1_000;

const POSITION_TOLERANCE_PX = 2;
const MOVEMENT_TOLERANCE_PX = 1;

export interface StickScrollSnapshot {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export function distanceFromBottom(snapshot: StickScrollSnapshot): number {
  return snapshot.scrollHeight - snapshot.scrollTop - snapshot.clientHeight;
}

/**
 * Whether the conversation follows new content. It changes only on user intent or on
 * explicit app actions, never because a scroll event was measured after content grew.
 */
export class StickToBottom {
  #pinned = true;
  #pinnedListeners = new Set<(pinned: boolean) => void>();
  #lastScrollTop = 0;
  #programmatic: { target: number | undefined; until: number } | undefined;
  #scrollbarDragging = false;

  isPinned(): boolean {
    return this.#pinned;
  }

  /** Called with the new state each time the pinned state changes, never when it stays the same. */
  onPinnedChange(listener: (pinned: boolean) => void): void {
    this.#pinnedListeners.add(listener);
  }

  /** Conversation opened or switched, a message was sent, or the user asked for the latest message. */
  pin(): void {
    this.#setPinned(true);
  }

  /** Explicit user intent to read older content: wheel, touch, keys, search, or the unread jump. */
  release(): void {
    this.#setPinned(false);
    this.#programmatic = undefined;
  }

  #setPinned(pinned: boolean): void {
    if (this.#pinned === pinned) return;
    this.#pinned = pinned;
    for (const listener of this.#pinnedListeners) listener(pinned);
  }

  /** Marks a scroll the app starts, so its scroll events are not read as user intent. */
  expectProgrammaticScroll(now: number, options: { target?: number; durationMs?: number } = {}): void {
    this.#programmatic = {
      target: options.target,
      until: now + (options.durationMs ?? PROGRAMMATIC_SCROLL_WINDOW_MS),
    };
  }

  setScrollbarDragging(active: boolean): void {
    this.#scrollbarDragging = active;
  }

  /**
   * Reads one scroll event. Content that grew or shrank under the viewport never releases the
   * stick, and neither does a bare upward scroll: wheel, touch and keys release through their own
   * events, and an upward scroll while the scrollbar is dragged releases here. Scrolling back down
   * to the end resumes it.
   */
  observeScroll(snapshot: StickScrollSnapshot, now: number): void {
    const previousTop = this.#lastScrollTop;
    this.#lastScrollTop = snapshot.scrollTop;

    const programmatic = this.#programmatic;
    if (programmatic && now < programmatic.until) {
      if (
        programmatic.target !== undefined &&
        Math.abs(snapshot.scrollTop - programmatic.target) <= POSITION_TOLERANCE_PX
      ) {
        this.#programmatic = undefined;
      }
      return;
    }
    this.#programmatic = undefined;

    if (snapshot.scrollTop < previousTop - MOVEMENT_TOLERANCE_PX) {
      // Wheel, touch and keys release on their own events. A bare upward scroll cannot be told from layout that
      // grew and shrank between two frames, so only a scrollbar drag counts as the reader moving up.
      if (this.#scrollbarDragging) this.#setPinned(false);
      return;
    }
    if (snapshot.scrollTop > previousTop && distanceFromBottom(snapshot) <= STICK_TO_BOTTOM_RESUME_DISTANCE) {
      this.#setPinned(true);
    }
  }
}

export interface StickToBottomAttachment {
  observe(element: Element): void;
  followIfPinned(): void;
  dispose(): void;
}

export interface StickToBottomOptions {
  /**
   * Jumps to the real end of the list. Virtualized lists need it because scrollHeight there is
   * only an estimate; without it the scroller is set to scrollHeight directly.
   */
  scrollToEnd?: () => void;
}

const SETTLE_FRAME_LIMIT = 5;

/**
 * Connects a StickToBottom state to a scroller's DOM events. Growth is followed instantly
 * while pinned, then again on the next frames while the height keeps changing.
 */
export function attachStickToBottom(
  scroller: HTMLElement,
  stick: StickToBottom,
  options: StickToBottomOptions = {},
): StickToBottomAttachment {
  const canScroll = () => scroller.scrollHeight > scroller.clientHeight;
  const followBottom = () => {
    if (options.scrollToEnd) options.scrollToEnd();
    else scroller.scrollTop = scroller.scrollHeight;
  };

  let settleFrame: number | undefined;
  const followAndSettle = () => {
    followBottom();
    if (settleFrame !== undefined) cancelAnimationFrame(settleFrame);
    let lastHeight = scroller.scrollHeight;
    let frames = 0;
    const settleStep = () => {
      settleFrame = undefined;
      if (!stick.isPinned()) return;
      followBottom();
      frames += 1;
      const height = scroller.scrollHeight;
      if (height === lastHeight || frames >= SETTLE_FRAME_LIMIT) return;
      lastHeight = height;
      settleFrame = requestAnimationFrame(settleStep);
    };
    settleFrame = requestAnimationFrame(settleStep);
  };

  const resizeObserver = new ResizeObserver(() => {
    if (stick.isPinned()) followAndSettle();
  });
  resizeObserver.observe(scroller);

  let lastTouchY: number | undefined;
  const endScrollbarDrag = () => {
    stick.setScrollbarDragging(false);
    window.removeEventListener("pointerup", endScrollbarDrag);
    window.removeEventListener("pointercancel", endScrollbarDrag);
  };

  const onScroll = () => {
    stick.observeScroll(
      { scrollTop: scroller.scrollTop, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight },
      performance.now(),
    );
  };
  const onWheel = (event: WheelEvent) => {
    if (event.deltaY < 0 && canScroll()) stick.release();
  };
  const onTouchStart = (event: TouchEvent) => {
    lastTouchY = event.touches[0]?.clientY;
  };
  const onTouchMove = (event: TouchEvent) => {
    const y = event.touches[0]?.clientY;
    if (y === undefined) return;
    if (lastTouchY !== undefined && y > lastTouchY && canScroll()) stick.release();
    lastTouchY = y;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!canScroll() || isEditableTarget(event.target)) return;
    const scrollsUp =
      event.key === "PageUp" ||
      event.key === "Home" ||
      event.key === "ArrowUp" ||
      (event.key === " " && event.shiftKey);
    if (scrollsUp) stick.release();
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.target !== scroller || event.offsetX < scroller.clientWidth) return;
    stick.setScrollbarDragging(true);
    window.addEventListener("pointerup", endScrollbarDrag);
    window.addEventListener("pointercancel", endScrollbarDrag);
  };

  // A hidden or covered window does not render, so growth that arrived meanwhile is only laid out
  // once it is shown again. Catch up then instead of waiting for the next message.
  const catchUpWhenShown = () => {
    if (document.visibilityState === "hidden" || !stick.isPinned()) return;
    followAndSettle();
  };
  document.addEventListener("visibilitychange", catchUpWhenShown);
  window.addEventListener("focus", catchUpWhenShown);

  const passive = { passive: true };
  scroller.addEventListener("scroll", onScroll, passive);
  scroller.addEventListener("wheel", onWheel, passive);
  scroller.addEventListener("touchstart", onTouchStart, passive);
  scroller.addEventListener("touchmove", onTouchMove, passive);
  scroller.addEventListener("keydown", onKeyDown);
  scroller.addEventListener("pointerdown", onPointerDown);

  return {
    observe(element) {
      resizeObserver.observe(element);
    },
    followIfPinned() {
      if (stick.isPinned()) followBottom();
    },
    dispose() {
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("keydown", onKeyDown);
      scroller.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("visibilitychange", catchUpWhenShown);
      window.removeEventListener("focus", catchUpWhenShown);
      endScrollbarDrag();
      resizeObserver.disconnect();
      if (settleFrame !== undefined) cancelAnimationFrame(settleFrame);
      settleFrame = undefined;
    },
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
}
