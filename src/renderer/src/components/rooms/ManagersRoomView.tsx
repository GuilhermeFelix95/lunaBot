import { createSignal, Show } from "solid-js";
import { t } from "../../i18n";
import { Button } from "../ui";
import { RoomBackstage } from "./RoomBackstage";
import type { RoomsStore } from "./rooms-store";

interface ManagersRoomViewProps {
  store: RoomsStore;
  workingBotIds?: ReadonlySet<string>;
  /** Sends the user's text to every active manager. Each manager answers in its own room conversation. */
  onSend: (text: string) => Promise<void>;
}

// The managers room is virtual: a read-only feed of what managers ask each other, plus one box to talk to all of them.
export function ManagersRoomView(props: ManagersRoomViewProps) {
  const [text, setText] = createSignal("");
  const [sending, setSending] = createSignal(false);

  async function send(event: SubmitEvent) {
    event.preventDefault();
    const value = text().trim();
    if (!value || sending()) return;
    setSending(true);
    try {
      await props.onSend(value);
      setText("");
    } finally {
      setSending(false);
    }
  }

  return (
    <Show when={props.store.managersRoom()}>
      {(room) => (
        <div class="rooms-view">
          <header class="rooms-view-header">
            <span class="rooms-sidebar-mark" aria-hidden="true">
              {room().name.trim().charAt(0).toUpperCase()}
            </span>
            <h1 class="rooms-view-title">{room().name}</h1>
          </header>
          <div class="rooms-view-panel rooms-view-backstage">
            <RoomBackstage store={props.store} room={room} workingBotIds={props.workingBotIds} />
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
        </div>
      )}
    </Show>
  );
}
