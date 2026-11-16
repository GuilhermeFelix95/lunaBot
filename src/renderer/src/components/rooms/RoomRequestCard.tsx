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

// One request is one line: what the manager asks for, then the two answers. The longer explanation is the tooltip.
export function RoomRequestCard(props: RoomRequestCardProps) {
  const titleId = `rooms-request-${props.request.id}`;
  const row = (
    title: string,
    note: string,
    primary: { label: string; destructive?: boolean; onClick: () => void },
    secondary: string,
  ) => (
    <article class="rooms-request" aria-labelledby={titleId} title={note}>
      <h3 id={titleId} class="rooms-request-title">
        {title}
      </h3>
      <div class="rooms-request-actions">
        <Button
          size="sm"
          variant={primary.destructive ? "destructive" : "default"}
          disabled={props.disabled}
          onClick={() => primary.onClick()}
        >
          {primary.label}
        </Button>
        <Button size="sm" variant="outline" disabled={props.disabled} onClick={() => props.onReject()}>
          {secondary}
        </Button>
      </div>
    </article>
  );

  if (props.request.kind === "new_bot") {
    return row(
      t("rooms.request.newBotTitle", { name: props.request.profile?.name ?? "" }),
      props.request.profile?.description || props.request.reason,
      { label: t("rooms.request.createBot"), onClick: () => props.onCreateBot() },
      t("rooms.request.notNow"),
    );
  }
  if (props.request.kind === "hire") {
    return row(
      t("rooms.request.hireTitle", { name: props.targetName, room: props.roomName }),
      t("rooms.request.hireNote"),
      { label: t("rooms.request.hire"), onClick: () => props.onApprove() },
      t("rooms.request.notNow"),
    );
  }
  return row(
    t("rooms.request.dismissTitle", { name: props.targetName, room: props.roomName }),
    t("rooms.request.dismissNote"),
    { label: t("rooms.request.dismiss"), destructive: true, onClick: () => props.onApprove() },
    t("rooms.request.keep"),
  );
}
