import { render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORY_UPDATE_STATUS } from "./fixtures";
import { LunaBotPlayground } from "./LunaBotPlayground";
import { createLandingDemoController } from "./landing-demo";
import { createMockLunaBot } from "./mock-lunabot";

describe("LunaBotPlayground", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("installs the mock desktop API and restores the previous API on cleanup", () => {
    const previousMock = createMockLunaBot();
    const activeMock = createMockLunaBot();
    const dispose = vi.spyOn(activeMock, "dispose");
    const subscribe = vi.spyOn(activeMock, "onLatestConversationOpened");
    window.lunabot = previousMock.api;

    const view = render(() => (
      <LunaBotPlayground
        dependencies={{
          createMock: () => activeMock,
          renderApp: () => <div data-testid="lunabot-app" />,
        }}
      />
    ));
    expect(view.getByTestId("lunabot-app")).toBeInTheDocument();
    expect(window.lunabot).toBe(activeMock.api);
    expect(subscribe).not.toHaveBeenCalled();

    view.unmount();
    expect(dispose).toHaveBeenCalledOnce();
    expect(window.lunabot).toBe(previousMock.api);
    previousMock.dispose();
  });

  it("advances a mocked update download until it is ready", async () => {
    vi.useFakeTimers();
    const mock = createMockLunaBot({ updateStatus: STORY_UPDATE_STATUS });
    const listener = vi.fn();
    const unsubscribe = mock.api.update.onEvent(listener);

    await expect(mock.api.update.download()).resolves.toMatchObject({ phase: "downloading", progress: 0 });
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "downloading", progress: 0 }));

    vi.advanceTimersByTime(700);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "downloading", progress: 64 }));

    vi.advanceTimersByTime(700);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "ready", progress: 100 }));

    unsubscribe();
    mock.dispose();
  });

  it("reports ready and accepts a same-origin start message only from its parent", async () => {
    vi.useFakeTimers();
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 1;
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      const frame = nextFrame;
      nextFrame += 1;
      frames.set(frame, callback);
      return frame;
    });
    const cancelAnimationFrame = vi.fn((frame: number) => frames.delete(frame));
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
    const parentFrame = document.createElement("iframe");
    document.body.append(parentFrame);
    const parentWindow = parentFrame.contentWindow;
    if (!parentWindow) throw new Error("Expected a parent window");
    const previousParent = Object.getOwnPropertyDescriptor(window, "parent");
    Object.defineProperty(window, "parent", { configurable: true, value: parentWindow });

    const activeMock = createMockLunaBot();
    const updateConversation = vi.spyOn(activeMock, "updateConversationSnapshot");
    const postMessage = vi.spyOn(parentWindow, "postMessage");
    const view = render(() => (
      <LunaBotPlayground
        variant="landing"
        dependencies={{
          createMock: () => activeMock,
          loadLandingController: async () => ({ createLandingDemoController }),
          renderApp: () => <div data-testid="landing-handshake-app" />,
        }}
      />
    ));

    expect(postMessage).not.toHaveBeenCalled();
    frames.get(1)?.(0);
    expect(postMessage).not.toHaveBeenCalled();
    frames.get(2)?.(16);
    expect(postMessage).toHaveBeenCalledWith({ type: "lunabot:landing-preview-ready" }, window.location.origin);
    vi.advanceTimersByTime(250);
    expect(postMessage).toHaveBeenCalledTimes(2);
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://invalid.example",
        source: parentWindow,
        data: { type: "lunabot:landing-preview-start" },
      }),
    );
    expect(updateConversation).not.toHaveBeenCalled();

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        source: parentWindow,
        data: { type: "lunabot:landing-preview-start" },
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(updateConversation).toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(postMessage).toHaveBeenCalledTimes(2);

    view.unmount();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(2);
    parentFrame.remove();
    if (previousParent) Object.defineProperty(window, "parent", previousParent);
  });
});
