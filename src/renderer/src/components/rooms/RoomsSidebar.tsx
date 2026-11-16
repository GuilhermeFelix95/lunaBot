import type { Room } from "@lunabot/contracts/ipc";
import { createSignal, For, Show } from "solid-js";
import { t } from "../../i18n";
import { AgentAvatar } from "../AgentAvatar";
import {
  AlertDialog,
  ArchiveRestore,
  Button,
  ChevronDown,
  ChevronRight,
  DropdownMenu,
  Ellipsis,
  UserMinus,
} from "../ui";
import { RoomPurgeDialog } from "./RoomDialogs";
import { activeRoomMembers, dismissedRoomMembers, roomBotAvatar, roomManager } from "./room-model";
import type { RoomsStore } from "./rooms-store";

const DISMISSED_GROUP_ID = "rooms:dismissed";
const ARCHIVED_GROUP_ID = "rooms:archived";

interface RoomsSidebarProps {
  store: RoomsStore;
  /** Collapsed sidebar: each active room becomes an icon that opens it. */
  compact?: boolean;
}

export function RoomsSidebar(props: RoomsSidebarProps) {
  const store = props.store;
  const [dismissTarget, setDismissTarget] = createSignal<{ roomId: string; botId: string } | null>(null);
  const [purgeRoomId, setPurgeRoomId] = createSignal<string | null>(null);
  const [purgeName, setPurgeName] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const activeRooms = () => store.rooms().filter((room) => room.status === "active");
  const archivedRooms = () => store.rooms().filter((room) => room.status === "archived");
  const dismissedEntries = () =>
    activeRooms().flatMap((room) => dismissedRoomMembers(room).map((member) => ({ room, member })));
  const roomById = (roomId: string): Room | undefined => store.rooms().find((room) => room.id === roomId);
  const isCollapsed = (id: string) => store.collapsedIds().includes(id);
  const avatarOf = (roomId: string, botId: string) => roomBotAvatar(store.profiles(roomId), botId);

  const dismissEntry = () => {
    const target = dismissTarget();
    const room = target ? roomById(target.roomId) : undefined;
    const member = room?.members.find((item) => item.botId === target?.botId);
    return room && member ? { room, member } : null;
  };
  const purgeEntry = () => {
    const room = purgeRoomId() ? roomById(purgeRoomId() ?? "") : undefined;
    return room ?? null;
  };

  async function confirmDismiss() {
    const target = dismissTarget();
    if (!target || busy()) return;
    setBusy(true);
    const room = await store.dismissMember(target.roomId, target.botId);
    setBusy(false);
    if (room) setDismissTarget(null);
  }

  async function confirmPurge() {
    const room = purgeEntry();
    if (!room || busy() || purgeName().trim() !== room.name.trim()) return;
    setBusy(true);
    const deleted = await store.deleteForever(room.id);
    setBusy(false);
    if (deleted) {
      setPurgeRoomId(null);
      setPurgeName("");
    }
  }

  function renderRoom(room: Room) {
    const collapsed = () => isCollapsed(room.id);
    const manager = roomManager(room);
    const members = activeRoomMembers(room);
    return (
      <li class="rooms-sidebar-room">
        <div class="rooms-sidebar-room-row">
          <button
            type="button"
            class="rooms-sidebar-icon-button"
            aria-expanded={collapsed() ? "false" : "true"}
            aria-label={t("rooms.sidebar.toggle", { name: room.name })}
            onClick={() => store.toggleCollapsed(room.id)}
          >
            <Show when={collapsed()} fallback={<ChevronDown class="size-4" aria-hidden="true" />}>
              <ChevronRight class="size-4" aria-hidden="true" />
            </Show>
          </button>
          <button
            type="button"
            class="rooms-sidebar-room-open"
            aria-current={store.selectedRoomId() === room.id ? "page" : undefined}
            onClick={() => store.openRoom(room.id)}
          >
            <span class="rooms-sidebar-mark" aria-hidden="true">
              {room.name.trim().charAt(0).toUpperCase()}
            </span>
            <span class="rooms-sidebar-room-name">{room.name}</span>
            <Show when={store.hasActivity(room.id)}>
              <span class="rooms-activity-dot" role="img" aria-label={t("rooms.activity.label")} />
            </Show>
            <span class="rooms-sidebar-count">{t("rooms.sidebar.bots", { count: members.length })}</span>
          </button>
        </div>
        <Show when={!collapsed()}>
          <ul class="rooms-sidebar-members">
            <Show when={manager}>
              {(entry) => (
                <li>
                  <button type="button" class="rooms-sidebar-member" onClick={() => store.openRoom(room.id)}>
                    <AgentAvatar {...avatarOf(room.id, entry().botId)} class="rooms-sidebar-avatar" />
                    <span class="rooms-sidebar-member-name">{entry().name}</span>
                    <span class="rooms-badge rooms-badge-manager">{t("rooms.badge.manager")}</span>
                  </button>
                </li>
              )}
            </Show>
            <For each={members}>
              {(member) => (
                <li class="rooms-sidebar-member-row">
                  <button
                    type="button"
                    class="rooms-sidebar-member"
                    onClick={() => store.openRoom(room.id, { tab: "backstage", memberBotId: member.botId })}
                  >
                    <AgentAvatar
                      seed={avatarOf(room.id, member.botId).seed}
                      hue={avatarOf(room.id, member.botId).hue}
                      url={avatarOf(room.id, member.botId).url}
                      class="rooms-sidebar-avatar"
                    />
                    <span class="rooms-sidebar-member-name">{member.name}</span>
                  </button>
                  <DropdownMenu.Root placement="bottom-end" gutter={6} modal={false}>
                    <DropdownMenu.Trigger
                      class="rooms-sidebar-icon-button"
                      aria-label={t("rooms.sidebar.memberActions", { name: member.name })}
                    >
                      <Ellipsis class="size-4" aria-hidden="true" />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content class="ui-action-menu">
                      <DropdownMenu.Item onSelect={() => setDismissTarget({ roomId: room.id, botId: member.botId })}>
                        <UserMinus class="size-4" aria-hidden="true" />
                        <span>{t("rooms.sidebar.dismissMember")}</span>
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </li>
    );
  }

  function renderCompactRooms() {
    return (
      <ul class="rooms-sidebar-compact">
        <For each={activeRooms()}>
          {(room) => (
            <li>
              <button
                type="button"
                class="rooms-sidebar-compact-room"
                aria-current={store.selectedRoomId() === room.id ? "page" : undefined}
                aria-label={room.name}
                title={room.name}
                onClick={() => store.openRoom(room.id)}
              >
                <span class="rooms-sidebar-mark" aria-hidden="true">
                  {room.name.trim().charAt(0).toUpperCase()}
                </span>
                <Show when={store.hasActivity(room.id)}>
                  <span class="rooms-activity-dot" role="img" aria-label={t("rooms.activity.label")} />
                </Show>
              </button>
            </li>
          )}
        </For>
      </ul>
    );
  }

  return (
    <section class="rooms-sidebar" aria-label={t("rooms.sidebar.title")}>
      <Show when={props.compact} fallback={<h2 class="rooms-sidebar-heading">{t("rooms.sidebar.title")}</h2>}>
        {renderCompactRooms()}
      </Show>
      <Show when={!props.compact}>
        <Show when={store.error()}>
          {(key) => (
            <p class="rooms-sidebar-error" role="alert">
              {t(key())}
            </p>
          )}
        </Show>
        <Show when={activeRooms().length > 0} fallback={<p class="rooms-sidebar-empty">{t("rooms.sidebar.empty")}</p>}>
          <ul class="rooms-sidebar-list">
            <For each={activeRooms()}>{(room) => renderRoom(room)}</For>
          </ul>
        </Show>

        <Show when={dismissedEntries().length > 0}>
          <section class="rooms-sidebar-group">
            <button
              type="button"
              class="rooms-sidebar-group-toggle"
              aria-expanded={isCollapsed(DISMISSED_GROUP_ID) ? "false" : "true"}
              onClick={() => store.toggleCollapsed(DISMISSED_GROUP_ID)}
            >
              <Show when={isCollapsed(DISMISSED_GROUP_ID)} fallback={<ChevronDown class="size-4" aria-hidden="true" />}>
                <ChevronRight class="size-4" aria-hidden="true" />
              </Show>
              <span>{t("rooms.sidebar.dismissed")}</span>
            </button>
            <Show when={!isCollapsed(DISMISSED_GROUP_ID)}>
              <ul class="rooms-sidebar-members">
                <For each={dismissedEntries()}>
                  {(entry) => (
                    <li class="rooms-sidebar-member-row">
                      <div class="rooms-sidebar-member" title={entry.room.name}>
                        <AgentAvatar
                          seed={avatarOf(entry.room.id, entry.member.botId).seed}
                          hue={avatarOf(entry.room.id, entry.member.botId).hue}
                          url={avatarOf(entry.room.id, entry.member.botId).url}
                          class="rooms-sidebar-avatar"
                        />
                        <span class="rooms-sidebar-member-name">{entry.member.name}</span>
                        <span class="rooms-badge">{t("rooms.badge.dismissed")}</span>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>
        </Show>

        <Show when={archivedRooms().length > 0}>
          <section class="rooms-sidebar-group">
            <button
              type="button"
              class="rooms-sidebar-group-toggle"
              aria-expanded={isCollapsed(ARCHIVED_GROUP_ID) ? "false" : "true"}
              onClick={() => store.toggleCollapsed(ARCHIVED_GROUP_ID)}
            >
              <Show when={isCollapsed(ARCHIVED_GROUP_ID)} fallback={<ChevronDown class="size-4" aria-hidden="true" />}>
                <ChevronRight class="size-4" aria-hidden="true" />
              </Show>
              <span>{t("rooms.sidebar.archived")}</span>
            </button>
            <Show when={!isCollapsed(ARCHIVED_GROUP_ID)}>
              <ul class="rooms-sidebar-members">
                <For each={archivedRooms()}>
                  {(room) => (
                    <li class="rooms-sidebar-archived">
                      <span class="rooms-sidebar-room-name">{room.name}</span>
                      <div class="rooms-sidebar-archived-actions">
                        <Button size="sm" variant="ghost" disabled={busy()} onClick={() => void store.reopen(room.id)}>
                          <ArchiveRestore class="size-4" aria-hidden="true" />
                          {t("rooms.sidebar.reopen")}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive-ghost"
                          disabled={busy()}
                          onClick={() => {
                            setPurgeName("");
                            setPurgeRoomId(room.id);
                          }}
                        >
                          {t("rooms.sidebar.purge")}
                        </Button>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>
        </Show>
      </Show>

      <AlertDialog.Root
        open={Boolean(dismissEntry())}
        onOpenChange={(open) => {
          if (!open && !busy()) setDismissTarget(null);
        }}
      >
        <Show when={dismissEntry()}>
          {(entry) => (
            <AlertDialog.Portal>
              <AlertDialog.Overlay class="ui-scrim rooms-dialog-backdrop" />
              <AlertDialog.Content class="rooms-dialog">
                <AlertDialog.Title class="rooms-dialog-title">
                  {t("rooms.dismiss.title", { name: entry().member.name, room: entry().room.name })}
                </AlertDialog.Title>
                <AlertDialog.Description class="rooms-dialog-description">
                  {t("rooms.dismiss.description", { name: entry().member.name })}
                </AlertDialog.Description>
                <Show when={store.error()}>{(key) => <p role="alert">{t(key())}</p>}</Show>
                <div class="rooms-dialog-actions">
                  <Button variant="ghost" disabled={busy()} onClick={() => setDismissTarget(null)}>
                    {t("rooms.dismiss.keep")}
                  </Button>
                  <Button variant="destructive" disabled={busy()} onClick={() => void confirmDismiss()}>
                    {t("rooms.dismiss.confirm")}
                  </Button>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          )}
        </Show>
      </AlertDialog.Root>

      <RoomPurgeDialog
        room={purgeEntry()}
        typedName={purgeName()}
        busy={busy()}
        error={store.error()}
        onTypedNameChange={setPurgeName}
        onOpenChange={(open) => {
          if (!open && !busy()) setPurgeRoomId(null);
        }}
        onConfirm={() => void confirmPurge()}
      />
    </section>
  );
}
