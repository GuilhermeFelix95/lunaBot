import { render } from "@solidjs/web";
import { Button, PanelRight, X } from "./components/ui";
import { t } from "./i18n";
import "./styles.css";

function BrowserPictureInPictureControls() {
  return (
    <div class="browser-pip-hover-controls" role="toolbar" aria-label={t("misc.pip.controls")}>
      <Button
        variant="ghost"
        type="button"
        class="browser-pip-hover-button"
        aria-label={t("misc.pip.reattachLabel")}
        title={t("misc.pip.reattach")}
        onClick={() => void window.lunabot.browser.dockPictureInPicture()}
      >
        <PanelRight class="browser-toolbar-icon" />
      </Button>
      <Button
        variant="ghost"
        type="button"
        class="browser-pip-hover-button"
        aria-label={t("misc.pip.close")}
        title={t("misc.pip.close")}
        onClick={() => void window.lunabot.browser.hidePictureInPicture()}
      >
        <X class="browser-toolbar-icon" />
      </Button>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Could not locate the PiP controls container in this window.");
render(() => <BrowserPictureInPictureControls />, root);
