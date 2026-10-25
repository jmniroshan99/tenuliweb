import type { SupabaseClient } from "@supabase/supabase-js";

export class PasswordChangeError extends Error {
  code: string;
  constructor(code: string, message = code) {
    super(message);
    this.code = code;
  }
}
export type PasswordActor = {
  id: string;
  email: string;
  role: string;
  active: boolean;
};
type Dependencies = {
  actor: () => Promise<PasswordActor>;
  createClient: () => Pick<SupabaseClient, "auth">;
};
export async function changeOwnPassword(
  current: string,
  next: string,
  confirmation: string,
  deps: Dependencies,
): Promise<{ verified: boolean }> {
  if (!current || !next || !confirmation)
    throw new PasswordChangeError("required");
  if (next !== confirmation) throw new PasswordChangeError("mismatch");
  if (next === current) throw new PasswordChangeError("same_password");
  const actor = await deps.actor();
  if (!actor.active || actor.role !== "administrator" || !actor.email)
    throw new PasswordChangeError("administrator_required");
  const client = deps.createClient();
  let verifier: ReturnType<Dependencies["createClient"]> | undefined;
  try {
    // An isolated, memory-only session proves the current password without
    // replacing the session used by the app or broadcasting a login event.
    const login = await client.auth.signInWithPassword({
      email: actor.email,
      password: current,
    });
    if (login.error)
      throw new PasswordChangeError(
        login.error.code === "invalid_credentials"
          ? "current_password"
          : login.error.code || "connection",
      );
    if (!login.data.session || login.data.user?.id !== actor.id)
      throw new PasswordChangeError("identity_changed");
    const checked = await deps.actor();
    if (
      checked.id !== actor.id ||
      !checked.active ||
      checked.role !== "administrator"
    )
      throw new PasswordChangeError("identity_changed");
    // The pinned SDK's UserAttributes uses current_password (snake case).
    // Supabase enforces its configured length, strength and reuse rules.
    const updated = await client.auth.updateUser({
      password: next,
      current_password: current,
    });
    if (updated.error)
      throw new PasswordChangeError(
        updated.error.code || "update_failed",
        updated.error.message,
      );
    // A successful update and a successful fresh login are separate outcomes.
    // Never tell the user the update failed merely because verification lost
    // its connection or hit a provider rate limit after the change committed.
    try {
      verifier = deps.createClient();
      const check = await verifier.auth.signInWithPassword({
        email: actor.email,
        password: next,
      });
      return {
        verified:
          !check.error &&
          !!check.data.session &&
          check.data.user?.id === actor.id,
      };
    } catch {
      return { verified: false };
    }
  } finally {
    // Revoke only our temporary sessions, never the other app sessions.
    await Promise.allSettled([
      client.auth.signOut({ scope: "local" }),
      ...(verifier ? [verifier.auth.signOut({ scope: "local" })] : []),
    ]);
  }
}
