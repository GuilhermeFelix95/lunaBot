import type { BotAvatarHue } from "@lunabot/contracts/ipc";
import { For } from "solid-js";
import { t } from "../../i18n";
import { AgentAvatar } from "../AgentAvatar";

interface FaceGridProps {
  seeds: string[];
  selectedSeed: string;
  hue: BotAvatarHue | null;
  disabled?: boolean;
  label: string;
  class?: string;
  onSelect: (seed: string) => void;
}

/** Radio group of faces: one tab stop, arrow keys move and select (WAI-ARIA radio group pattern). */
export function FaceGrid(props: FaceGridProps) {
  let group: HTMLDivElement | undefined;
  const tabStop = () => Math.max(0, props.seeds.indexOf(props.selectedSeed));

  function moveTo(index: number): void {
    const count = props.seeds.length;
    const next = (index + count) % count;
    const seed = props.seeds[next];
    if (!seed) return;
    props.onSelect(seed);
    group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent, index: number): void {
    if (props.disabled) return;
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !backward) return;
    event.preventDefault();
    moveTo(index + (forward ? 1 : -1));
  }

  return (
    <div ref={group} role="radiogroup" aria-label={props.label} class={`first-bot-face-grid ${props.class ?? ""}`}>
      <For each={props.seeds}>
        {(seed, index) => (
          // biome-ignore lint/a11y/useSemanticElements: the face keeps its button styling; the WAI-ARIA radio group pattern allows role="radio" on buttons.
          <button
            type="button"
            role="radio"
            class="first-bot-face-option"
            aria-label={t("onboarding.bot.faceNamed", { number: index() + 1 })}
            aria-checked={props.selectedSeed === seed ? "true" : "false"}
            tabindex={index() === tabStop() ? 0 : -1}
            disabled={props.disabled}
            onClick={() => props.onSelect(seed)}
            onKeyDown={(event) => handleKeyDown(event, index())}
          >
            <AgentAvatar seed={seed} hue={props.hue} motion="idle" animationOffset={index() * 0.16} />
          </button>
        )}
      </For>
    </div>
  );
}
