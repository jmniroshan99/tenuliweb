/** Validate public client configuration; never include key values in errors. */
export function publicAuthConfig(rawURL?: string, rawKey?: string) {
  const url = rawURL?.trim() || "",
    key = rawKey?.trim() || "";
  const invalid = (reason: string) => ({
    valid: false,
    url: "",
    key: "",
    reason,
  });
  if (!url || !key || url.includes("YOUR_PROJECT") || key.includes("YOUR_"))
    return invalid("Supabase URL and public key are required.");
  try {
    const parsed = new URL(url);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      parsed.hostname,
    );
    if (
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.pathname !== "/" && parsed.pathname !== "") ||
      (parsed.protocol !== "https:" &&
        !(loopback && parsed.protocol === "http:"))
    )
      return invalid(
        "Use an HTTPS Supabase origin, or HTTP on localhost for local development.",
      );
    if (key.startsWith("sb_publishable_") && /^[A-Za-z0-9_-]+$/.test(key))
      return { valid: true, url: parsed.origin, key, reason: "" };
    // Compatibility for existing anon JWTs only. This is key classification,
    // not JWT verification; Supabase validates every actual request.
    const parts = key.split(".");
    if (parts.length === 3) {
      const claims = JSON.parse(
        atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (claims.role === "anon")
        return { valid: true, url: parsed.origin, key, reason: "" };
    }
  } catch {
    return invalid("Invalid Supabase public configuration.");
  }
  return invalid(
    "Only a publishable key or legacy anon key is allowed in frontend configuration.",
  );
}
