import { INPUT_LIMITS } from "@lunabot/contracts/input-limits";
import { createSignal, Show } from "solid-js";
import { t } from "../../i18n";
import { AgentAvatar } from "../AgentAvatar";
import { Button, Input, Textarea } from "../ui";
import { ChevronLeft, ChevronRight } from "../ui/icons";
import { ColorSwatches } from "./ColorSwatches";
import { FaceGrid } from "./FaceGrid";
import { IdeaList } from "./IdeaList";
import { FIRST_BOT_TITLE_ID, type FirstBotSetupProps } from "./model";
import { SetupTopBar } from "./SetupTopBar";
import { Stepper } from "./Stepper";
import { useFirstBotSetup } from "./useFirstBotSetup";

const LAST_STEP = 2;
/** Thumbnails in the identity step; the arrows cycle through the same faces. */
const FACE_THUMBNAILS = 12;

/** Passo a passo (Papel): Identidade → Função → Revisar, one decision per step. */
export function PassosLayout(props: FirstBotSetupProps) {
  const bot = useFirstBotSetup(props);
  const [step, setStep] = createSignal(0);
  // Reviewing needs both the name and the function, so Continuar from step 2 also needs the purpose.
  const canContinue = () => bot.nameFilled() && (step() === 0 || bot.purposeFilled());
  const faces = () => bot.faceSeeds().slice(0, FACE_THUMBNAILS);

  function next(): void {
    if (canContinue()) setStep(Math.min(LAST_STEP, step() + 1));
  }

  function cycleFace(offset: number): void {
    const list = faces();
    const index = list.indexOf(props.value.avatarSeed);
    const seed =
      index < 0 ? list[offset > 0 ? 0 : list.length - 1] : list[(index + offset + list.length) % list.length];
    if (seed) bot.updateDraft({ avatarSeed: seed });
  }

  return (
    <div class="first-bot-layout first-bot-passos">
      <SetupTopBar
        name={bot.displayName()}
        cancelable={bot.cancelable()}
        disabled={props.submitting}
        onCancel={() => bot.cancel()}
      />
      <form
        class="first-bot-passos-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (step() < LAST_STEP) next();
          else bot.submit();
        }}
      >
        <h1 id={FIRST_BOT_TITLE_ID} class="sr-only">
          {t("onboarding.firstBot.title")}
        </h1>

        <div class="first-bot-passos-body">
          <div class="first-bot-passos-main">
            <Stepper
              steps={[
                t("onboarding.firstBot.stepIdentity"),
                t("onboarding.firstBot.stepRole"),
                t("onboarding.firstBot.stepReview"),
              ]}
              current={step()}
            />

            <Show when={step() === 0}>
              <div class="first-bot-passos-step first-bot-passos-identity">
                <div class="first-bot-passos-stage">
                  <button
                    type="button"
                    class="first-bot-avatar-arrow"
                    aria-label={t("onboarding.firstBot.previousFace")}
                    disabled={props.submitting}
                    onClick={() => cycleFace(-1)}
                  >
                    <ChevronLeft aria-hidden="true" />
                  </button>
                  <AgentAvatar
                    seed={props.value.avatarSeed}
                    hue={props.value.avatarHue}
                    motion="idle"
                    class="first-bot-passos-avatar"
                  />
                  <button
                    type="button"
                    class="first-bot-avatar-arrow"
                    aria-label={t("onboarding.firstBot.nextFace")}
                    disabled={props.submitting}
                    onClick={() => cycleFace(1)}
                  >
                    <ChevronRight aria-hidden="true" />
                  </button>
                </div>
                <FaceGrid
                  class="first-bot-passos-faces"
                  seeds={faces()}
                  selectedSeed={props.value.avatarSeed}
                  hue={props.value.avatarHue}
                  disabled={props.submitting}
                  label={t("onboarding.firstBot.face")}
                  onSelect={(avatarSeed) => bot.updateDraft({ avatarSeed })}
                />
                <Button
                  variant="ghost"
                  type="button"
                  size="sm"
                  disabled={props.submitting}
                  onClick={() => bot.shuffleFaces()}
                >
                  {t("onboarding.firstBot.shuffle")}
                </Button>
                <div class="first-bot-passos-color-row">
                  <span>{t("onboarding.firstBot.color")}</span>
                  <ColorSwatches
                    seed={props.value.avatarSeed}
                    hue={props.value.avatarHue}
                    disabled={props.submitting}
                    label={t("onboarding.firstBot.color")}
                    onSelect={(avatarHue) => bot.updateDraft({ avatarHue })}
                  />
                </div>
                <label class="first-bot-question first-bot-passos-name">
                  <span>{t("onboarding.firstBot.nameQuestion")}</span>
                  <Input
                    class="first-bot-serif-input"
                    value={props.value.name}
                    maxlength={INPUT_LIMITS.agentName}
                    autocomplete="off"
                    disabled={props.submitting}
                    onValueChange={(name) => bot.updateDraft({ name })}
                  />
                </label>
              </div>
            </Show>

            <Show when={step() === 1}>
              <div class="first-bot-passos-step first-bot-passos-role">
                <div class="first-bot-passos-role-summary">
                  <AgentAvatar
                    seed={props.value.avatarSeed}
                    hue={props.value.avatarHue}
                    motion="idle"
                    class="first-bot-passos-role-avatar"
                  />
                  <span class="first-bot-passos-role-name">{bot.displayName()}</span>
                </div>
                <label class="first-bot-question">
                  <span>{t("onboarding.firstBot.purpose")}</span>
                  <Textarea
                    class="first-bot-serif-textarea"
                    value={props.value.purpose}
                    rows={6}
                    maxlength={INPUT_LIMITS.agentDescription}
                    placeholder={t("onboarding.bot.purposePlaceholder")}
                    disabled={props.submitting}
                    onValueChange={(purpose) => bot.updateDraft({ purpose })}
                  />
                </label>
              </div>
            </Show>

            <Show when={step() === LAST_STEP}>
              <div class="first-bot-passos-step">
                <section class="first-bot-review-card">
                  <AgentAvatar
                    seed={props.value.avatarSeed}
                    hue={props.value.avatarHue}
                    motion="idle"
                    class="first-bot-review-avatar"
                  />
                  <div class="first-bot-review-text">
                    <h2 class="first-bot-review-name">{bot.displayName()}</h2>
                    <p class="first-bot-review-purpose">{props.value.purpose.trim()}</p>
                  </div>
                </section>
              </div>
            </Show>

            <Show when={props.error}>
              {(error) => (
                <p class="first-bot-error" role="alert">
                  {error()}
                </p>
              )}
            </Show>

            <footer class="first-bot-passos-footer">
              <Button
                type="button"
                variant="ghost"
                disabled={step() === 0 || props.submitting}
                onClick={() => setStep(Math.max(0, step() - 1))}
              >
                <ChevronLeft aria-hidden="true" />
                {t("onboarding.firstBot.back")}
              </Button>
              <Show
                when={step() < LAST_STEP}
                fallback={
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
                }
              >
                <Button type="button" variant="default" disabled={!canContinue() || props.submitting} onClick={next}>
                  {t("onboarding.firstBot.next")}
                  <ChevronRight aria-hidden="true" />
                </Button>
              </Show>
            </footer>
          </div>

          <aside class="first-bot-passos-ideas" aria-label={t("onboarding.firstBot.ideasList")}>
            <h2>{t("onboarding.firstBot.ideasList")}</h2>
            <IdeaList
              suggestions={props.suggestions}
              selectedId={props.value.suggestionId}
              disabled={props.submitting}
              onSelect={(suggestion) => bot.selectSuggestion(suggestion)}
            />
          </aside>
        </div>
      </form>
    </div>
  );
}
