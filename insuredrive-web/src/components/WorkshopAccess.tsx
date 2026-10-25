import { useState } from "react";
import {
  FileText,
  Wrench,
  ArrowUpRight,
  RefreshCw,
  Download,
  Copy,
  ExternalLink,
} from "lucide-react";
import { workshopAccess, workshopProblem } from "../lib/workshop-access";
export function AutomartLauncher({
  role,
  permissions,
  language,
  onOpen,
}: {
  role: string;
  permissions: Set<string>;
  language: string;
  onOpen: (page: string) => void;
}) {
  const access = workshopAccess(role, permissions),
    t = (en: string, si: string) => (language === "si" ? si : en);
  if (!access.showRepairs && !access.showShop) return null;
  return (
    <section
      className="automart-launcher card"
      aria-label="Automart & Services"
    >
      <div className="section-head">
        <div>
          <span className="eyebrow blue">TENULI AUTO CARE</span>
          <h2>{t("Automart & Services", "ඔටෝමාට් සහ සේවා")}</h2>
          <p>
            {t(
              "Manage repair work, customer bills, external shops and job profit.",
              "අලුත්වැඩියා, බිල්පත්, බාහිර වෙළඳසැල් වියදම් සහ ලාභ කළමනාකරණය කරන්න.",
            )}
          </p>
        </div>
        <Wrench size={24} />
      </div>
      <div className="automart-launcher-grid">
        {access.showRepairs && (
          <button onClick={() => onOpen("repairs")}>
            <FileText size={23} />
            <span>
              <strong>{t("Repair Billing", "අලුත්වැඩියා බිල්පත්")}</strong>
              <small>
                {t(
                  "Estimates · Service jobs · Invoices · Payments",
                  "ඇස්තමේන්තු · සේවා වැඩ · බිල්පත් · ගෙවීම්",
                )}
              </small>
              {!access.repairs && (
                <small className="tenuli-warning">
                  {t(
                    "Setup or permissions need attention",
                    "සැකසුම් හෝ අවසර පරීක්ෂා කරන්න",
                  )}
                </small>
              )}
            </span>
            <ArrowUpRight size={19} />
          </button>
        )}
        {access.showShop && (
          <button onClick={() => onOpen("shop-costs")}>
            <Wrench size={23} />
            <span>
              <strong>{t("Shop Costs & Profit", "වියදම් සහ ලාභ")}</strong>
              <small>
                {t(
                  "Suppliers · Parts · Outsourced services · Profit",
                  "සැපයුම්කරුවන් · අමතර කොටස් · බාහිර සේවා · ලාභ",
                )}
              </small>
              {!access.shop && (
                <small className="tenuli-warning">
                  {t(
                    "Setup or permissions need attention",
                    "සැකසුම් හෝ අවසර පරීක්ෂා කරන්න",
                  )}
                </small>
              )}
            </span>
            <ArrowUpRight size={19} />
          </button>
        )}
      </div>
    </section>
  );
}
export function WorkshopSetup({
  module,
  administrator,
  language,
  onRetry,
  error,
  upgrade = false,
}: {
  module: string;
  administrator: boolean;
  language: string;
  onRetry: () => Promise<void>;
  error?: Error & { code?: string };
  upgrade?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const t = (en: string, si: string) => (language === "si" ? si : en),
    problem = upgrade ? "installation" : workshopProblem(error);
  const projectUrl = import.meta.env.VITE_SUPABASE_URL || "";
  let dashboard = "https://supabase.com/dashboard";
  try {
    const ref = new URL(projectUrl).hostname.split(".")[0];
    if (/^[a-z0-9]{20}$/.test(ref))
      dashboard = `https://supabase.com/dashboard/project/${ref}/sql/new`;
  } catch {
    /* generic dashboard */
  }
  async function retry() {
    setBusy(true);
    setNotice("");
    try {
      await onRetry();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    setNotice("");
    try {
      const r = await fetch("/setup/ENABLE_AUTOMART.sql");
      if (!r.ok)
        throw Error("Could not load setup SQL. Use the file in the ZIP.");
      const sql = await r.text();
      if (!sql.startsWith("-- Tenuli Auto Care"))
        throw Error(
          "Setup file unavailable. Use supabase/ENABLE_AUTOMART.sql from the ZIP.",
        );
      await navigator.clipboard.writeText(sql);
      setNotice(
        t(
          "SQL copied. Paste it into the existing project’s SQL Editor.",
          "SQL පිටපත් කළා. දැනට ඇති project එකේ SQL Editor එකට paste කරන්න.",
        ),
      );
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  return (
    <section className="card automart-setup" aria-label="Automart setup">
      <span className="eyebrow blue">AUTOMART & SERVICES</span>
      <h2>{module}</h2>
      <h3>
        {upgrade
          ? t(
              "Simple billing update is required",
              "සරල බිල්පත් යාවත්කාලීන කිරීම අවශ්‍යයි",
            )
          : problem === "installation"
            ? t(
                "Workshop database setup is required",
                "සේවා දත්ත ගබඩාව සකස් කළ යුතුයි",
              )
            : problem === "permissions"
              ? t(
                  "Workshop access needs attention",
                  "සේවා ප්‍රවේශය පරීක්ෂා කරන්න",
                )
              : t("Could not load workshop records", "සේවා වාර්තා ලබාගත නොහැක")}
      </h3>
      <p>
        {upgrade
          ? t(
              "Run the setup SQL included with this version to enable simple billing. Existing records and issued totals are preserved.",
              "සරල බිල්පත් සඳහා මෙම අනුවාදයේ SQL සැකසුම ක්‍රියාත්මක කරන්න. පැරණි වාර්තා සහ නිකුත් කළ මුදල් සුරැකේ.",
            )
          : problem === "installation"
            ? t(
                "This app includes the workshop screens, but the connected database has not made their functions available.",
                "මෙම යෙදුමේ සේවා තිර තිබුණත් දත්ත ගබඩාවේ අදාළ functions තවම ලබාගත නොහැක.",
              )
            : problem === "permissions"
              ? t(
                  "Your current account has not received permission for this section. This can happen before the workshop database setup is installed, or when access has been disabled.",
                  "මෙම කොටසට ඔබේ ගිණුමේ අවසර නොමැත. දත්ත ගබඩා සැකසුම හෝ ගිණුම් අවසර පරීක්ෂා කරන්න.",
                )
              : t(
                  "Check the connection and try again. Your existing records have not been changed.",
                  "සම්බන්ධතාවය පරීක්ෂා කර නැවත උත්සාහ කරන්න.",
                )}
      </p>
      {administrator && problem !== "connection" && (
        <>
          <ol>
            <li>
              {t(
                "Back up the database and run ENABLE_AUTOMART.sql from this ZIP in your existing Supabase project’s SQL Editor. It installs missing modules and updates simple billing.",
                "සැකසුම කර නොමැති නම් දත්ත ගබඩාව backup කර ENABLE_AUTOMART.sql දැනට ඇති Supabase project එකේ SQL Editor තුළ Run කරන්න.",
              )}
            </li>
            <li>
              {t(
                "If it is already installed, review the account’s Repair permissions in Access & audit. Explicitly disabled permissions stay disabled.",
                "දැනටමත් සකස් කර ඇත්නම් Access & audit තුළ ගිණුමේ Repair අවසර පරීක්ෂා කරන්න.",
              )}
            </li>
            <li>
              {t(
                "Click Check access again below, or sign out and sign back in.",
                "පහත නැවත පරීක්ෂා බොත්තම ඔබන්න, නැතිනම් නැවත sign in වන්න.",
              )}
            </li>
          </ol>
          <div className="tenuli-actions">
            <a
              className="automart-button"
              href="/setup/ENABLE_AUTOMART.sql"
              download="ENABLE_AUTOMART.sql"
            >
              <Download size={16} />
              {t("Download setup SQL", "SQL බාගන්න")}
            </a>
            <button onClick={copy}>
              <Copy size={16} />
              {t("Copy setup SQL", "SQL පිටපත් කරන්න")}
            </button>
            <a
              className="automart-button"
              href={dashboard}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={16} />
              {t("Open SQL Editor", "SQL Editor විවෘත කරන්න")}
            </a>
          </div>
        </>
      )}
      {!administrator && problem !== "connection" && (
        <p>
          {t(
            "Ask your administrator to enable the appropriate Repair permissions.",
            "අදාළ Repair අවසර ලබාදෙන ලෙස පරිපාලකගෙන් ඉල්ලන්න.",
          )}
        </p>
      )}
      <button className="primary" disabled={busy} onClick={retry}>
        <RefreshCw size={16} />
        {busy
          ? t("Checking…", "පරීක්ෂා කරමින්…")
          : t("Check access again", "නැවත ප්‍රවේශය පරීක්ෂා කරන්න")}
      </button>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <details>
          <summary>{t("Technical details", "තාක්ෂණික විස්තර")}</summary>
          <p>
            {error.code} {error.message}
          </p>
        </details>
      )}
    </section>
  );
}
