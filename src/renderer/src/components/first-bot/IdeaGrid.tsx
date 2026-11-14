import { For } from "solid-js";
import { avatarHeadColor } from "../../avatar";
import { AgentAvatar } from "../AgentAvatar";
import { Button } from "../ui";
import type { IdeaPresentationProps } from "./model";

/** Suggestions as a tinted mosaic of templates (Pergunta): each card takes the colour of its avatar. */
export function IdeaGrid(props: IdeaPresentationProps) {
  return (
    <ul class="first-bot-idea-grid">
      <For each={props.suggestions}>
        {(suggestion, index) => (
          <li>
            <Button
              variant="ghost"
              type="button"
              class="first-bot-idea-cell"
              style={{ "--idea-color": avatarHeadColor(suggestion.avatarSeed, suggestion.avatarHue) }}
              aria-label={`${suggestion.name}. ${suggestion.description}`}
              aria-pressed={props.selectedId === suggestion.id ? "true" : "false"}
              disabled={props.disabled}
              onClick={() => props.onSelect(suggestion)}
            >
              <span class="first-bot-idea-cell-top">
                <AgentAvatar
                  seed={suggestion.avatarSeed}
                  hue={suggestion.avatarHue}
                  motion="idle"
                  animationOffset={suggestion.animationOffset}
                />
                <span class="first-bot-idea-number" aria-hidden="true">
                  {String(index() + 1).padStart(2, "0")}
                </span>
              </span>
              <span class="first-bot-idea-cell-text">
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
