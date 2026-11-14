import { Match, Switch } from "solid-js";
import { activeTheme } from "../theme";
import { AtelieLayout } from "./first-bot/AtelieLayout";
import { FIRST_BOT_TITLE_ID, type FirstBotSetupProps } from "./first-bot/model";
import { PassosLayout } from "./first-bot/PassosLayout";
import { PerguntaLayout } from "./first-bot/PerguntaLayout";

export {
  createFirstBotDraft,
  DEFAULT_FIRST_BOT_DRAFT,
  FIRST_BOT_AVATAR_SEEDS,
  FIRST_BOT_SUGGESTIONS,
  type FirstBotDraft,
  type FirstBotSetupProps,
  type FirstBotSuggestion,
} from "./first-bot/model";

/** Picks the layout for the active theme: Eclipse → Ateliê, Papel → Passo a passo, Quadrante → Pergunta. */
export function FirstBotSetup(props: FirstBotSetupProps) {
  return (
    <main class="conversation-panel first-bot-setup-panel" aria-labelledby={FIRST_BOT_TITLE_ID}>
      <Switch fallback={<AtelieLayout {...props} />}>
        <Match when={activeTheme() === "papel"}>
          <PassosLayout {...props} />
        </Match>
        <Match when={activeTheme() === "quadrante"}>
          <PerguntaLayout {...props} />
        </Match>
      </Switch>
    </main>
  );
}
