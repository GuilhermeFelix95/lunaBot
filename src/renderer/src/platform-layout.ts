import type { DesktopPlatform } from "@lunabot/contracts/ipc";

export interface PlatformLayout {
  /** The account dock sits in a leading column beside the sidebar on every desktop platform. */
  withLeadingColumn: boolean;
  /** macOS only: traffic-light spacing and the hybrid account shelf. */
  macOSChrome: boolean;
}

const UNKNOWN_LAYOUT: PlatformLayout = { withLeadingColumn: false, macOSChrome: false };

/** Layout decisions for a known desktop platform. Linux follows Windows; only macOS differs. */
export function platformLayout(platform: DesktopPlatform | null | undefined): PlatformLayout {
  if (!platform) return UNKNOWN_LAYOUT;
  return { withLeadingColumn: true, macOSChrome: platform === "darwin" };
}

/**
 * Platform to assume when the main process cannot report one. Reads the browser identity so that
 * Linux and macOS are not mislabelled as Windows; anything else falls back to Windows.
 */
export function fallbackDesktopPlatform(identity: string = navigatorIdentity()): DesktopPlatform {
  if (/mac/iu.test(identity)) return "darwin";
  if (/linux/iu.test(identity)) return "linux";
  return "win32";
}

function navigatorIdentity(): string {
  const navigatorLike: { platform?: string; userAgent?: string; userAgentData?: { platform?: string } } =
    globalThis.navigator ?? {};
  return [navigatorLike.userAgentData?.platform, navigatorLike.platform, navigatorLike.userAgent].join(" ");
}
