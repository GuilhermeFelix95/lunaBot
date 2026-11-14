import type { BrowserDisplayState } from "@lunabot/contracts/ipc";
import { render } from "@solidjs/web";
import { createSignal, onCleanup, onSettled, Show } from "solid-js";
import { t } from "./i18n";
import "./styles.css";

function BrowserPictureInPicture() {
  const [state, setState] = createSignal<BrowserDisplayState>({ tabs: [], activeTabId: null });
  let surface: HTMLDivElement | undefined;
  let stateRevision = 0;
  let boundsFrame: number | undefined;

  const applyState = (next: BrowserDisplayState) => {
    stateRevision += 1;
    setState(next);
  };

  const syncBounds = () => {
    if (!surface) return;
    const bounds = surface.getBoundingClientRect();
    void window.lunabot.browser.setVisible({
      visible: true,
      target: "picture-in-picture",
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    });
  };

  const scheduleBoundsSync = () => {
    if (boundsFrame !== undefined) cancelAnimationFrame(boundsFrame);
    boundsFrame = requestAnimationFrame(() => {
      boundsFrame = undefined;
      syncBounds();
    });
  };

  const removeDisplayState = window.lunabot.browser.onDisplayState(applyState);

  onSettled(() => {
    const requestedAtRevision = stateRevision;
    void window.lunabot.browser.getDisplayState().then((next) => {
      if (stateRevision === requestedAtRevision) applyState(next);
    });
    const observer = new ResizeObserver(scheduleBoundsSync);
    if (surface) observer.observe(surface);
    window.addEventListener("resize", scheduleBoundsSync);
    scheduleBoundsSync();
    onCleanup(() => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleBoundsSync);
    });
  });

  onCleanup(() => {
    if (boundsFrame !== undefined) cancelAnimationFrame(boundsFrame);
    removeDisplayState();
    void window.lunabot.browser.setVisible({ visible: false, target: "picture-in-picture" });
  });

  return (
    <aside class="browser-pip-window" aria-label={t("misc.pip.label")}>
      <div class="browser-surface browser-pip-surface" ref={surface}>
        <Show when={state().tabs.length === 0}>
          <div class="browser-empty-state">
            <strong>{t("misc.pip.openPage")}</strong>
            <span>{t("misc.pip.agentCanBrowse")}</span>
          </div>
        </Show>
      </div>
    </aside>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Could not locate the PiP root element in this window.");
render(() => <BrowserPictureInPicture />, root);
