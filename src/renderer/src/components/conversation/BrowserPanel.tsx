import { INPUT_LIMITS } from "@lunabot/contracts/input-limits";
import type { BrowserControlAction, BrowserControlSession, BrowserTab } from "@lunabot/contracts/ipc";
import { createEffect, createSignal, For, Show } from "solid-js";
import type { BotProfile } from "../../data";
import { type TranslationKey, t } from "../../i18n";
import { PanelResizer, readPanelWidth, savePanelWidth } from "../PanelResizer";
import { Button, buttonVariants, Input, PictureInPicture2, Tabs } from "../ui";
import {
  BrowserBackIcon,
  BrowserControlIcon,
  BrowserForwardIcon,
  BrowserReloadIcon,
  CloseIcon,
  PlusIcon,
} from "./ConversationIcons";

const BROWSER_PANEL_STORAGE_KEY = "lunabot:browser-panel-width";
const BROWSER_PANEL_MIN = 220;
const BROWSER_PANEL_MAX = 1600;
const BROWSER_ACTION_LABELS: Record<BrowserControlAction, TranslationKey> = {
  open: "conversation.browser.action.open",
  "list-tabs": "conversation.browser.action.listTabs",
  snapshot: "conversation.browser.action.snapshot",
  click: "conversation.browser.action.click",
  type: "conversation.browser.action.type",
  key: "conversation.browser.action.key",
  scroll: "conversation.browser.action.scroll",
  back: "conversation.browser.action.back",
  forward: "conversation.browser.action.forward",
  reload: "conversation.browser.action.reload",
  screenshot: "conversation.browser.action.screenshot",
  "close-tab": "conversation.browser.action.closeTab",
};

interface BrowserPanelProps {
  tabs: BrowserTab[];
  activeTab: BrowserTab | undefined;
  activeControl: BrowserControlSession | undefined;
  address: string;
  defaultWidth: () => number;
  maxWidth: () => number;
  controlForTab: (tab: BrowserTab) => BrowserControlSession | undefined;
  controllerForTab: (tab: BrowserTab) => BotProfile | undefined;
  onAddressChange: (value: string) => void;
  onAddressEditingChange: (editing: boolean) => void;
  onOpenAddress: (address?: string) => void;
  onNavigate: (tabId: string, direction: "back" | "forward") => void;
  onReload: (tabId: string) => void;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onSurface: (element: HTMLDivElement) => void;
  onWidthChange: (width: number) => void;
  onEnterPip: () => void;
}

export default function BrowserPanel(props: BrowserPanelProps) {
  const actingControl = () => (props.activeControl?.phase === "acting" ? props.activeControl : undefined);
  const defaultPanelWidth = () =>
    Math.round(Math.min(BROWSER_PANEL_MAX, Math.max(BROWSER_PANEL_MIN, props.defaultWidth())));
  const storedPanelWidth = Number.parseFloat(window.localStorage.getItem(BROWSER_PANEL_STORAGE_KEY) ?? "");
  let customPanelWidth = Number.isFinite(storedPanelWidth);
  let savedCustomPanelWidth = customPanelWidth ? storedPanelWidth : null;
  const [panelWidth, setPanelWidth] = createSignal(
    readPanelWidth(BROWSER_PANEL_STORAGE_KEY, defaultPanelWidth(), BROWSER_PANEL_MIN, BROWSER_PANEL_MAX),
  );
  createEffect(
    () => panelWidth(),
    (width) => {
      props.onWidthChange(width);
    },
  );

  const resizePanel = (width: number) => {
    setPanelWidth(width);
  };

  const saveCustomPanelWidth = (width: number) => {
    customPanelWidth = true;
    savedCustomPanelWidth = width;
    savePanelWidth(BROWSER_PANEL_STORAGE_KEY, width);
  };

  const resizeDefaultPanel = () => {
    const preferredWidth =
      customPanelWidth && savedCustomPanelWidth !== null ? savedCustomPanelWidth : defaultPanelWidth();
    setPanelWidth(Math.round(Math.min(props.maxWidth(), Math.max(BROWSER_PANEL_MIN, preferredWidth))));
  };

  const resetPanelWidth = () => {
    window.localStorage.removeItem(BROWSER_PANEL_STORAGE_KEY);
    customPanelWidth = false;
    savedCustomPanelWidth = null;
    setPanelWidth(defaultPanelWidth());
  };

  const surface = () => (
    <div class="browser-surface" ref={props.onSurface}>
      <Show when={props.tabs.length === 0}>
        <div class="browser-empty-state">
          <strong>{t("conversation.browser.openPage")}</strong>
          <span>{t("conversation.browser.emptyHint")}</span>
        </div>
      </Show>
    </div>
  );

  const addressBar = () => (
    <form
      class="browser-address-bar"
      onSubmit={(event) => {
        event.preventDefault();
        props.onOpenAddress();
      }}
    >
      <Input
        value={props.address}
        aria-label={t("conversation.browser.address")}
        maxlength={INPUT_LIMITS.browserUrl}
        onValueChange={props.onAddressChange}
        onFocus={() => props.onAddressEditingChange(true)}
        onBlur={() => props.onAddressEditingChange(false)}
      />
    </form>
  );

  return (
    <Tabs.Root
      as="aside"
      id="browser-side-panel"
      class={["browser-panel", { "browser-panel-controlled": Boolean(actingControl()) }]}
      aria-label={t("conversation.browser.region")}
      value={props.activeTab?.id ?? "__empty"}
      onChange={props.onActivateTab}
      activationMode="automatic"
    >
      <PanelResizer
        class="right-panel-resizer"
        label={t("conversation.browser.resize")}
        controls="browser-side-panel"
        direction="right"
        value={panelWidth()}
        defaultValue={defaultPanelWidth()}
        min={BROWSER_PANEL_MIN}
        max={props.maxWidth}
        onResize={resizePanel}
        onResizeEnd={saveCustomPanelWidth}
        onParentResize={resizeDefaultPanel}
        onReset={resetPanelWidth}
      />
      <header class="browser-panel-header">
        <div class="browser-tabs">
          <Tabs.List class="browser-tab-strip" aria-label={t("conversation.browser.tabs")}>
            <For each={props.tabs}>
              {(tab) => {
                const control = () => {
                  const session = props.controlForTab(tab);
                  return session?.phase === "acting" ? session : undefined;
                };
                const controller = () => props.controllerForTab(tab);
                const title = () => (tab.loading ? t("conversation.browser.loading") : tab.title || tab.url);
                return (
                  <div
                    role="presentation"
                    class={["browser-tab-wrap", { "browser-tab-controlled": Boolean(control()) }]}
                  >
                    <Tabs.Trigger
                      as="button"
                      value={tab.id}
                      aria-label={
                        control()
                          ? t("conversation.browser.controlledBy", {
                              title: title(),
                              name: controller()?.name ?? t("conversation.common.agentNameLower"),
                            })
                          : title()
                      }
                      aria-description={t("conversation.browser.closeHint")}
                      class={buttonVariants({ variant: "ghost", class: "browser-tab" })}
                      onPointerDown={(event) => {
                        if (event.button !== 1) return;
                        event.preventDefault();
                        event.stopPropagation();
                        props.onCloseTab(tab.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Delete") return;
                        event.preventDefault();
                        props.onCloseTab(tab.id);
                      }}
                    >
                      <Show when={control()}>
                        {(session) => (
                          <span
                            class="browser-tab-control browser-tab-control-acting"
                            title={t("conversation.browser.actionTitle", {
                              name: controller()?.name ?? t("conversation.common.agentName"),
                              action: t(BROWSER_ACTION_LABELS[session().action]),
                            })}
                          >
                            <BrowserControlIcon />
                          </span>
                        )}
                      </Show>
                      <span class="browser-tab-title">{title()}</span>
                      <span
                        class="browser-tab-close"
                        aria-hidden="true"
                        title={t("conversation.browser.closeTabTitle", {
                          title: tab.title || t("conversation.browser.tabFallback"),
                        })}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (event.button === 1) props.onCloseTab(tab.id);
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          props.onCloseTab(tab.id);
                        }}
                      >
                        <CloseIcon />
                      </span>
                    </Tabs.Trigger>
                  </div>
                );
              }}
            </For>
          </Tabs.List>
          <Button
            variant="ghost"
            type="button"
            class="browser-new-tab"
            aria-label={t("conversation.browser.newTab")}
            onClick={() => {
              props.onAddressChange("https://www.google.com");
              props.onOpenAddress("https://www.google.com");
            }}
          >
            <PlusIcon />
          </Button>
        </div>
      </header>
      <Tabs.Content forceMount value={props.activeTab?.id ?? "__empty"} class="browser-tab-panel">
        <div class="browser-toolbar">
          <Button
            variant="ghost"
            type="button"
            aria-label={t("conversation.browser.back")}
            class="browser-toolbar-button"
            disabled={!props.activeTab}
            onClick={() => props.activeTab && props.onNavigate(props.activeTab.id, "back")}
          >
            <BrowserBackIcon />
          </Button>
          <Button
            variant="ghost"
            type="button"
            aria-label={t("conversation.browser.forward")}
            class="browser-toolbar-button"
            disabled={!props.activeTab}
            onClick={() => props.activeTab && props.onNavigate(props.activeTab.id, "forward")}
          >
            <BrowserForwardIcon />
          </Button>
          <Button
            variant="ghost"
            type="button"
            aria-label={t("conversation.browser.reload")}
            class="browser-toolbar-button"
            disabled={!props.activeTab}
            onClick={() => props.activeTab && props.onReload(props.activeTab.id)}
          >
            <BrowserReloadIcon />
          </Button>
          {addressBar()}
          <Button
            variant="ghost"
            type="button"
            class="browser-toolbar-button"
            aria-label={t("conversation.browser.pip")}
            onClick={props.onEnterPip}
          >
            <PictureInPicture2 class="browser-toolbar-icon" />
          </Button>
        </div>
        {surface()}
      </Tabs.Content>
    </Tabs.Root>
  );
}
