import type { UpdateStatus } from "@lunabot/contracts/ipc";
import { isUpdateActivePhase, isUpdateBusyPhase } from "@lunabot/contracts/ipc";
import { t } from "./i18n";

export interface UpdateStatusPresentation {
  actionLabel: string;
  available: boolean;
  busy: boolean;
  detail: string;
  supported: boolean;
}

export function presentUpdateStatus(status: UpdateStatus): UpdateStatusPresentation {
  const available = isUpdateActivePhase(status.phase);
  const busy = isUpdateBusyPhase(status.phase);
  let actionLabel = t("misc.update.check");

  switch (status.phase) {
    case "checking":
      actionLabel = t("misc.update.checking");
      break;
    case "available":
      actionLabel = t("misc.update.download");
      break;
    case "downloading":
      actionLabel = t("misc.update.downloading");
      break;
    case "ready":
      actionLabel = t("misc.update.restart");
      break;
    case "installing":
      actionLabel = t("misc.update.restarting");
      break;
    case "error":
      // A failed download is retried in place rather than sending the user back through a check. A
      // failed install is not retryable: shutdown preparation has already run, so the message asks
      // for a relaunch and the action falls back to checking.
      if (status.errorCode === "download_failed") actionLabel = t("misc.update.retryDownload");
      break;
  }

  let detail = "";
  if (status.phase === "downloading" && status.progress !== null) detail = `${Math.round(status.progress)}%`;
  else if (status.availableVersion) detail = `v${status.availableVersion}`;
  else if (status.phase === "up-to-date") detail = t("misc.update.upToDate");
  else if (status.currentVersion) detail = `v${status.currentVersion}`;

  return {
    actionLabel,
    available,
    busy,
    detail,
    supported: status.phase !== "unsupported",
  };
}
