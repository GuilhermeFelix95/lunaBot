import { INPUT_LIMITS } from "@lunabot/contracts/input-limits";
import type { Room, RoomBrowserMode } from "@lunabot/contracts/ipc";
import { ROOM_ACTIVE_BOT_LIMIT, ROOM_NAME_MAX_LENGTH } from "@lunabot/contracts/ipc";
import { createSignal, For, Show } from "solid-js";
import { t } from "../../i18n";
import { createFirstBotDraft } from "../first-bot/model";
import { Button, Checkbox, Dialog, Field, Input, RadioGroup } from "../ui";
import { canSelectRoomBot, roomNameError, toggleRoomBot } from "./room-model";

const BROWSER_MODES: RoomBrowserMode[] = ["exclusive", "shared"];
const DEFAULT_BROWSER_MODE: RoomBrowserMode = "exclusive";

export interface RoomBotOption {
  id: string;
  name: string;
  title: string;
}

const BROWSER_MODE_LABEL_KEYS = {
  exclusive: "rooms.create.browserExclusive",
  shared: "rooms.create.browserShared",
} as const;

const BROWSER_MODE_HINT_KEYS = {
  exclusive: "rooms.create.browserExclusiveHint",
  shared: "rooms.create.browserSharedHint",
} as const;

interface CreateRoomDialogProps {
  open: boolean;
  // General bots that can be hired into the room. Bots already in another room are not listed.
  bots: RoomBotOption[];
  onOpenChange: (open: boolean) => void;
  onCreated: (room: Room) => void;
}

interface CreateRoomFormProps {
  bots: RoomBotOption[];
  onOpenChange: (open: boolean) => void;
  onCreated: (room: Room) => void;
}

// Mounted only while the dialog content is open, so every opening starts from an empty form.
function CreateRoomForm(props: CreateRoomFormProps) {
  const [name, setName] = createSignal("");
  const [managerName, setManagerName] = createSignal("");
  const [nameError, setNameError] = createSignal<string | null>(null);
  const [selectedBotIds, setSelectedBotIds] = createSignal<string[]>([]);
  const [browserMode, setBrowserMode] = createSignal<RoomBrowserMode>(DEFAULT_BROWSER_MODE);
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function submit(): Promise<void> {
    if (submitting()) return;
    const nameProblem = roomNameError(name());
    if (nameProblem) {
      setNameError(
        nameProblem === "required"
          ? t("rooms.create.nameRequired")
          : t("rooms.create.nameTooLong", { max: ROOM_NAME_MAX_LENGTH }),
      );
      return;
    }
    setNameError(null);
    setError(null);
    setSubmitting(true);
    // The manager's avatar comes from the same draft the first-bot setup uses.
    const draft = createFirstBotDraft();
    try {
      const room = await window.lunabot.rooms.create({
        name: name().trim(),
        browserMode: browserMode(),
        memberBotIds: selectedBotIds(),
        manager: {
          name: managerName().trim() || t("rooms.managerName"),
          title: t("rooms.managerTitle"),
          description: t("rooms.managerDescription"),
          avatarSeed: draft.avatarSeed,
          avatarHue: draft.avatarHue,
        },
      });
      props.onCreated(room);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("rooms.create.failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      class="rooms-create-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field label={t("rooms.create.nameLabel")} error={nameError() ?? undefined}>
        <Input
          value={name()}
          maxlength={ROOM_NAME_MAX_LENGTH}
          placeholder={t("rooms.create.namePlaceholder")}
          autocomplete="off"
          onValueChange={setName}
        />
      </Field>

      <Field label={t("rooms.create.managerLabel")} description={t("rooms.create.managerHint")}>
        <Input
          value={managerName()}
          maxlength={INPUT_LIMITS.agentName}
          placeholder={t("rooms.managerName")}
          autocomplete="off"
          onValueChange={setManagerName}
        />
      </Field>

      <fieldset class="rooms-create-bots">
        <legend class="ui-label">{t("rooms.create.botsLabel")}</legend>
        <p class="rooms-create-hint">{t("rooms.create.botsHint")}</p>
        <Show when={props.bots.length > 0} fallback={<p class="rooms-create-hint">{t("rooms.create.botsEmpty")}</p>}>
          <ul class="rooms-create-bot-list">
            <For each={props.bots}>
              {(bot) => (
                <li>
                  <label class="rooms-create-bot" for={`rooms-create-bot-${bot.id}`}>
                    <Checkbox
                      id={`rooms-create-bot-${bot.id}`}
                      checked={selectedBotIds().includes(bot.id)}
                      disabled={submitting() || !canSelectRoomBot(selectedBotIds(), bot.id)}
                      onChange={() => setSelectedBotIds(toggleRoomBot(selectedBotIds(), bot.id))}
                    />
                    <span class="rooms-create-bot-name">{bot.name}</span>
                    <span class="rooms-create-bot-title">{bot.title}</span>
                  </label>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <p class="rooms-create-count" aria-live="polite">
          {t("rooms.create.botsCount", { selected: selectedBotIds().length, max: ROOM_ACTIVE_BOT_LIMIT })}
        </p>
      </fieldset>

      <RadioGroup.Root
        class="rooms-create-browser"
        aria-label={t("rooms.create.browserLabel")}
        value={browserMode()}
        disabled={submitting()}
        onChange={(value) => {
          const mode = BROWSER_MODES.find((candidate) => candidate === value);
          if (mode) setBrowserMode(mode);
        }}
      >
        <RadioGroup.Label class="ui-label">{t("rooms.create.browserLabel")}</RadioGroup.Label>
        <For each={BROWSER_MODES}>
          {(mode) => (
            <RadioGroup.Item class="rooms-create-option" value={mode}>
              <RadioGroup.ItemInput />
              <RadioGroup.ItemControl class="rooms-create-option-control">
                <RadioGroup.ItemIndicator />
              </RadioGroup.ItemControl>
              <span class="rooms-create-option-text">
                <RadioGroup.ItemLabel>
                  {t(BROWSER_MODE_LABEL_KEYS[mode])}
                  <Show when={mode === DEFAULT_BROWSER_MODE}>
                    <span class="rooms-badge rooms-create-default">{t("rooms.create.browserDefault")}</span>
                  </Show>
                </RadioGroup.ItemLabel>
                <RadioGroup.ItemDescription class="rooms-create-option-hint">
                  {t(BROWSER_MODE_HINT_KEYS[mode])}
                </RadioGroup.ItemDescription>
              </span>
            </RadioGroup.Item>
          )}
        </For>
      </RadioGroup.Root>

      <p class="rooms-create-notice" role="note">
        {t("rooms.create.isolationNotice")}
      </p>

      <Show when={error()}>
        <p class="rooms-create-error" role="alert">
          {error()}
        </p>
      </Show>

      <footer class="rooms-create-footer">
        <Button type="button" variant="ghost" disabled={submitting()} onClick={() => props.onOpenChange(false)}>
          {t("rooms.create.cancel")}
        </Button>
        <Button type="submit" disabled={submitting()}>
          {submitting() ? t("rooms.create.submitting") : t("rooms.create.submit")}
        </Button>
      </footer>
    </form>
  );
}

export function CreateRoomDialog(props: CreateRoomDialogProps) {
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay class="ui-scrim rooms-create-overlay" />
        <Dialog.Content class="rooms-create-dialog">
          <header class="rooms-create-header">
            <Dialog.Title>{t("rooms.create.title")}</Dialog.Title>
            <Dialog.Description>{t("rooms.create.description")}</Dialog.Description>
          </header>
          <CreateRoomForm bots={props.bots} onOpenChange={props.onOpenChange} onCreated={props.onCreated} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
