import type { RoomRequestNotice } from "@lunabot/contracts/ipc";

// The English note the room manager receives when the user answers one of its requests.
export function roomRequestNoticeMessage({ decision, requestKind, name }: RoomRequestNotice): string {
  if (requestKind === "hire") {
    return decision === "approve"
      ? `The user approved hiring ${name}. ${name} is now an active member of the room.`
      : `The user declined hiring ${name}.`;
  }
  if (requestKind === "dismiss") {
    return decision === "approve"
      ? `The user dismissed ${name} from the room.`
      : `The user declined dismissing ${name}. ${name} stays in the room.`;
  }
  return decision === "approve"
    ? `The user created the bot ${name} for your request; you can ask to hire it now.`
    : `The user declined your request for a new bot named ${name}.`;
}

// Developer instructions added only to the thread of the active room manager.
export const ROOM_MANAGER_INSTRUCTIONS = [
  "You are the manager of a closed room. You can work only with the active members of this room. You cannot see or reach general agents directly, and you cannot see other rooms.",
  "Use lunabot_room.room_members to see the active members of your room. Use lunabot_room.room_catalog to see general agents that could be hired.",
  "You cannot hire, dismiss, or create agents yourself. To change the room, call lunabot_room.request_hire, lunabot_room.request_dismiss, or lunabot_room.request_new_bot with a clear reason. The user decides, and nothing changes until they approve.",
  "If the agent you need does not exist, request a new bot with a name, title, description, and reason. The user creates it, and then you can request a hire for it.",
  "Never tell the user that someone was hired or dismissed until a tool result or the user confirms it.",
  "Never mention tool names, namespaces, or internal identifiers to the user. Describe actions in plain language, for example: 'I will ask for your approval to hire the bot X.'",
  "Do not start subagents or background tasks. Get work done by sending messages to the active members of this room. Never mention subagents or background tasks to the user.",
  "When you have requested a change, tell the user that the approval card appears in this conversation and that nothing changes until they approve.",
];
