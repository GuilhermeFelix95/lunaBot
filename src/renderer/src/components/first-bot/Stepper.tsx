import { For } from "solid-js";
import { t } from "../../i18n";

interface StepperProps {
  steps: string[];
  current: number;
}

/** Passo a passo progress indicator; the current step carries aria-current. */
export function Stepper(props: StepperProps) {
  return (
    <ol class="first-bot-stepper" aria-label={t("onboarding.firstBot.steps")}>
      <For each={props.steps}>
        {(label, index) => (
          <li
            class="first-bot-step"
            data-state={index() < props.current ? "done" : index() === props.current ? "current" : "upcoming"}
            aria-current={index() === props.current ? "step" : undefined}
          >
            <span class="first-bot-step-number" aria-hidden="true">
              {index() + 1}
            </span>
            <span>{label}</span>
          </li>
        )}
      </For>
    </ol>
  );
}
