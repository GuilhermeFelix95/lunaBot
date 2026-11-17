import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./content-security-policy";

describe("buildContentSecurityPolicy", () => {
  it("allows only the origins the packaged renderer uses", () => {
    const policy = buildContentSecurityPolicy(true);

    expect(policy).toContain("connect-src 'self' lunabot-attachment:;");
    expect(policy).toContain("frame-src 'self' lunabot-attachment:;");
    expect(policy).toContain("img-src 'self' data: lunabot-attachment: lunabot-avatar: https:;");
    expect(policy).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: lunabot-attachment: lunabot-avatar: https:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' lunabot-attachment:; object-src 'none'; frame-src 'self' lunabot-attachment:; base-uri 'none'",
    );
    expect(policy).not.toContain("analytics");
    expect(policy).not.toContain("ws:");
    expect(policy).not.toContain("wss:");
    expect(policy).not.toContain("localhost");
  });

  it("keeps local development sources", () => {
    const policy = buildContentSecurityPolicy(false);

    expect(policy).toContain("http://localhost:*");
    expect(policy).toContain("ws://localhost:*");
  });

  it("allows attachment previews to be fetched", () => {
    const policy = buildContentSecurityPolicy(true);

    expect(policy).toContain("connect-src 'self' lunabot-attachment:");
  });
});
