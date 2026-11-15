export interface LocalPathMention {
  start: number;
  end: number;
  path: string;
}

/** A path under the shared area of Luna Bot, which opens from the shared folder instead of an agent's workspace. */
export function isSharedLocalPath(value: string): boolean {
  const normalized = value.trim().replaceAll("\\", "/");
  return (
    normalized.startsWith("~/LunaBot/Shared/") ||
    normalized.startsWith("LunaBot/Shared/") ||
    normalized.includes("/LunaBot/Shared/")
  );
}

// Drive paths, `~/` paths and absolute posix paths with at least two segments, so `/compact` and `and/or` stay text.
// A space continues the path only when the next word holds a separator itself ("C:\Luna Bot\Bots\x"), so prose after a path stays out.
const WINDOWS_CHARS = String.raw`[^\s<>"'\x60|?*]`;
const POSIX_CHARS = String.raw`[\w.@+%-]`;
const WINDOWS_PATH = String.raw`[A-Za-z]:[\\/]${WINDOWS_CHARS}+(?: (?=${WINDOWS_CHARS}*[\\/])${WINDOWS_CHARS}+)*`;
const HOME_PATH = String.raw`~[\\/]${WINDOWS_CHARS}+(?: (?=${WINDOWS_CHARS}*[\\/])${WINDOWS_CHARS}+)*`;
const POSIX_PATH = String.raw`\/(?:${POSIX_CHARS}+(?: (?=${POSIX_CHARS}*\/)${POSIX_CHARS}+)*\/)+${POSIX_CHARS}+\/?`;
const LOCAL_PATH = new RegExp(String.raw`(?<![\w./:\\~-])(?:${WINDOWS_PATH}|${HOME_PATH}|${POSIX_PATH})`, "gu");
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/u;

/** Finds absolute and home paths written in plain text. A folder keeps its trailing separator. */
export function findLocalPaths(text: string): LocalPathMention[] {
  const mentions: LocalPathMention[] = [];
  for (const match of text.matchAll(LOCAL_PATH)) {
    const raw = match[0];
    const path = raw.replace(TRAILING_PUNCTUATION, "");
    if (!path || /^[A-Za-z]:[\\/]?$/u.test(path)) continue;
    const start = match.index ?? 0;
    mentions.push({ start, end: start + path.length, path });
  }
  return mentions;
}
