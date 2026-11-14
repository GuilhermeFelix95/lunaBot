import { INPUT_LIMITS } from "@lunabot/contracts/input-limits";
import { Show } from "solid-js";
import { t } from "../../i18n";
import { Button, Field, Input, Textarea } from "../ui";
import { ColorSwatches } from "./ColorSwatches";
import { FaceGrid } from "./FaceGrid";
import { IdeaChips } from "./IdeaChips";
import { FIRST_BOT_TITLE_ID, type FirstBotSetupProps } from "./model";
import { PreviewCard } from "./PreviewCard";
import { SetupTopBar } from "./SetupTopBar";
import { useFirstBotSetup } from "./useFirstBotSetup";

/** Ateliê (Eclipse): preview on the left, editing and ideas on the right, one form. */
export function AtelieLayout(props: FirstBotSetupProps) {
  const bot = useFirstBotSetup(props);

  return (
    <div class="first-bot-layout first-bot-atelie">
      <SetupTopBar
        name={bot.displayName()}
        cancelable={bot.cancelable()}
        disabled={props.submitting}
        onCancel={() => bot.cancel()}
      />
      <form
        class="first-bot-atelie-form"
        onSubmit={(event) => {
          event.preventDefault();
          bot.submit();
        }}
      >
        <div class="first-bot-atelie-intro">
          <h1 id={FIRST_BOT_TITLE_ID}>{t("onboarding.firstBot.title")}</h1>
          <p>{t("onboarding.firstBot.subtitle")}</p>
        </div>

        <div class="first-bot-atelie-grid">
          <PreviewCard value={props.value} name={bot.displayName()} class="first-bot-atelie-preview" />

          <div class="first-bot-atelie-editor">
            <section class="first-bot-field">
              <div class="first-bot-field-head">
                <h2>{t("onboarding.firstBot.face")}</h2>
                <Button
                  variant="ghost"
                  type="button"
                  size="sm"
                  disabled={props.submitting}
                  onClick={() => bot.shuffleFaces()}
                >
                  {t("onboarding.firstBot.shuffle")}
                </Button>
              </div>
              <FaceGrid
                seeds={bot.faceSeeds()}
                selectedSeed={props.value.avatarSeed}
                hue={props.value.avatarHue}
                disabled={props.submitting}
                label={t("onboarding.firstBot.face")}
                onSelect={(avatarSeed) => bot.updateDraft({ avatarSeed })}
              />
            </section>

            <section class="first-bot-field">
              <h2>{t("onboarding.firstBot.color")}</h2>
              <ColorSwatches
                seed={props.value.avatarSeed}
                hue={props.value.avatarHue}
                disabled={props.submitting}
                label={t("onboarding.firstBot.color")}
                onSelect={(avatarHue) => bot.updateDraft({ avatarHue })}
              />
            </section>

            <Field label={t("onboarding.firstBot.name")} required>
              <Input
                value={props.value.name}
                maxlength={INPUT_LIMITS.agentName}
                autocomplete="off"
                disabled={props.submitting}
                onValueChange={(name) => bot.updateDraft({ name })}
              />
            </Field>

            <Field label={t("onboarding.firstBot.purpose")} required>
              <Textarea
                value={props.value.purpose}
                rows={2}
                maxlength={INPUT_LIMITS.agentDescription}
                placeholder={t("onboarding.bot.purposePlaceholder")}
                disabled={props.submitting}
                onValueChange={(purpose) => bot.updateDraft({ purpose })}
              />
            </Field>

            <section class="first-bot-field">
              <h2>{t("onboarding.firstBot.ideasChips")}</h2>
              <IdeaChips
                suggestions={props.suggestions}
                selectedId={props.value.suggestionId}
                disabled={props.submitting}
                onSelect={(suggestion) => bot.selectSuggestion(suggestion)}
              />
            </section>

            <Show when={props.error}>
              {(error) => (
                <p class="first-bot-error" role="alert">
                  {error()}
                </p>
              )}
            </Show>

            <div class="first-bot-actions">
              <Button
                type="submit"
                variant="default"
                size="default"
                class="first-bot-submit"
                disabled={!bot.canSubmit()}
                loading={props.submitting}
                loadingLabel={t("onboarding.bot.creating")}
              >
                {t("onboarding.bot.create")}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
