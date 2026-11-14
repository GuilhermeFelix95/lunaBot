import { createSignal, onSettled } from "solid-js";
import { t } from "../../i18n";
import {
  type FirstBotDraft,
  type FirstBotSetupProps,
  type FirstBotSuggestion,
  faceSeedsForBatch,
  matchesSuggestion,
} from "./model";

export function useFirstBotSetup(props: FirstBotSetupProps) {
  const [faceBatch, setFaceBatch] = createSignal(0);
  const faceSeeds = () => faceSeedsForBatch(faceBatch());
  const nameFilled = () => Boolean(props.value.name.trim());
  const purposeFilled = () => Boolean(props.value.purpose.trim());
  const canSubmit = () => nameFilled() && purposeFilled() && !props.submitting;
  const displayName = () => props.value.name.trim() || t("onboarding.bot.defaultName");
  const cancelable = () => props.mode === "additional" && Boolean(props.onCancel);

  function updateDraft(updates: Partial<FirstBotDraft>): void {
    if (props.submitting) return;
    const next = { ...props.value, ...updates };
    const selected = props.suggestions.find((suggestion) => suggestion.id === next.suggestionId);
    props.onChange({
      ...next,
      suggestionId: selected && matchesSuggestion(next, selected) ? selected.id : null,
    });
  }

  function selectSuggestion(suggestion: FirstBotSuggestion): void {
    if (props.submitting) return;
    props.onChange({
      name: suggestion.name,
      purpose: suggestion.purpose,
      avatarSeed: suggestion.avatarSeed,
      avatarHue: suggestion.avatarHue,
      suggestionId: suggestion.id,
    });
  }

  function shuffleFaces(): void {
    if (props.submitting) return;
    const nextBatch = faceBatch() + 1;
    setFaceBatch(nextBatch);
    const seed = faceSeedsForBatch(nextBatch)[0];
    if (seed) updateDraft({ avatarSeed: seed });
  }

  function submit(): void {
    if (canSubmit()) void props.onSubmit(props.value);
  }

  function cancel(): void {
    if (props.submitting) return;
    props.onCancel?.();
  }

  onSettled(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || props.mode !== "additional" || props.submitting || !props.onCancel) return;
      event.preventDefault();
      props.onCancel();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  });

  return {
    faceSeeds,
    nameFilled,
    purposeFilled,
    canSubmit,
    displayName,
    cancelable,
    updateDraft,
    selectSuggestion,
    shuffleFaces,
    submit,
    cancel,
  };
}
