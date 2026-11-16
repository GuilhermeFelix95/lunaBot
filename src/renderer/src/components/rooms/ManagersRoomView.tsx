import { MANAGERS_ROOM_ID } from "@lunabot/contracts/ipc";
import { createEffect, createMemo, createSignal, For, flush, onSettled, Show } from "solid-js";
import { t } from "../../i18n";
import { AgentAvatar } from "../AgentAvatar";
import { Button, UsersRound } from "../ui";
import { roomBotAvatar } from "./room-model";
import type { RoomsStore } from "./rooms-store";

interface ManagersRoomViewProps {
  store: RoomsStore;
  /** Sends the user's text to the given managers (all of them when none is marked). Each one answers in its own room conversation. */
  onSend: (text: string, botIds: string[]) => Promise<void>;
}

const MANAGER_COLORS = ["#7f77dd", "#1d9e75", "#d85a30", "#d4537e", "#378add"];
const LONG_REPLY = 240;
const MENTION_AT_END = /(^|\s)@([^\s@]*)$/;

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// What the user said to the managers and what each one answered, kept only while this view is open.
interface Talk {
  id: string;
  kind: "round" | "reply";
  botId: string | null; // null: the user
  text: string;
  createdAt: string;
  to: string[];
}

type Entry =
  | { kind: "round" | "reply"; id: string; createdAt: string; botId: string | null; text: string; to: string[] }
  | { kind: "link"; id: string; createdAt: string; botId: string; text: string; to: string[]; files: string[] };

// The managers room is virtual: what managers ask each other, plus a box to talk to all of them or to the ones marked with @.
export function ManagersRoomView(props: ManagersRoomViewProps) {
  const [text, setText] = createSignal("");
  const [mentions, setMentions] = createSignal<string[]>([]);
  const [activeOption, setActiveOption] = createSignal(0);
  const [menuDismissed, setMenuDismissed] = createSignal(false);
  const [expanded, setExpanded] = createSignal<string[]>([]);
  const [sending, setSending] = createSignal(false);
  const [talk, setTalk] = createSignal<Talk[]>([]);
  const seenReplies = new Set<string>();
  let sentAt = 0;
  let feed: HTMLDivElement | undefined;
  let input: HTMLTextAreaElement | undefined;

  const messages = () => props.store.backstage(MANAGERS_ROOM_ID);
  const members = () => props.store.managersRoom()?.members ?? [];
  const nameOf = (botId: string) => members().find((member) => member.botId === botId)?.name ?? botId;
  const colorOf = (botId: string) => {
    const index = members().findIndex((member) => member.botId === botId);
    return MANAGER_COLORS[(index < 0 ? 0 : index) % MANAGER_COLORS.length];
  };
  const avatarOf = (botId: string) => roomBotAvatar(props.store.profiles(MANAGERS_ROOM_ID), botId);
  const managerIds = () => new Set(members().map((member) => member.botId));

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
            {
              id: message.id,
              kind: "reply",
              botId: event.snapshot.botId,
              text: message.text,
              createdAt: message.createdAt,
              to: [],
            },
          ]),
        );
      }
    });
    return unsubscribe;
  });

  // One timeline: the user's rounds, each manager's answers, and what managers ask each other.
  const entries = createMemo<Entry[]>(() => {
    const links: Entry[] = messages().map((message) => ({
      kind: "link",
      id: message.id,
      createdAt: message.createdAt,
      botId: message.authorBotId,
      text: message.text,
      to: message.recipientBotIds,
      files: message.attachmentNames,
    }));
    return [...links, ...talk()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  });

  // New entries arrive at the end, so the feed follows them.
  createEffect(
    () => entries().length,
    () => {
      if (feed) feed.scrollTop = feed.scrollHeight;
    },
  );

  const query = () => MENTION_AT_END.exec(text())?.[2] ?? null;
  const options = createMemo(() => {
    const q = query();
    if (q === null) return [];
    const needle = q.toLowerCase();
    return members().filter(
      (member) => !mentions().includes(member.botId) && member.name.toLowerCase().includes(needle),
    );
  });
  const menuOpen = () => !menuDismissed() && options().length > 0;

  function changeText(value: string) {
    setText(value);
    setActiveOption(0);
    setMenuDismissed(false);
  }

  function mention(botId: string) {
    setMentions((current) => (current.includes(botId) ? current : [...current, botId]));
    setText((value) => value.replace(MENTION_AT_END, "$1"));
    setMenuDismissed(false);
    input?.focus();
  }

  function toggleMention(botId: string) {
    if (mentions().includes(botId)) setMentions((current) => current.filter((id) => id !== botId));
    else mention(botId);
    input?.focus();
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function send(event: SubmitEvent) {
    event.preventDefault();
    const value = text().trim();
    if (!value || sending()) return;
    const targets = mentions().length > 0 ? mentions() : [...managerIds()];
    setSending(true);
    try {
      sentAt = Date.now();
      await props.onSend(value, targets);
      const createdAt = new Date().toISOString();
      setTalk((items) => [
        ...items,
        { id: `user-${createdAt}`, kind: "round", botId: null, text: value, createdAt, to: targets },
      ]);
      setText("");
      setMentions([]);
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
            <fieldset class="managers-room-members" aria-label={t("rooms.managers.members")}>
              <For each={members()}>
                {(member) => (
                  <button
                    type="button"
                    class="managers-room-chip"
                    aria-pressed={mentions().includes(member.botId) ? "true" : "false"}
                    title={member.name}
                    style={`--manager-color: ${colorOf(member.botId)}`}
                    onClick={() => toggleMention(member.botId)}
                  >
                    <AgentAvatar
                      seed={avatarOf(member.botId).seed}
                      hue={avatarOf(member.botId).hue}
                      url={avatarOf(member.botId).url}
                      class="managers-room-chip-avatar"
                    />
                    <span>{member.name}</span>
                  </button>
                )}
              </For>
            </fieldset>
          </header>
          <div class="managers-room-feed" ref={feed} role="log" aria-label={room().name}>
            <Show when={entries().length > 0} fallback={<p class="managers-room-empty">{t("rooms.managers.empty")}</p>}>
              <For each={entries()}>
                {(entry) => (
                  <>
                    <Show when={entry.kind === "round"}>
                      <div class="managers-room-round">
                        <time class="managers-room-round-time" datetime={entry.createdAt}>
                          {timeLabel(entry.createdAt)}
                        </time>
                        <div class="managers-room-me">
                          <span class="managers-room-me-to">
                            <strong>{t("rooms.managers.you")}</strong>{" "}
                            {t("rooms.managers.to", {
                              names:
                                entry.to.length >= members().length
                                  ? t("rooms.managers.everyone")
                                  : entry.to.map(nameOf).join(", "),
                            })}
                          </span>
                          <p class="managers-room-text">{entry.text}</p>
                        </div>
                      </div>
                    </Show>
                    <Show when={entry.kind === "reply" && entry.botId}>
                      {(botId) => (
                        <article class="managers-room-card" style={`--manager-color: ${colorOf(botId())}`}>
                          <AgentAvatar
                            seed={avatarOf(botId()).seed}
                            hue={avatarOf(botId()).hue}
                            url={avatarOf(botId()).url}
                            class="managers-room-avatar"
                          />
                          <div class="managers-room-body">
                            <div class="managers-room-meta">
                              <strong>{nameOf(botId())}</strong>
                              <time class="managers-room-time" datetime={entry.createdAt}>
                                {timeLabel(entry.createdAt)}
                              </time>
                            </div>
                            <p
                              class="managers-room-text"
                              data-clamped={
                                entry.text.length > LONG_REPLY && !expanded().includes(entry.id) ? "" : undefined
                              }
                            >
                              {entry.text}
                            </p>
                            <Show when={entry.text.length > LONG_REPLY}>
                              <button type="button" class="managers-room-more" onClick={() => toggleExpanded(entry.id)}>
                                {expanded().includes(entry.id) ? t("rooms.managers.less") : t("rooms.managers.more")}
                              </button>
                            </Show>
                          </div>
                        </article>
                      )}
                    </Show>
                    <Show when={entry.kind === "link" && entry.botId}>
                      {(botId) => (
                        <p class="managers-room-link">
                          <span class="managers-room-link-head">
                            <strong>{nameOf(botId())}</strong>
                            <span aria-hidden="true">→</span>
                            <span>{entry.to.map(nameOf).join(", ")}</span>
                            <time class="managers-room-time" datetime={entry.createdAt}>
                              {timeLabel(entry.createdAt)}
                            </time>
                          </span>
                          <span class="managers-room-link-text">{entry.text}</span>
                        </p>
                      )}
                    </Show>
                  </>
                )}
              </For>
            </Show>
          </div>
          <form class="managers-room-composer" onSubmit={(event) => void send(event)}>
            <Show when={menuOpen()}>
              <div class="managers-room-menu" role="listbox" aria-label={t("rooms.managers.members")}>
                <For each={options()}>
                  {(member, index) => (
                    <button
                      type="button"
                      role="option"
                      class="managers-room-option"
                      aria-selected={activeOption() === index() ? "true" : "false"}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => mention(member.botId)}
                    >
                      <AgentAvatar
                        seed={avatarOf(member.botId).seed}
                        hue={avatarOf(member.botId).hue}
                        url={avatarOf(member.botId).url}
                        class="managers-room-chip-avatar"
                      />
                      <span>{member.name}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <div class="managers-room-box">
              <For each={mentions()}>
                {(botId) => (
                  <span class="managers-room-tag" style={`--manager-color: ${colorOf(botId)}`}>
                    @{nameOf(botId)}
                    <button
                      type="button"
                      aria-label={t("rooms.managers.removeMention", { name: nameOf(botId) })}
                      onClick={() => toggleMention(botId)}
                    >
                      ×
                    </button>
                  </span>
                )}
              </For>
              <textarea
                ref={input}
                class="managers-room-input"
                rows={2}
                aria-label={t("rooms.managers.composerLabel")}
                placeholder={t("rooms.managers.composerPlaceholder")}
                value={text()}
                onInput={(event) => changeText(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.isComposing) return;
                  if (menuOpen()) {
                    const count = options().length;
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveOption((index) => (index + (event.key === "ArrowDown" ? 1 : count - 1)) % count);
                      return;
                    }
                    if (event.key === "Enter" || event.key === "Tab") {
                      event.preventDefault();
                      mention(options()[activeOption() % count].botId);
                      return;
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setMenuDismissed(true);
                      return;
                    }
                  }
                  if (event.key === "Backspace" && text() === "" && mentions().length > 0) {
                    setMentions((current) => current.slice(0, -1));
                    return;
                  }
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
            </div>
            <div class="managers-room-foot">
              <p class="managers-room-hint">
                {mentions().length > 0 ? t("rooms.managers.hintMentioned") : t("rooms.managers.hintAll")}
              </p>
              <Button type="submit" disabled={sending() || text().trim().length === 0}>
                {t("rooms.managers.send")}
              </Button>
            </div>
          </form>
        </div>
      )}
    </Show>
  );
}
