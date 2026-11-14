import { For } from "solid-js";
import { AgentAvatar } from "../AgentAvatar";
import { Button } from "../ui";
import type { IdeaPresentationProps } from "./model";

/** Suggestions as compact pills (Atelie). */
export function IdeaChips(props: IdeaPresentationProps) {
  return (
    <ul class="first-bot-idea-chips">
      <For each={props.suggestions}>
        {(suggestion) => (
          <li>
            <Button
              variant="outline"
              type="button"
              size="sm"
              class="first-bot-idea-chip"
              aria-label={`${suggestion.name}. ${suggestion.description}`}
              aria-pressed={props.selectedId === suggestion.id ? "true" : "false"}
              disabled={props.disabled}
              onClick={() => props.onSelect(suggestion)}
            >
              <AgentAvatar
                seed={suggestion.avatarSeed}
                hue={suggestion.avatarHue}
                motion="idle"
                animationOffset={suggestion.animationOffset}
              />
              <span>{suggestion.name}</span>
            </Button>
          </li>
        )}
      </For>
    </ul>
  );
}
