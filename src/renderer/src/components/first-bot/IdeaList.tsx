import { For } from "solid-js";
import { AgentAvatar } from "../AgentAvatar";
import { Button } from "../ui";
import type { IdeaPresentationProps } from "./model";

/** Suggestions as a vertical list with avatar, name and description (Passo a passo). */
export function IdeaList(props: IdeaPresentationProps) {
  return (
    <ul class="first-bot-idea-list">
      <For each={props.suggestions}>
        {(suggestion) => (
          <li>
            <Button
              variant="ghost"
              type="button"
              class="first-bot-idea-item"
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
              <span>
                <strong>{suggestion.name}</strong>
                <small>{suggestion.description}</small>
              </span>
            </Button>
          </li>
        )}
      </For>
    </ul>
  );
}
