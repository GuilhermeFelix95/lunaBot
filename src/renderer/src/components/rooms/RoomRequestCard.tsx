import type { RoomRequest } from "@lunabot/contracts/ipc";
import { t } from "../../i18n";
import { Button } from "../ui";

export interface RoomRequestCardProps {
  request: RoomRequest;
  roomName: string;
  /** Name of the bot a hire or dismiss request is about. The caller resolves it from the room or the bot list. */
  targetName: string;
  disabled: boolean;
  /** Opens the create-bot screen for a new_bot request. */
  onCreateBot: () => void;
  onApprove: () => void;
  onReject: () => void;
}

export function RoomRequestCard(props: RoomRequestCardProps) {
  const titleId = `rooms-request-${props.request.id}`;

  if (props.request.kind === "new_bot") {
    return (
      <article class="rooms-request rooms-request-new-bot" aria-labelledby={titleId}>
        <h3 id={titleId} class="rooms-request-title">
          {t("rooms.request.newBotTitle", { name: props.request.profile?.name ?? "" })}
        </h3>
        <p class="rooms-request-note">{props.request.profile?.description ?? props.request.reason}</p>
        <div class="rooms-request-actions">
          <Button variant="outline" disabled={props.disabled} onClick={() => props.onCreateBot()}>
            {t("rooms.request.createBot")}
          </Button>
          <Button variant="outline" disabled={props.disabled} onClick={() => props.onReject()}>
            {t("rooms.request.notNow")}
          </Button>
        </div>
      </article>
    );
  }

  if (props.request.kind === "hire") {
    return (
      <article class="rooms-request rooms-request-hire" aria-labelledby={titleId}>
        <h3 id={titleId} class="rooms-request-title">
          {t("rooms.request.hireTitle", { name: props.targetName, room: props.roomName })}
        </h3>
        <p class="rooms-request-note">{t("rooms.request.hireNote")}</p>
        <div class="rooms-request-actions">
          <Button disabled={props.disabled} onClick={() => props.onApprove()}>
            {t("rooms.request.hire")}
          </Button>
          <Button variant="outline" disabled={props.disabled} onClick={() => props.onReject()}>
            {t("rooms.request.notNow")}
          </Button>
        </div>
      </article>
    );
  }

  return (
    <article class="rooms-request rooms-request-dismiss" aria-labelledby={titleId}>
      <h3 id={titleId} class="rooms-request-title">
        {t("rooms.request.dismissTitle", { name: props.targetName, room: props.roomName })}
      </h3>
      <p class="rooms-request-note">{t("rooms.request.dismissNote")}</p>
      <div class="rooms-request-actions">
        <Button variant="destructive" disabled={props.disabled} onClick={() => props.onApprove()}>
          {t("rooms.request.dismiss")}
        </Button>
        <Button variant="outline" disabled={props.disabled} onClick={() => props.onReject()}>
          {t("rooms.request.keep")}
        </Button>
      </div>
    </article>
  );
}
