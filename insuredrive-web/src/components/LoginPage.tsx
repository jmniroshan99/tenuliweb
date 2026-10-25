import { useRef, useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Globe2,
  LockKeyhole,
  Mail,
  MapPin,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";

type Props = {
  language: string;
  theme: string;
  setLanguage: (language: string) => void;
  setTheme: (theme: string) => void;
  onLogin: (email: string, password: string) => Promise<void>;
  configured: boolean;
  busy: boolean;
  error: string;
};

/** Presentation only: authentication and permissions remain owned by App. */
export default function LoginPage({
  language,
  theme,
  setLanguage,
  setTheme,
  onLogin,
  configured,
  busy,
  error,
}: Props) {
  const t = (en: string, si: string) => (language === "si" ? si : en);
  const [visible, setVisible] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [failure, setFailure] = useState("");
  const submitting = useRef(false);
  const working = signingIn || busy;
  const failureMessage =
    failure === "invalid_credentials"
      ? t(
          "The email or password is incorrect. Please try again.",
          "ඊමේල් ලිපිනය හෝ මුරපදය වැරදියි. නැවත උත්සාහ කරන්න.",
        )
      : failure === "email_not_confirmed"
        ? t(
            "Please confirm your email before signing in.",
            "ඇතුළු වීමට පෙර ඔබගේ ඊමේල් ලිපිනය තහවුරු කරන්න.",
          )
        : failure === "over_request_rate_limit" ||
            failure === "over_email_send_rate_limit"
          ? t(
              "Too many attempts. Please wait a moment and try again.",
              "උත්සාහයන් වැඩියි. මඳක් රැඳී නැවත උත්සාහ කරන්න.",
            )
          : t(
              "Unable to sign in. Check your connection and try again. If this continues, contact your administrator.",
              "ඇතුළු වීමට නොහැකි විය. අන්තර්ජාල සම්බන්ධතාව පරීක්ෂා කර නැවත උත්සාහ කරන්න. ගැටලුව දිගටම පවතී නම් පරිපාලක අමතන්න.",
            );

  return (
    <div className="auth-page">
      <header className="auth-header">
        <div className="auth-brand">
          <img src="/tenuli-capture-logo.png" alt="" width="48" height="48" />
          <div>
            <strong>Tenuli Auto Care</strong>
            <span>
              {t(
                "REPAIRS · PAINTING · RENTALS",
                "අලුත්වැඩියා · පින්තාරු · කුලී රථ",
              )}
            </span>
          </div>
        </div>
        <div className="auth-preferences">
          <button
            type="button"
            className="auth-language"
            onClick={() => setLanguage(language === "en" ? "si" : "en")}
            aria-label={t("Switch to Sinhala", "Switch to English")}
          >
            <Globe2 size={17} aria-hidden="true" />
            <span lang={language === "en" ? "si" : "en"}>
              {language === "en" ? "සිංහල" : "English"}
            </span>
          </button>
          <button
            type="button"
            className="auth-theme"
            aria-label={t(
              "Toggle workspace theme",
              "වැඩබිමේ තේමාව වෙනස් කරන්න",
            )}
            title={t("Workspace theme", "වැඩබිමේ තේමාව")}
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </header>

      <main className="auth-main">
        <section className="auth-story" aria-labelledby="auth-story-title">
          <div className="auth-art" aria-hidden="true">
            <img src="/login-shield.svg" alt="" width="520" height="400" />
          </div>
          <span className="auth-eyebrow">
            {t("YOUR WORKSHOP, CONNECTED", "ඔබේ වැඩබිම එකම තැනකින්")}
          </span>
          <h1 id="auth-story-title">
            {t("Every vehicle.", "සෑම වාහනයක්ම.")}
            <br />
            <span>{t("In good hands.", "විශ්වාසවන්ත දෑතක.")}</span>
          </h1>
          <p>
            {t(
              "From the first repair to the final handover.\nKeep every job, bill and detail in one place.",
              "පළමු අලුත්වැඩියාවේ සිට අවසන් භාරදීම දක්වා.\nසියලු වැඩ, බිල්පත් සහ විස්තර එකම තැනකින්.",
            )}
          </p>
          <div className="auth-services">
            <span>{t("Repair Billing", "අලුත්වැඩියා බිල්පත්")}</span>
            <i aria-hidden="true" />
            <span>{t("Shop Costs & Profit", "වියදම් සහ ලාභ")}</span>
            <i aria-hidden="true" />
            <span>{t("Rentals", "කුලී රථ")}</span>
          </div>
        </section>

        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-card-mark">
            <LockKeyhole size={23} aria-hidden="true" />
          </div>
          <span className="auth-eyebrow">
            {t("TENULI WORKSPACE", "TENULI වැඩබිම")}
          </span>
          <h2 id="auth-title">{t("Welcome back.", "නැවතත් සාදරයෙන්.")}</h2>
          <p className="auth-intro">
            {t(
              "Sign in to manage your day.",
              "ඔබේ දවසේ වැඩ කළමනාකරණයට ඇතුළු වන්න.",
            )}
          </p>

          <form
            aria-label={t("Sign in", "ඇතුළු වන්න")}
            aria-busy={working}
            onSubmit={async (e) => {
              e.preventDefault();
              if (submitting.current || working || !configured) return;
              const values = new FormData(e.currentTarget);
              submitting.current = true;
              setSigningIn(true);
              setFailure("");
              try {
                await onLogin(
                  String(values.get("email") || "").trim(),
                  String(values.get("password") || ""),
                );
              } catch (cause) {
                setFailure((cause as { code?: string })?.code || "unknown");
              } finally {
                submitting.current = false;
                setSigningIn(false);
              }
            }}
          >
            <label htmlFor="login-email">
              {t("Email address", "ඊමේල් ලිපිනය")}
            </label>
            <div className="auth-field">
              <Mail size={19} aria-hidden="true" />
              <input
                id="login-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                disabled={working}
                placeholder="you@example.com"
                onChange={() => setFailure("")}
              />
            </div>
            <label htmlFor="login-password">{t("Password", "මුරපදය")}</label>
            <div className="auth-field">
              <LockKeyhole size={19} aria-hidden="true" />
              <input
                id="login-password"
                name="password"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                required
                disabled={working}
                placeholder={t("Enter your password", "ඔබේ මුරපදය")}
                onChange={() => setFailure("")}
              />
              <button
                type="button"
                className="auth-reveal"
                aria-label={t(
                  visible ? "Hide password" : "Show password",
                  visible ? "මුරපදය සඟවන්න" : "මුරපදය පෙන්වන්න",
                )}
                aria-controls="login-password"
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
            <details className="auth-help">
              <summary>
                {t("Need help signing in?", "ඇතුළු වීමට උදව් අවශ්‍යද?")}
              </summary>
              <p>
                {t(
                  "Use your existing Tenuli Auto Care email and password. For account access or a forgotten password, contact your administrator.",
                  "ඔබගේ Tenuli Auto Care ඊමේල් ලිපිනය සහ මුරපදය භාවිතා කරන්න. ගිණුමට ප්‍රවේශය හෝ අමතක වූ මුරපදයක් සඳහා පරිපාලක අමතන්න.",
                )}
              </p>
            </details>
            {failure && (
              <p className="auth-message auth-failure" role="alert">
                {failureMessage}
              </p>
            )}
            {error && (
              <p className="auth-message auth-failure" role="alert">
                {error}
              </p>
            )}
            {new URLSearchParams(window.location.search).get("signedout") ===
              "unconfirmed" && (
              <p className="auth-message" role="status">
                {t(
                  "Signed out in this tab. Server session revocation could not be confirmed. Contact your administrator if you need all sessions revoked.",
                  "මෙම පටිත්තෙන් ඉවත් විය. සේවාදායක සැසිය අවලංගු කිරීම තහවුරු කළ නොහැකි විය. සියලු සැසි අවලංගු කිරීමට පරිපාලක අමතන්න.",
                )}
              </p>
            )}
            {!configured && (
              <p className="auth-message" role="status">
                {t(
                  "Sign-in is not connected yet. Ask your administrator to complete setup.",
                  "ඇතුළු වීම තවම සකසා නැත. සැකසුම් සම්පූර්ණ කිරීමට පරිපාලක අමතන්න.",
                )}
              </p>
            )}
            <button
              type="submit"
              className="auth-submit"
              disabled={working || !configured}
            >
              {signingIn
                ? t("Signing in…", "ඇතුළු වෙමින්…")
                : t("Sign in", "ඇතුළු වන්න")}
              <ArrowRight size={20} aria-hidden="true" />
            </button>
            <div className="auth-account-note">
              <ShieldCheck size={15} aria-hidden="true" />
              <span>
                {t(
                  "Your existing account. Your workspace.",
                  "ඔබගේ ගිණුම. ඔබගේ වැඩබිම.",
                )}
              </span>
            </div>
          </form>
        </section>
      </main>
      <footer className="auth-footer">
        <span>
          <MapPin size={14} aria-hidden="true" />
          {t("Yakkala, Sri Lanka", "යක්කල, ශ්‍රී ලංකාව")}
        </span>
        <span>
          Tenuli Auto Care <i aria-hidden="true">/</i>{" "}
          {t("Care in every detail.", "සෑම විස්තරයකටම සැලකිල්ල.")}
        </span>
      </footer>
    </div>
  );
}
