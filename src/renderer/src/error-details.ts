const MAX_ERROR_DETAILS_LENGTH = 2_000;

const REDACTIONS: Array<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{8,}/g, "[redacted]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]"],
  [
    /\b([A-Za-z0-9_-]*(?:key|token|secret|password)[A-Za-z0-9_-]*)(["']?\s*[:=]\s*["']?)([^\s"',;&}]+)/gi,
    "$1$2[redacted]",
  ],
  [/[A-Za-z]:[\\/]Users[\\/][^\\/\s"']+/g, "~"],
  [/\/(?:Users|home)\/[^/\s"']+/g, "~"],
];

/**
 * Masks credentials and the local user's home folder before an error message is copied into a bug report,
 * then caps the result so a very long message cannot flood the clipboard. Redaction runs before the cap,
 * so a secret that straddles the cut is never partially shown.
 */
export function redactErrorDetails(text: string): string {
  const redacted = REDACTIONS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
  if (redacted.length <= MAX_ERROR_DETAILS_LENGTH) return redacted;
  return `${redacted.slice(0, MAX_ERROR_DETAILS_LENGTH - 1)}…`;
}
