import { readdir, readFile } from "node:fs/promises";
import { attachmentFileExtension, attachmentMimeTypeForName } from "@lunabot/contracts/attachment-files";
import { ATTACHMENT_LIMITS } from "@lunabot/contracts/input-limits";
import type { FilePreview } from "@lunabot/contracts/ipc";
import { nativeMessage } from "./native-messages";

export function mimeTypeForName(name: string) {
  return attachmentMimeTypeForName(name);
}

// Videos are previewed in the side panel only; they are not attachments, so the attachment table leaves them out.
function previewMimeTypeForName(name: string) {
  switch (attachmentFileExtension(name)) {
    case "mp4":
    case "m4v":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    default:
      return mimeTypeForName(name);
  }
}

function previewKind(name: string, mimeType: string): FilePreview["previewKind"] {
  if (/\.(md|markdown)$/iu.test(name)) return "markdown";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("text/") || mimeType === "application/json") return "text";
  return "none";
}

export function filePreviewFromBytes(name: string, bytes: Uint8Array): FilePreview {
  if (bytes.byteLength > ATTACHMENT_LIMITS.fileBytes) throw new Error(nativeMessage("errors.file.tooLarge"));
  const mimeType = previewMimeTypeForName(name);
  const kind = previewKind(name, mimeType);
  return { name, size: bytes.byteLength, mimeType, previewKind: kind, bytes: kind === "none" ? null : bytes };
}

const DIRECTORY_ENTRY_LIMIT = 500;

/** Lists a folder for the side panel: folders first, then files, each sorted by name. */
export async function localDirectoryPreview(path: string, name: string): Promise<FilePreview> {
  const found = await readdir(path, { withFileTypes: true });
  const entries = found
    .filter((entry) => entry.isFile() || entry.isDirectory())
    .map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? ("directory" as const) : ("file" as const) }))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "directory" ? -1 : 1));
  return {
    name,
    size: 0,
    mimeType: "inode/directory",
    previewKind: "directory",
    bytes: null,
    entries: entries.slice(0, DIRECTORY_ENTRY_LIMIT),
    entriesTruncated: entries.length > DIRECTORY_ENTRY_LIMIT,
  };
}

export async function localFilePreview(path: string, name: string, size: number): Promise<FilePreview> {
  if (size > ATTACHMENT_LIMITS.fileBytes) throw new Error(nativeMessage("errors.file.tooLarge"));
  const mimeType = previewMimeTypeForName(name);
  const kind = previewKind(name, mimeType);
  return {
    name,
    size,
    mimeType,
    previewKind: kind,
    bytes: kind === "none" ? null : new Uint8Array(await readFile(path)),
  };
}
