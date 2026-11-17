export function buildContentSecurityPolicy(packaged: boolean): string {
  const developmentSources = packaged ? "" : " http://localhost:* ws://localhost:*";
  const developmentImageSources = packaged ? "" : " http://127.0.0.1:* http://localhost:*";
  const developmentFrameSources = packaged ? "" : " http://127.0.0.1:* http://localhost:*";

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: lunabot-attachment: lunabot-avatar: https:${developmentImageSources}`,
    "font-src 'self' data:",
    "media-src 'self' blob:",
    `connect-src 'self' lunabot-attachment:${developmentSources}`,
    "object-src 'none'",
    `frame-src 'self' lunabot-attachment:${developmentFrameSources}`,
    "base-uri 'none'",
  ].join("; ");
}
