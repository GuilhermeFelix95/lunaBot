import type { Room, RoomRequest } from "@lunabot/contracts/ipc";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";
import { t } from "../../i18n";
import { Archive, Button, DropdownMenu, Ellipsis, Tabs } from "../ui";
import { RoomArchiveDialog } from "./RoomDialogs";
import { RoomRequestCard } from "./RoomRequestCard";
import { activeRoomMembers, backstageForMember, pendingRoomRequests } from "./room-model";
import type { RoomsStore, RoomTab } from "./rooms-store";

interface RoomViewProps {
  store: RoomsStore;
  roomId: string;
  /** Resolves a general bot's name for hire requests. The request only carries its id. */
  nameOfBot: (botId: string) => string | undefined;
  /** Request whose bot is being created now; its card stays disabled until creation ends. */
  creatingRequestId: string | null;
  onCreateBotForRequest: (request: RoomRequest) => void;
  /** The conversation with the room manager, rendered with the normal conversation and composer. */
  renderConversation: () => JSX.Element;
}

function isRoomTab(value: string): value is RoomTab {
  return value === "conversation" || value === "backstage";
}

export function RoomView(props: RoomViewProps) {
  const room = () => props.store.rooms().find((item) => item.id === props.roomId);

  // Keeps the backstage fresh each time a room opens; later updates arrive through the store's listener.
  createEffect(
    () => props.roomId,
    (roomId) => {
      void props.store.refreshBackstage(roomId);
    },
  );

  return (
    <Show
      when={room()}
      fallback={
        <div class="rooms-view-missing" role="status">
          {t("rooms.view.missing")}
        </div>
      }
    >
      {(current) => (
        <RoomContent
          store={props.store}
          room={current}
          nameOfBot={props.nameOfBot}
          creatingRequestId={props.creatingRequestId}
          onCreateBotForRequest={props.onCreateBotForRequest}
          renderConversation={props.renderConversation}
        />
      )}
    </Show>
  );
}

interface RoomContentProps {
  store: RoomsStore;
  room: () => Room;
  nameOfBot: (botId: string) => string | undefined;
  creatingRequestId: string | null;
  onCreateBotForRequest: (request: RoomRequest) => void;
  renderConversation: () => JSX.Element;
}

function RoomContent(props: RoomContentProps) {
  const store = props.store;
  const [archiveOpen, setArchiveOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  const memberName = (botId: string) => props.room().members.find((member) => member.botId === botId)?.name;
  const isArchived = () => props.room().status === "archived";

  async function answer(request: RoomRequest, decision: "approve" | "reject") {
    if (busy()) return;
    setBusy(true);
    await store.resolveRequest(request.id, decision);
    setBusy(false);
  }

  async function archive() {
    if (busy()) return;
    setBusy(true);
    const archived = await store.archive(props.room().id);
    setBusy(false);
    if (archived) setArchiveOpen(false);
  }

  function targetName(request: RoomRequest): string {
    const botId = request.targetBotId ?? "";
    const name = request.kind === "hire" ? props.nameOfBot(botId) : memberName(botId);
    return name ?? t("rooms.request.unknownBot");
  }

  function backstageList() {
    const filter = () => store.memberFilter();
    const messages = () => {
      const all = store.backstage(props.room().id);
      return filter() ? backstageForMember(all, filter() ?? "") : all;
    };
    return (
      <section class="rooms-backstage" aria-label={t("rooms.view.backstage")}>
        <p class="rooms-view-notice">{t("rooms.view.backstageNotice")}</p>
        <div class="rooms-backstage-filters">
          <Button
            size="sm"
            variant={filter() ? "ghost" : "secondary"}
            aria-pressed={filter() === null ? "true" : "false"}
            onClick={() => store.setMemberFilter(null)}
          >
            {t("rooms.view.allMembers")}
          </Button>
          <For each={activeRoomMembers(props.room())}>
            {(member) => (
              <Button
                size="sm"
                variant={filter() === member.botId ? "secondary" : "ghost"}
                aria-pressed={filter() === member.botId ? "true" : "false"}
                aria-label={t("rooms.view.filterMember", { name: member.name })}
                onClick={() => store.setMemberFilter(member.botId)}
              >
                {member.name}
              </Button>
            )}
          </For>
        </div>
        <Show when={messages().length > 0} fallback={<p class="rooms-view-empty">{t("rooms.view.backstageEmpty")}</p>}>
          <ol class="rooms-backstage-list">
            <For each={messages()}>
              {(message) => (
                <li class="rooms-backstage-message">
                  <div class="rooms-backstage-meta">
                    <strong>{message.authorName}</strong>
                    <span>{message.recipientBotIds.map((botId) => memberName(botId) ?? botId).join(", ")}</span>
                    <time datetime={message.createdAt}>
                      {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </time>
                  </div>
                  <p class="rooms-backstage-text">{message.text}</p>
                  <Show when={message.attachmentNames.length > 0}>
                    <p class="rooms-backstage-attachments">{message.attachmentNames.join(", ")}</p>
                  </Show>
                </li>
              )}
            </For>
          </ol>
        </Show>
      </section>
    );
  }

  return (
    <div class="rooms-view">
      <header class="rooms-view-header">
        <span class="rooms-sidebar-mark" aria-hidden="true">
          {props.room().name.trim().charAt(0).toUpperCase()}
        </span>
        <h1 class="rooms-view-title">{props.room().name}</h1>
        <span class="rooms-badge">
          {props.room().browserMode === "exclusive"
            ? t("rooms.create.browserExclusive")
            : t("rooms.create.browserShared")}
        </span>
        <Show when={!isArchived()}>
          <DropdownMenu.Root placement="bottom-end" gutter={6} modal={false}>
            <DropdownMenu.Trigger class="rooms-sidebar-icon-button" aria-label={t("rooms.view.menu")}>
              <Ellipsis class="size-4" aria-hidden="true" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content class="ui-action-menu">
              <DropdownMenu.Item onSelect={() => setArchiveOpen(true)}>
                <Archive class="size-4" aria-hidden="true" />
                <span>{t("rooms.archive.action")}</span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </Show>
      </header>

      <Show when={isArchived()}>
        <p class="rooms-view-notice" role="status">
          {t("rooms.view.archivedNotice")}
        </p>
      </Show>
      <Show when={store.error()}>
        {(key) => (
          <p class="rooms-sidebar-error" role="alert">
            {t(key())}
          </p>
        )}
      </Show>

      <Tabs.Root
        value={store.tab()}
        onChange={(value) => {
          if (isRoomTab(value)) store.setTab(value);
        }}
        class="rooms-view-tabs"
      >
        <Tabs.List class="rooms-view-tablist">
          <Tabs.Trigger value="conversation" class="rooms-view-tab">
            {t("rooms.view.conversation")}
          </Tabs.Trigger>
          <Tabs.Trigger value="backstage" class="rooms-view-tab">
            {t("rooms.view.backstage")}
            <Show when={store.hasActivity(props.room().id)}>
              <span class="rooms-activity-dot" role="img" aria-label={t("rooms.activity.label")} />
            </Show>
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="conversation" class="rooms-view-panel rooms-view-conversation">
          <Show when={pendingRoomRequests(props.room()).length > 0}>
            <div class="rooms-request-list">
              <For each={pendingRoomRequests(props.room())}>
                {(request) => (
                  <RoomRequestCard
                    request={request}
                    roomName={props.room().name}
                    targetName={targetName(request)}
                    disabled={busy() || isArchived() || props.creatingRequestId === request.id}
                    onCreateBot={() => props.onCreateBotForRequest(request)}
                    onApprove={() => void answer(request, "approve")}
                    onReject={() => void answer(request, "reject")}
                  />
                )}
              </For>
            </div>
          </Show>
          {props.renderConversation()}
        </Tabs.Content>
        <Tabs.Content value="backstage" class="rooms-view-panel">
          {backstageList()}
        </Tabs.Content>
      </Tabs.Root>

      <RoomArchiveDialog
        open={archiveOpen()}
        roomName={props.room().name}
        busy={busy()}
        error={store.error()}
        onOpenChange={(open) => {
          if (!open && !busy()) setArchiveOpen(false);
        }}
        onConfirm={() => void archive()}
      />
    </div>
  );
}
