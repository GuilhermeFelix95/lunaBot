import { INPUT_LIMITS } from "@lunabot/contracts/input-limits";
import { Show } from "solid-js";
import { t } from "../../i18n";
import { AgentAvatar } from "../AgentAvatar";
import { Button, Input, Textarea } from "../ui";
import { ColorSwatches } from "./ColorSwatches";
import { FaceGrid } from "./FaceGrid";
import { IdeaGrid } from "./IdeaGrid";
import { FIRST_BOT_TITLE_ID, type FirstBotSetupProps } from "./model";
import { SetupTopBar } from "./SetupTopBar";
import { useFirstBotSetup } from "./useFirstBotSetup";

/** Pergunta (Quadrante): one question, one box to answer it, templates as a numbered grid. */
export function PerguntaLayout(props: FirstBotSetupProps) {
  const bot = useFirstBotSetup(props);

  return (
    <div class="first-bot-layout first-bot-pergunta">
      <SetupTopBar
        name={bot.displayName()}
        cancelable={bot.cancelable()}
        disabled={props.submitting}
        onCancel={() => bot.cancel()}
      />
      <form
        class="first-bot-pergunta-form"
        onSubmit={(event) => {
          event.preventDefault();
          bot.submit();
        }}
      >
        <h1 id={FIRST_BOT_TITLE_ID} class="first-bot-pergunta-title">
          {t("onboarding.firstBot.purposeQuestion")}
        </h1>

        <div class="first-bot-pergunta-box">
          <div class="first-bot-pergunta-top">
            <div class="first-bot-pergunta-identity">
              <AgentAvatar
                seed={props.value.avatarSeed}
                hue={props.value.avatarHue}
                motion="idle"
                class="first-bot-pergunta-avatar"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={props.submitting}
                onClick={() => bot.shuffleFaces()}
              >
                {t("onboarding.firstBot.shuffle")}
              </Button>
            </div>

            <div class="first-bot-pergunta-fields">
              <label class="first-bot-inline-field">
                <span class="first-bot-mono-label">{t("onboarding.firstBot.name")}</span>
                <Input
                  class="first-bot-inline-input"
                  value={props.value.name}
                  maxlength={INPUT_LIMITS.agentName}
                  autocomplete="off"
                  disabled={props.submitting}
                  onValueChange={(name) => bot.updateDraft({ name })}
                />
              </label>
              <label class="first-bot-inline-field first-bot-purpose-field">
                <span class="sr-only">{t("onboarding.firstBot.purpose")}</span>
                <Textarea
                  class="first-bot-purpose-input"
                  value={props.value.purpose}
                  rows={3}
                  maxlength={INPUT_LIMITS.agentDescription}
                  placeholder={t("onboarding.bot.purposePlaceholder")}
                  disabled={props.submitting}
                  onValueChange={(purpose) => bot.updateDraft({ purpose })}
                />
              </label>
            </div>
          </div>

          <div class="first-bot-pergunta-faces">
            <FaceGrid
              seeds={bot.faceSeeds()}
              selectedSeed={props.value.avatarSeed}
              hue={props.value.avatarHue}
              disabled={props.submitting}
              label={t("onboarding.firstBot.face")}
              onSelect={(avatarSeed) => bot.updateDraft({ avatarSeed })}
            />
          </div>

          <div class="first-bot-pergunta-foot">
            <ColorSwatches
              class="first-bot-pergunta-colors"
              seed={props.value.avatarSeed}
              hue={props.value.avatarHue}
              disabled={props.submitting}
              label={t("onboarding.firstBot.color")}
              onSelect={(avatarHue) => bot.updateDraft({ avatarHue })}
            />
            <Button
              type="submit"
              variant="default"
              class="first-bot-submit"
              disabled={!bot.canSubmit()}
              loading={props.submitting}
              loadingLabel={t("onboarding.bot.creating")}
            >
              {t("onboarding.bot.create")}
            </Button>
          </div>
        </div>

        <Show when={props.error}>
          {(error) => (
            <p class="first-bot-error" role="alert">
              {error()}
            </p>
          )}
        </Show>

        <section class="first-bot-pergunta-ideas">
          <h2 class="first-bot-mono-label">{t("onboarding.firstBot.ideasGrid")}</h2>
          <IdeaGrid
            suggestions={props.suggestions}
            selectedId={props.value.suggestionId}
            disabled={props.submitting}
            onSelect={(suggestion) => bot.selectSuggestion(suggestion)}
          />
        </section>
      </form>
    </div>
  );
}
