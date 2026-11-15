import type { Room } from "@lunabot/contracts/ipc";
import { Show } from "solid-js";
import { type TranslationKey, t } from "../../i18n";
import { AlertDialog, Button, Field, Input } from "../ui";
import { canPurgeRoom } from "./room-model";

export interface RoomArchiveDialogProps {
  open: boolean;
  roomName: string;
  busy: boolean;
  error: TranslationKey | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function RoomArchiveDialog(props: RoomArchiveDialogProps) {
  return (
    <AlertDialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay class="ui-scrim rooms-dialog-backdrop" />
        <AlertDialog.Content class="rooms-dialog">
          <AlertDialog.Title class="rooms-dialog-title">
            {t("rooms.archive.title", { name: props.roomName })}
          </AlertDialog.Title>
          <AlertDialog.Description class="rooms-dialog-description">
            {t("rooms.archive.description")}
          </AlertDialog.Description>
          <Show when={props.error}>{(key) => <p role="alert">{t(key())}</p>}</Show>
          <div class="rooms-dialog-actions">
            <Button variant="ghost" disabled={props.busy} onClick={() => props.onOpenChange(false)}>
              {t("rooms.purge.cancel")}
            </Button>
            <Button disabled={props.busy} onClick={() => props.onConfirm()}>
              {t("rooms.archive.confirm")}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export interface RoomPurgeDialogProps {
  /** The archived room to delete, or null when the dialog is closed. */
  room: Room | null;
  typedName: string;
  busy: boolean;
  error: TranslationKey | null;
  onTypedNameChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

// Deleting forever needs the exact room name typed, so a stray click cannot remove the room.
export function RoomPurgeDialog(props: RoomPurgeDialogProps) {
  return (
    <AlertDialog.Root open={props.room !== null} onOpenChange={props.onOpenChange}>
      <Show when={props.room}>
        {(room) => (
          <AlertDialog.Portal>
            <AlertDialog.Overlay class="ui-scrim rooms-dialog-backdrop" />
            <AlertDialog.Content class="rooms-dialog">
              <AlertDialog.Title class="rooms-dialog-title">
                {t("rooms.purge.title", { name: room().name })}
              </AlertDialog.Title>
              <AlertDialog.Description class="rooms-dialog-description">
                {t("rooms.purge.description")}
              </AlertDialog.Description>
              <Field label={t("rooms.purge.typeLabel", { name: room().name })}>
                <Input
                  value={props.typedName}
                  onInput={(event) => props.onTypedNameChange(event.currentTarget.value)}
                />
              </Field>
              <Show when={props.error}>{(key) => <p role="alert">{t(key())}</p>}</Show>
              <div class="rooms-dialog-actions">
                <Button variant="ghost" disabled={props.busy} onClick={() => props.onOpenChange(false)}>
                  {t("rooms.purge.cancel")}
                </Button>
                <Button
                  variant="destructive"
                  disabled={props.busy || !canPurgeRoom(room(), props.typedName)}
                  onClick={() => props.onConfirm()}
                >
                  {t("rooms.purge.confirm")}
                </Button>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        )}
      </Show>
    </AlertDialog.Root>
  );
}
