import { MANAGERS_ROOM_ID } from "@lunabot/contracts/ipc";
import { createEffect, createSignal, For, flush, onSettled, Show } from "solid-js";
import { t } from "../../i18n";
import { AgentAvatar } from "../AgentAvatar";
import { Button, UsersRound } from "../ui";
import { roomBotAvatar } from "./room-model";
import type { RoomsStore } from "./rooms-store";

interface ManagersRoomViewProps {
  store: RoomsStore;
  /** Sends the user's text to every active manager. Each manager answers in its own room conversation. */
  onSend: (text: string) => Promise<void>;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// What the user said to the managers and what each one answered, kept only while this view is open.
interface Talk {
  id: string;
  botId: string | null; // null: the user
  text: string;
  createdAt: string;
  to: string[];
}

// The managers room is virtual: a read-only feed of what managers ask each other, plus one box to talk to all of them.
export function ManagersRoomView(props: ManagersRoomViewProps) {
  const [text, setText] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [talk, setTalk] = createSignal<Talk[]>([]);
  const seenReplies = new Set<string>();
  let sentAt = 0;
  let feed: HTMLDivElement | undefined;

  const messages = () => props.store.backstage(MANAGERS_ROOM_ID);
  const nameOf = (botId: string) =>
    props.store.managersRoom()?.members.find((member) => member.botId === botId)?.name ?? botId;
  const avatarOf = (botId: string) => roomBotAvatar(props.store.profiles(MANAGERS_ROOM_ID), botId);

  const managerIds = () => new Set((props.store.managersRoom()?.members ?? []).map((member) => member.botId));

  // Each manager answers in its own room conversation; the answer is echoed here so the user sees it was heard.
  onSettled(() => {
    const unsubscribe = window.lunabot.agent.onEvent((event) => {
      if (event.type !== "conversation" || sentAt === 0 || !managerIds().has(event.snapshot.botId)) return;
      for (const message of event.snapshot.messages) {
        if (message.author !== "assistant" || message.status !== "completed" || !message.text.trim()) continue;
        if (Date.parse(message.createdAt) < sentAt || seenReplies.has(message.id)) continue;
        seenReplies.add(message.id);
        flush(() =>
          setTalk((items) => [
            ...items,
            { id: message.id, botId: event.snapshot.botId, text: message.text, createdAt: message.createdAt, to: [] },
          ]),
        );
      }
    });
    return unsubscribe;
  });

  // New messages arrive at the end, so the feed follows them.
  createEffect(
    () => messages().length + talk().length,
    () => {
      if (feed) feed.scrollTop = feed.scrollHeight;
    },
  );

  async function send(event: SubmitEvent) {
    event.preventDefault();
    const value = text().trim();
    if (!value || sending()) return;
    setSending(true);
    try {
      sentAt = Date.now();
      await props.onSend(value);
      const createdAt = new Date().toISOString();
      setTalk((items) => [
        ...items,
        { id: `user-${createdAt}`, botId: null, text: value, createdAt, to: [...managerIds()] },
      ]);
      setText("");
    } finally {
      setSending(false);
    }
  }

  return (
    <Show when={props.store.managersRoom()}>
      {(room) => (
        <div class="rooms-view managers-room">
          <header class="managers-room-header">
            <span class="rooms-sidebar-mark rooms-sidebar-mark-managers" aria-hidden="true">
              <UsersRound class="size-4" aria-hidden="true" />
            </span>
            <div class="managers-room-heading">
              <h1 class="rooms-view-title">{room().name}</h1>
              <p class="managers-room-subtitle">{t("rooms.managers.subtitle")}</p>
            </div>
          </header>
          <div class="managers-room-feed" ref={feed} role="log" aria-label={room().name}>
            <Show
              when={messages().length > 0 || talk().length > 0}
              fallback={<p class="managers-room-empty">{t("rooms.managers.empty")}</p>}
            >
              <For each={messages()}>
                {(message) => (
                  <article class="managers-room-message">
                    <AgentAvatar
                      seed={avatarOf(message.authorBotId).seed}
                      hue={avatarOf(message.authorBotId).hue}
                      url={avatarOf(message.authorBotId).url}
                      class="managers-room-avatar"
                    />
                    <div class="managers-room-body">
                      <div class="managers-room-meta">
                        <strong>{nameOf(message.authorBotId)}</strong>
                        <span class="managers-room-to">
                          {t("rooms.managers.to", { names: message.recipientBotIds.map(nameOf).join(", ") })}
                        </span>
                        <time class="managers-room-time" datetime={message.createdAt}>
                          {timeLabel(message.createdAt)}
                        </time>
                      </div>
                      <p class="managers-room-text">{message.text}</p>
                      <Show when={message.attachmentNames.length > 0}>
                        <p class="managers-room-files">{message.attachmentNames.join(", ")}</p>
                      </Show>
                    </div>
                  </article>
                )}
              </For>
              <For each={talk()}>
                {(item) => (
                  <article class="managers-room-message">
                    <Show when={item.botId} fallback={<span class="managers-room-avatar" aria-hidden="true" />}>
                      {(botId) => (
                        <AgentAvatar
                          seed={avatarOf(botId()).seed}
                          hue={avatarOf(botId()).hue}
                          url={avatarOf(botId()).url}
                          class="managers-room-avatar"
                        />
                      )}
                    </Show>
                    <div class="managers-room-body">
                      <div class="managers-room-meta">
                        <strong>{item.botId ? nameOf(item.botId) : t("rooms.managers.you")}</strong>
                        <Show when={!item.botId}>
                          <span class="managers-room-to">
                            {t("rooms.managers.to", { names: item.to.map(nameOf).join(", ") })}
                          </span>
                        </Show>
                        <time class="managers-room-time" datetime={item.createdAt}>
                          {timeLabel(item.createdAt)}
                        </time>
                      </div>
                      <p class="managers-room-text">{item.text}</p>
                    </div>
                  </article>
                )}
              </For>
            </Show>
          </div>
          <form class="managers-room-composer" onSubmit={(event) => void send(event)}>
            <textarea
              class="managers-room-input"
              rows={2}
              aria-label={t("rooms.managers.composerLabel")}
              placeholder={t("rooms.managers.composerPlaceholder")}
              value={text()}
              onInput={(event) => setText(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <Button type="submit" disabled={sending() || text().trim().length === 0}>
              {t("rooms.managers.send")}
            </Button>
          </form>
          <p class="managers-room-hint">{t("rooms.managers.hint")}</p>
        </div>
      )}
    </Show>
  );
}
