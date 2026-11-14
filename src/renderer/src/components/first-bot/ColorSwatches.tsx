import type { BotAvatarHue } from "@lunabot/contracts/ipc";
import { For } from "solid-js";
import { avatarHeadColor, avatarHueSwatch } from "../../avatar";
import { t } from "../../i18n";
import { Button } from "../ui";
import { BOT_HUE_NAME_KEYS, FIRST_BOT_HUE_OPTIONS } from "./model";

interface ColorSwatchesProps {
  seed: string;
  hue: BotAvatarHue | null;
  disabled?: boolean;
  label: string;
  class?: string;
  onSelect: (hue: BotAvatarHue | null) => void;
}

export function ColorSwatches(props: ColorSwatchesProps) {
  return (
    <fieldset aria-label={props.label} class={`first-bot-color-options ${props.class ?? ""}`}>
      <Button
        variant="ghost"
        type="button"
        size="sm"
        class="first-bot-color-choice"
        aria-label={t("onboarding.bot.colorAutomatic")}
        aria-pressed={props.hue === null ? "true" : "false"}
        disabled={props.disabled}
        onClick={() => props.onSelect(null)}
      >
        <span class="first-bot-color-swatch" style={{ background: avatarHeadColor(props.seed, null) }} />
      </Button>
      <For each={FIRST_BOT_HUE_OPTIONS}>
        {(option) => (
          <Button
            variant="ghost"
            type="button"
            size="sm"
            class="first-bot-color-choice"
            aria-label={t("onboarding.bot.colorNamed", { color: t(BOT_HUE_NAME_KEYS[option.hue]) })}
            aria-pressed={props.hue === option.hue ? "true" : "false"}
            disabled={props.disabled}
            onClick={() => props.onSelect(option.hue)}
          >
            <span class="first-bot-color-swatch" style={{ background: avatarHueSwatch(option.hue) }} />
          </Button>
        )}
      </For>
    </fieldset>
  );
}
