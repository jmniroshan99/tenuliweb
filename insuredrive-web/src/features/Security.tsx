import { useRef, useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { identity, supabase } from "../lib/api";
import { changeOwnPassword, PasswordChangeError } from "../lib/password-flow";

export default function Security({
  language,
  onSignOut,
}: {
  language: string;
  onSignOut: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState<null | { verified: boolean }>(null),
    [shown, setShown] = useState<Record<string, boolean>>({});
  const inFlight = useRef(false);
  const t = (en: string, si: string) => (language === "si" ? si : en);
  const fields = [
    ["current", t("Current Password", "දැනට ඇති මුරපදය"), "current-password"],
    ["next", t("New Password", "නව මුරපදය"), "new-password"],
    [
      "confirm",
      t("Confirm New Password", "නව මුරපදය තහවුරු කරන්න"),
      "new-password",
    ],
  ];
  function message(e: unknown) {
    const code = e instanceof PasswordChangeError ? e.code : "connection";
    if (code === "required")
      return t(
        "Complete all three password fields.",
        "මුරපද කොටු තුනම පුරවන්න.",
      );
    if (code === "mismatch")
      return t("The new passwords do not match.", "නව මුරපද දෙක නොගැළපේ.");
    if (code === "same_password")
      return t("Choose a different new password.", "වෙනත් නව මුරපදයක් තෝරන්න.");
    if (
      [
        "current_password",
        "invalid_credentials",
        "invalid_current_password",
      ].includes(code)
    )
      return t(
        "Current password is incorrect. Try again.",
        "දැනට ඇති මුරපදය වැරදියි. නැවත උත්සාහ කරන්න.",
      );
    if (code === "weak_password")
      return (
        t(
          "Password does not meet your account’s security rules: ",
          "මුරපදය ගිණුමේ ආරක්ෂක නීති සපුරා නැත: ",
        ) + (e as Error).message
      );
    if (["administrator_required", "identity_changed"].includes(code))
      return t(
        "Sign in again with your active administrator account.",
        "සක්‍රිය පරිපාලක ගිණුමෙන් නැවත පිවිසෙන්න.",
      );
    if (code.includes("rate_limit") || code === "over_request_rate_limit")
      return t(
        "Too many attempts. Wait a moment before trying again.",
        "උත්සාහ වැඩියි. මඳ වේලාවකින් නැවත උත්සාහ කරන්න.",
      );
    if (
      [
        "reauthentication_needed",
        "reauthentication_not_valid",
        "insufficient_aal",
      ].includes(code)
    )
      return t(
        "Your account requires an additional security check. Complete it with your account provider, then try again.",
        "ගිණුමට අමතර ආරක්ෂක තහවුරුවක් අවශ්‍යයි. එය සම්පූර්ණ කර නැවත උත්සාහ කරන්න.",
      );
    return t(
      "Could not confirm the password change. Check your connection. If the request was interrupted, try signing in with the new password before retrying.",
      "මුරපද වෙනස තහවුරු කළ නොහැක. සම්බන්ධතාවය පරීක්ෂා කරන්න. ඉල්ලීම අතරමඟ නතර වූයේ නම් නැවත උත්සාහයට පෙර නව මුරපදයෙන් පිවිස බලන්න.",
    );
  }
  return (
    <section className="card security-card" aria-label="Security">
      <div className="section-head">
        <div>
          <span className="eyebrow blue">{t("Security", "ආරක්ෂාව")}</span>
          <h2>
            <LockKeyhole size={21} />{" "}
            {t("Change Password", "මුරපදය වෙනස් කරන්න")}
          </h2>
          <p>
            {t(
              "Change the password for your own administrator account.",
              "ඔබගේ පරිපාලක ගිණුමේ මුරපදය වෙනස් කරන්න.",
            )}
          </p>
        </div>
      </div>
      <form
        autoComplete="off"
        onSubmit={async (e) => {
          e.preventDefault();
          if (inFlight.current) return;
          const form = e.currentTarget;
          inFlight.current = true;
          setBusy(true);
          setError("");
          setSuccess(null);
          try {
            const values = new FormData(form);
            const result = await changeOwnPassword(
              String(values.get("current") || ""),
              String(values.get("next") || ""),
              String(values.get("confirm") || ""),
              {
                actor: async () => {
                  if (!supabase)
                    throw new PasswordChangeError("administrator_required");
                  const { data, error } = await supabase.auth.getUser();
                  if (error || !data.user)
                    throw new PasswordChangeError("administrator_required");
                  const who = await identity();
                  return {
                    id: data.user.id,
                    email: data.user.email || "",
                    role: who.profile.role,
                    active:
                      who.profile.id === data.user.id &&
                      who.profile.account_status === "active" &&
                      who.profile.is_active !== false,
                  };
                },
                createClient: () =>
                  createClient(
                    import.meta.env.VITE_SUPABASE_URL,
                    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                    {
                      auth: {
                        persistSession: false,
                        autoRefreshToken: false,
                        detectSessionInUrl: false,
                        storageKey:
                          "tenuli-password-check-" + crypto.randomUUID(),
                      },
                    },
                  ),
              },
            );
            setSuccess(result);
          } catch (e) {
            setError(message(e));
          } finally {
            form.reset();
            setShown({});
            setBusy(false);
            inFlight.current = false;
          }
        }}
      >
        <fieldset disabled={busy} className="security-fields">
          {fields.map(([name, label, autocomplete]) => (
            <div key={name} className="password-field">
              <label htmlFor={"password-" + name}>{label}</label>
              <div className="password-input">
                <input
                  id={"password-" + name}
                  name={name}
                  type={shown[name] ? "text" : "password"}
                  autoComplete={autocomplete}
                  required
                  spellCheck={false}
                  autoCapitalize="none"
                />
                <button
                  type="button"
                  aria-label={(shown[name] ? "Hide " : "Show ") + label}
                  aria-pressed={!!shown[name]}
                  onClick={() => setShown((s) => ({ ...s, [name]: !s[name] }))}
                >
                  {shown[name] ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          ))}
        </fieldset>
        <p className="muted">
          {t(
            "Your account’s password rules apply. For security, these fields clear after each attempt.",
            "ගිණුමේ මුරපද නීති අදාළ වේ. සෑම උත්සාහයකින් පසු මෙම කොටු හිස් වේ.",
          )}
        </p>
        <button className="primary" disabled={busy}>
          {busy
            ? t("Checking and saving…", "පරීක්ෂා කර සුරකිමින්…")
            : t("Change Password", "මුරපදය වෙනස් කරන්න")}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <div className="tenuli-note" role="status">
          <p>
            {success.verified
              ? t(
                  "Password changed. Sign-in with your new password was verified.",
                  "මුරපදය වෙනස් කළා. නව මුරපදයෙන් පිවිසිය හැකි බව තහවුරු කළා.",
                )
              : t(
                  "Password changed, but sign-in could not be verified. Use your new password next time you sign in.",
                  "මුරපදය වෙනස් කළා, නමුත් පිවිසීම තහවුරු කළ නොහැකි විය. නැවත පිවිසීමේදී නව මුරපදය භාවිත කරන්න.",
                )}
          </p>
          <button onClick={onSignOut}>
            {t("Sign out and sign in again", "ඉවත් වී නැවත පිවිසෙන්න")}
          </button>
        </div>
      )}
    </section>
  );
}
