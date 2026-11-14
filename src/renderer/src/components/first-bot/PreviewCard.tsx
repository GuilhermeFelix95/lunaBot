import { t } from "../../i18n";
import { AgentAvatar } from "../AgentAvatar";
import type { FirstBotDraft } from "./model";

interface PreviewCardProps {
  value: FirstBotDraft;
  name: string;
  class?: string;
}

/** Live preview of the bot: large avatar, name and function, and the sidebar row it will get. */
export function PreviewCard(props: PreviewCardProps) {
  return (
    <section class={`first-bot-preview ${props.class ?? ""}`}>
      <p class="first-bot-preview-label">{t("onboarding.firstBot.preview")}</p>
      <AgentAvatar
        seed={props.value.avatarSeed}
        hue={props.value.avatarHue}
        motion="idle"
        class="first-bot-preview-avatar"
      />
      <strong class="first-bot-preview-name">{props.name}</strong>
      <p class="first-bot-preview-purpose">{props.value.purpose.trim()}</p>
      <div class="first-bot-preview-sidebar">
        <p class="first-bot-preview-caption">{t("onboarding.firstBot.sidebarPreview")}</p>
        <div class="first-bot-sidebar-row">
          <AgentAvatar
            seed={props.value.avatarSeed}
            hue={props.value.avatarHue}
            motion="idle"
            class="first-bot-sidebar-avatar"
          />
          <span>{props.name}</span>
        </div>
      </div>
    </section>
  );
}
