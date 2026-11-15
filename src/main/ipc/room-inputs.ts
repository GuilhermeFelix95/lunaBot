import { INPUT_LIMITS } from "@lunabot/contracts/input-limits";
import {
  type CreateRoomInput,
  type DismissRoomMemberInput,
  isAvatarHue,
  isAvatarSeed,
  type ResolveRoomRequestInput,
  ROOM_ACTIVE_BOT_LIMIT,
  ROOM_NAME_MAX_LENGTH,
} from "@lunabot/contracts/ipc";
import { isObject, requireString } from "./validation";

export function parseCreateRoom(value: unknown): CreateRoomInput {
  if (!isObject(value) || !isObject(value.manager)) throw new Error("Invalid room creation request.");
  const manager = value.manager;
  const avatarHue = manager.avatarHue;
  if (!isAvatarSeed(manager.avatarSeed)) throw new Error("Invalid avatar seed.");
  if (avatarHue !== null && !isAvatarHue(avatarHue)) throw new Error("Invalid avatar hue.");
  const browserMode = value.browserMode;
  if (browserMode !== undefined && browserMode !== "exclusive" && browserMode !== "shared") {
    throw new Error("Invalid room browser mode.");
  }
  return {
    name: requireString(value.name, "name", ROOM_NAME_MAX_LENGTH),
    manager: {
      name: requireString(manager.name, "name", INPUT_LIMITS.agentName),
      description: requireString(manager.description, "description", INPUT_LIMITS.agentDescription),
      avatarSeed: manager.avatarSeed,
      avatarHue,
    },
    ...(browserMode === undefined ? {} : { browserMode }),
    ...(value.memberBotIds === undefined ? {} : { memberBotIds: parseMemberBotIds(value.memberBotIds) }),
  };
}

function parseMemberBotIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > ROOM_ACTIVE_BOT_LIMIT) throw new Error("Invalid room members.");
  const ids = value.map((botId) => requireString(botId, "botId", INPUT_LIMITS.identifier));
  if (new Set(ids).size !== ids.length) throw new Error("Invalid room members.");
  return ids;
}

export function parseDismissRoomMember(value: unknown): DismissRoomMemberInput {
  if (!isObject(value)) throw new Error("Invalid room member request.");
  return {
    roomId: requireString(value.roomId, "roomId", INPUT_LIMITS.identifier),
    botId: requireString(value.botId, "botId", INPUT_LIMITS.identifier),
  };
}

export function parseResolveRoomRequest(value: unknown): ResolveRoomRequestInput {
  if (!isObject(value)) throw new Error("Invalid room request decision.");
  const decision = value.decision;
  if (decision !== "approve" && decision !== "reject") throw new Error("Invalid room request decision.");
  const targetBotId = value.targetBotId;
  return {
    requestId: requireString(value.requestId, "requestId", INPUT_LIMITS.identifier),
    decision,
    ...(targetBotId === undefined
      ? {}
      : { targetBotId: requireString(targetBotId, "targetBotId", INPUT_LIMITS.identifier) }),
  };
}
