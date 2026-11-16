import type { Room, RoomBackstageMessage } from "@lunabot/contracts/ipc";
import { createEffect, createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { toBotProfile } from "../../app-message-projection";
import type { BotProfile } from "../../data";
import { t } from "../../i18n";
import { AgentAvatar } from "../AgentAvatar";
import { MarkdownMessageText } from "../conversation/MarkdownMessageText";
import { TypingDots } from "../TypingDots";
import { ArrowLeft, Button, Eye, File } from "../ui";
import {
  type BackstageConversationState,
  backstageConversations,
  memberLabel,
  type ResponseTime,
  roomBotAvatar,
  selectedBackstageBotId,
} from "./room-model";
import type { RoomsStore } from "./rooms-store";

// Messages taller than this many lines collapse until the reader asks for the rest.
const COLLAPSED_LINES = 14;
// Distance from the end (px) that still counts as "at the end" for following new messages.
const END_THRESHOLD_PX = 24;
const NO_WORKING: ReadonlySet<string> = new Set();

interface RoomBackstageProps {
  store: RoomsStore;
  room: () => Room;
  /**
   * Members that are busy right now. Empty by default: the app's agent states do not include room members yet,
   * so the "working" state needs this set passed in once that wiring exists.
   */
  workingBotIds?: ReadonlySet<string>;
}

type ThreadRow = { kind: "day"; label: string } | { kind: "message"; message: RoomBackstageMessage; own: boolean };

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString()
    ? t("rooms.backstage.today")
    : date.toLocaleDateString([], { day: "numeric", month: "long" });
}

function stateLabel(state: BackstageConversationState): string {
  switch (state) {
    case "done":
      return t("rooms.backstage.state.done");
    case "waiting":
      return t("rooms.backstage.state.waiting");
    case "working":
      return t("rooms.backstage.state.working");
    case "idle":
      return t("rooms.backstage.none");
  }
}

function replyLabel(time: ResponseTime): string {
  switch (time.unit) {
    case "seconds":
      return t("rooms.backstage.reply.seconds", { count: time.value });
    case "minutes":
      return t("rooms.backstage.reply.minutes", { count: time.value });
    case "hours":
      return t("rooms.backstage.reply.hours", { count: time.value });
  }
}

// Read-only view of the room's backstage: one conversation per member, with the selected one on the right.
// Selecting a member writes it to the store's memberFilter, which is the single source of the selection.
export function RoomBackstage(props: RoomBackstageProps) {
  const roomId = () => props.room().id;
  const bots = createMemo((): BotProfile[] => props.store.profiles(roomId()).map(toBotProfile));
  const avatarOf = (botId: string) => roomBotAvatar(props.store.profiles(roomId()), botId);
  const conversations = createMemo(() =>
    backstageConversations(props.room(), props.store.backstage(roomId()), {
      seenAt: props.store.conversationSeen(roomId()),
      workingBotIds: props.workingBotIds ?? NO_WORKING,
    }),
  );
  const selectedBotId = createMemo(() => selectedBackstageBotId(conversations(), props.store.memberFilter()));
  const selected = createMemo(() => conversations().find((item) => item.botId === selectedBotId()) ?? null);
  const rows = createMemo((): ThreadRow[] => {
    const current = selected();
    if (!current) return [];
    const result: ThreadRow[] = [];
    let previousDay = "";
    for (const message of current.messages) {
      const day = new Date(message.createdAt).toDateString();
      if (day !== previousDay) {
        result.push({ kind: "day", label: dayLabel(message.createdAt) });
        previousDay = day;
      }
      result.push({ kind: "message", message, own: message.authorBotId === current.botId });
    }
    return result;
  });

  // Narrow layouts show one column at a time; this says which one. Wide layouts ignore it.
  const [detailOpen, setDetailOpen] = createSignal(false);
  const [focusedBotId, setFocusedBotId] = createSignal<string | null>(null);
  const [linkFailed, setLinkFailed] = createSignal(false);
  const optionElements = new Map<string, HTMLElement>();
  let backButton: HTMLButtonElement | undefined;
  let thread: HTMLDivElement | undefined;
  // Read in scroll and effects only, so it does not need to trigger renders.
  let stickToEnd = true;

  // The option that Tab reaches: the focused one while it exists, otherwise the open conversation.
  const tabStopBotId = () => {
    const focused = focusedBotId();
    return focused !== null && conversations().some((item) => item.botId === focused) ? focused : selectedBotId();
  };

  function choose(botId: string) {
    props.store.setMemberFilter(botId);
    setDetailOpen(true);
    stickToEnd = true;
    // Moves focus to Voltar, which only shows in the narrow layout. On wide layouts the focus stays on the list.
    requestAnimationFrame(() => {
      if (backButton && backButton.offsetParent !== null) backButton.focus();
      else focusOption(botId);
    });
  }

  function focusOption(botId: string) {
    setFocusedBotId(botId);
    optionElements.get(botId)?.focus();
  }

  // The key comes from the option that has focus, so the move starts from that option, not from a signal that may lag.
  function onOptionKeyDown(event: KeyboardEvent, botId: string) {
    const list = conversations();
    const index = list.findIndex((item) => item.botId === botId);
    if (index < 0) return;
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = Math.min(index + 1, list.length - 1);
        break;
      case "ArrowUp":
        next = Math.max(index - 1, 0);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = list.length - 1;
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(botId);
        return;
      default:
        return;
    }
    event.preventDefault();
    const target = list[next];
    if (target) focusOption(target.botId);
  }

  async function openLink(url: string) {
    try {
      await window.lunabot.openUrl(url);
      setLinkFailed(false);
    } catch {
      setLinkFailed(true);
    }
  }

  // Mentions of a member in a message open that member's conversation.
  function selectAgent(botId: string) {
    if (conversations().some((item) => item.botId === botId)) props.store.setMemberFilter(botId);
  }

  // The open conversation counts as read while the backstage tab is shown, including messages that arrive while it
  // is open. The key is a string memo, so the effect runs only when the open conversation or its last message changes.
  const openKey = createMemo(() => {
    const current = selected();
    if (props.store.tab() !== "backstage" || !current) return "";
    return `${current.botId}\n${current.lastMessage?.id ?? ""}`;
  });
  createEffect(
    () => openKey(),
    (key) => {
      if (!key) return;
      const botId = key.split("\n")[0];
      if (botId) props.store.markConversationSeen(roomId(), botId);
    },
  );

  // Follows the newest message only when the reader was already at the end.
  const threadKey = createMemo(
    () => `${selectedBotId() ?? ""}\n${selected()?.lastMessage?.id ?? ""}\n${selected()?.count ?? 0}`,
  );
  createEffect(
    () => threadKey(),
    () => {
      if (stickToEnd && thread) thread.scrollTop = thread.scrollHeight;
    },
  );

  function onThreadScroll(element: HTMLDivElement) {
    stickToEnd = element.scrollHeight - element.scrollTop - element.clientHeight < END_THRESHOLD_PX;
  }

  return (
    <section class="rooms-backstage" aria-label={t("rooms.view.backstage")} data-detail={detailOpen() ? "" : undefined}>
      <Show when={props.store.error() === "rooms.error.backstageFailed"}>
        <p class="rooms-sidebar-error rooms-backstage-error" role="alert">
          {t("rooms.error.backstageFailed")}
        </p>
      </Show>
      <div class="rooms-backstage-list-pane">
        <div class="rooms-backstage-list-head">
          <Eye class="size-3.5" aria-hidden="true" />
          <span>{t("rooms.backstage.readOnly")}</span>
        </div>
        <Show
          when={conversations().length > 0}
          fallback={<p class="rooms-backstage-empty">{t("rooms.view.backstageEmpty")}</p>}
        >
          <div class="rooms-backstage-list" role="listbox" aria-label={t("rooms.backstage.listLabel")}>
            <For each={conversations()}>
              {(conversation) => (
                <button
                  type="button"
                  class="rooms-backstage-item"
                  role="option"
                  aria-selected={selectedBotId() === conversation.botId ? "true" : "false"}
                  tabindex={tabStopBotId() === conversation.botId ? 0 : -1}
                  data-state={conversation.state}
                  ref={(element) => optionElements.set(conversation.botId, element)}
                  onClick={() => choose(conversation.botId)}
                  onKeyDown={(event) => onOptionKeyDown(event, conversation.botId)}
                  onFocus={() => setFocusedBotId(conversation.botId)}
                >
                  <AgentAvatar
                    seed={avatarOf(conversation.botId).seed}
                    hue={avatarOf(conversation.botId).hue}
                    url={avatarOf(conversation.botId).url}
                    class="rooms-backstage-avatar"
                  />
                  <span class="rooms-backstage-item-main">
                    <span class="rooms-backstage-item-top">
                      <strong class="rooms-backstage-name">{memberLabel(conversation, t("rooms.managerTitle"))}</strong>
                      <Show when={conversation.lastMessage}>
                        {(last) => <time datetime={last().createdAt}>{timeLabel(last().createdAt)}</time>}
                      </Show>
                    </span>
                    <span class="rooms-backstage-preview">{conversation.lastMessage ? conversation.preview : ""}</span>
                    <span class="rooms-backstage-item-meta">
                      <span class="rooms-backstage-state">
                        <Show when={conversation.state === "working"}>
                          <TypingDots />
                        </Show>
                        {stateLabel(conversation.state)}
                      </span>
                      <Show when={conversation.count > 0}>
                        <span>{t("rooms.backstage.messageCount", { count: conversation.count })}</span>
                      </Show>
                      <Show when={conversation.responseTime}>{(time) => <span>{replyLabel(time())}</span>}</Show>
                      <Show when={conversation.unread}>
                        <span class="rooms-backstage-unread" role="img" aria-label={t("rooms.backstage.unread")} />
                      </Show>
                    </span>
                  </span>
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>

      <div class="rooms-backstage-detail">
        <Show when={selected()}>
          {(current) => (
            <header class="rooms-backstage-detail-head">
              <button
                type="button"
                class="rooms-backstage-back"
                ref={(element) => {
                  backButton = element;
                }}
                onClick={() => setDetailOpen(false)}
              >
                <ArrowLeft class="size-4" aria-hidden="true" />
                <span>{t("rooms.backstage.back")}</span>
              </button>
              <AgentAvatar
                seed={avatarOf(current().botId).seed}
                hue={avatarOf(current().botId).hue}
                url={avatarOf(current().botId).url}
                class="rooms-backstage-avatar rooms-backstage-detail-avatar"
              />
              <h2 class="rooms-backstage-title">
                {t("rooms.backstage.title", { name: memberLabel(current(), t("rooms.managerTitle")) })}
              </h2>
              <span class="rooms-backstage-detail-meta">
                {stateLabel(current().state)}
                {current().count > 0 ? ` · ${t("rooms.backstage.messageCount", { count: current().count })}` : ""}
              </span>
            </header>
          )}
        </Show>

        <Show when={linkFailed()}>
          <p class="rooms-sidebar-error" role="alert">
            {t("conversation.view.couldNotOpenLink")}
          </p>
        </Show>

        <Show when={selected()} fallback={<p class="rooms-backstage-empty">{t("rooms.view.backstageEmpty")}</p>}>
          {(current) => (
            <div
              class="rooms-backstage-thread"
              role="log"
              aria-live="polite"
              aria-label={t("rooms.backstage.conversationLabel", { name: current().name })}
              ref={(element) => {
                thread = element;
              }}
              onScroll={(event) => onThreadScroll(event.currentTarget)}
            >
              <Show
                when={rows().length > 0}
                fallback={<p class="rooms-backstage-empty">{t("rooms.backstage.emptyConversation")}</p>}
              >
                <For each={rows()}>
                  {(row) =>
                    row.kind === "day" ? (
                      <div class="rooms-backstage-day">
                        <span>{row.label}</span>
                      </div>
                    ) : (
                      <article class="rooms-backstage-bubble" data-own={row.own ? "" : undefined}>
                        <header class="rooms-backstage-bubble-meta">
                          <strong>{row.message.authorName}</strong>
                          <time datetime={row.message.createdAt}>{timeLabel(row.message.createdAt)}</time>
                        </header>
                        <BackstageMessageBody
                          body={row.message.text}
                          bots={bots()}
                          onOpenLink={(url) => void openLink(url)}
                          onSelectAgent={selectAgent}
                        />
                        <Show when={row.message.attachmentNames.length > 0}>
                          <p class="rooms-backstage-attachments">
                            <File class="size-3.5" aria-hidden="true" />
                            <span>
                              {t("rooms.backstage.attachments")}: {row.message.attachmentNames.join(", ")}
                            </span>
                          </p>
                        </Show>
                      </article>
                    )
                  }
                </For>
              </Show>
            </div>
          )}
        </Show>
      </div>
    </section>
  );
}

// One message's markdown, collapsed when it is taller than COLLAPSED_LINES. Measured on the inner block, which
// is not clipped, so the length is known while collapsed.
function BackstageMessageBody(props: {
  body: string;
  bots: BotProfile[];
  onOpenLink: (url: string) => void;
  onSelectAgent: (botId: string) => void;
}) {
  const [long, setLong] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  let outer: HTMLDivElement | undefined;
  let inner: HTMLDivElement | undefined;

  function measure() {
    if (!outer || !inner) return;
    const lineHeight = Number.parseFloat(getComputedStyle(outer).lineHeight);
    const perLine = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 20;
    setLong(inner.offsetHeight > perLine * COLLAPSED_LINES);
  }

  onSettled(() => {
    measure();
    if (!inner) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(inner);
    return () => observer.disconnect();
  });

  return (
    <>
      <div
        class="rooms-backstage-body"
        data-collapsed={long() && !expanded() ? "" : undefined}
        ref={(element) => {
          outer = element;
        }}
      >
        <div
          class="rooms-backstage-body-inner"
          ref={(element) => {
            inner = element;
          }}
        >
          <MarkdownMessageText
            body={props.body}
            bots={props.bots}
            onOpenLink={props.onOpenLink}
            onSelectAgent={props.onSelectAgent}
          />
        </div>
      </div>
      <Show when={long()}>
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={expanded() ? "true" : "false"}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded() ? t("rooms.backstage.showLess") : t("rooms.backstage.showMore")}
        </Button>
      </Show>
    </>
  );
}
