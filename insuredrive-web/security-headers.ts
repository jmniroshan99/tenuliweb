import { publicAuthConfig } from "./src/lib/auth-config";

export function securityHeaders(url?: string, key?: string) {
  const config = publicAuthConfig(url, key);
  const origin = config.valid ? config.url : "";
  const socket = origin.replace(/^http/, "ws");
  // Inline styles are needed for React, Leaflet and the print/PDF renderer.
  // Inline scripts, eval, arbitrary connections and embedded sites are blocked.
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob: ${origin} https://*.tile.openstreetmap.org`.trim(),
    `connect-src 'self' ${origin} ${socket}`.trim(),
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  return {
    "Content-Security-Policy": policy,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy":
      "camera=(), microphone=(), payment=(), geolocation=(self)",
    "Cache-Control": "no-store",
  };
}
