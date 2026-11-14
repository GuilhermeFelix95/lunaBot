import { isAvatarMimeType, isValidAvatarImage } from "@lunabot/contracts/avatar-images";
import type { AvatarImageInput } from "@lunabot/contracts/ipc";
import { isString } from "@lunabot/contracts/runtime-values";
import { nativeMessage } from "../native-messages";
import { isObject } from "./validation";

export function parseAvatarImage(value: unknown): AvatarImageInput | null {
  if (value === null) return null;
  if (
    !isObject(value) ||
    !isString(value.mimeType) ||
    !isAvatarMimeType(value.mimeType) ||
    !(value.bytes instanceof Uint8Array) ||
    !isValidAvatarImage(value.mimeType, value.bytes)
  ) {
    throw new Error(nativeMessage("errors.avatar.invalidImage"));
  }
  return { mimeType: value.mimeType, bytes: value.bytes };
}
