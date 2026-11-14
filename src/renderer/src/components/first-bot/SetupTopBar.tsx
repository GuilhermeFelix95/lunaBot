import { t } from "../../i18n";
import { Button } from "../ui";

interface SetupTopBarProps {
  name: string;
  cancelable: boolean;
  disabled?: boolean;
  onCancel: () => void;
}

/** Top strip shared by the three layouts: the bot's current name and cancel (additional bots only). */
export function SetupTopBar(props: SetupTopBarProps) {
  return (
    <header class="window-drag first-bot-topbar">
      <span class="first-bot-topbar-name" aria-live="polite">
        {props.name}
      </span>
      {props.cancelable && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="first-bot-cancel no-drag"
          disabled={props.disabled}
          onClick={() => props.onCancel()}
        >
          {t("onboarding.common.cancel")}
        </Button>
      )}
    </header>
  );
}
