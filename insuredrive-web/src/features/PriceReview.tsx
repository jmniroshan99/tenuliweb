import { useState } from "react";
import { repair } from "../lib/repair-api";
import { decimalMinor, money } from "../lib/format";
import { previewRepair, type RepairLine } from "../lib/repair-model";
import { packageAllocations } from "../lib/price-review";
import type { Row } from "../lib/types";
export default function PriceReview({
  job,
  reviews,
  language,
  manage,
  enabled,
  refresh,
}: {
  job: Row;
  reviews: Row[];
  language: string;
  manage: boolean;
  enabled: boolean;
  refresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [note, setNote] = useState(""),
    [decisionReasons, setDecisionReasons] = useState<Record<string, string>>(
      {},
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const t = (en: string, si: string) => (language === "si" ? si : en);
  const lines: RepairLine[] = job.lines || [],
    chosen = lines.filter((l) => selected.includes(l.id)),
    kind = chosen.length > 1 ? "package" : "item";
  let allocations: { id: string; amount_minor: number }[] = [],
    previewError = "";
  try {
    if (chosen.length && amount !== "") {
      const target = decimalMinor(amount);
      allocations =
        kind === "package"
          ? packageAllocations(chosen, target)
          : [{ id: chosen[0].id, amount_minor: target }];
    }
  } catch (e) {
    previewError = (e as Error).message;
  }
  const scoped = reviews.filter((r) => r.job_id === job.id),
    pending = scoped.filter((r) => !r.parent_id),
    changes = new Map(
      scoped.filter((r) => r.parent_id).map((r) => [r.parent_id, r]),
    );
  const labels: Record<string, string> = {
    pending: t("Pending Review", "සමාලෝචනයට ඇත"),
    accepted: t("Accepted", "පිළිගෙන ඇත"),
    rejected: t("Rejected", "ප්‍රතික්ෂේප කර ඇත"),
    not_required: t("Not Required", "අවශ්‍ය නැත"),
  };
  async function run(action: string, p: Row) {
    setBusy(true);
    setError("");
    try {
      await repair(action, { job_id: job.id, version: job.version, ...p });
      await refresh();
      setSelected([]);
      setAmount("");
      setReason("");
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="more-details price-review">
      <summary>
        {t("Price Review · internal", "මිල සමාලෝචනය · අභ්‍යන්තර")}
      </summary>
      <p className="tenuli-note">
        {t(
          "Proposals do not change prices. Accepting creates a numbered estimate revision and resets customer and insurer approvals separately. Existing issued copies remain unchanged. Never infer charges from handwritten notes.",
          "යෝජනාවක් නිසා මිල වෙනස් නොවේ. පිළිගැනීමෙන් නව estimate සංශෝධනයක් සෑදී customer සහ insurer අනුමැති නැවත අවශ්‍ය වේ. නිකුත් කළ පිටපත් නොවෙනස් වේ. අත්අකුරු සටහන් වලින් ගාස්තු අනුමාන නොකරන්න.",
        )}
      </p>
      {!enabled && (
        <p role="alert">
          {t(
            "Install the supplied pricing upgrade before using Price Review.",
            "Price Review සඳහා සැපයූ database upgrade එක යොදන්න.",
          )}
        </p>
      )}
      {manage && enabled && (
        <div className="price-review-compose">
          <h4>
            {t(
              "Review an item or Group Price / Package Amount",
              "අයිතම මිල හෝ කණ්ඩායම් මිල සමාලෝචනය",
            )}
          </h4>
          {lines
            .filter((l) => !l.excluded)
            .map((l) => (
              <label className="tenuli-check" key={l.id}>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={selected.includes(l.id)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked
                        ? [...s, l.id]
                        : s.filter((id) => id !== l.id),
                    )
                  }
                />
                {l.description} {l.position ? `· ${l.position}` : ""} ·{" "}
                {previewRepair([l]).pending
                  ? "M/R"
                  : money(previewRepair([l]).net_minor)}
              </label>
            ))}
          <div className="form-grid">
            <label>
              {t(
                "Proposed line / package amount (LKR)",
                "යෝජිත අයිතම / කණ්ඩායම් මුදල (රු.)",
              )}
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              {t("Reason", "හේතුව")}
              <input
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <label className="full">
              {t(
                "Supporting note / document reference (internal)",
                "සහායක සටහන / ලේඛන යොමුව (අභ්‍යන්තර)",
              )}
              <textarea
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </div>
          {previewError && (
            <p role="alert" className="error">
              {previewError}
            </p>
          )}
          {!!allocations.length && (
            <div className="table-scroll">
              <table>
                <caption>
                  {t(
                    "Allocation preview — no extra package charge",
                    "මුදල් බෙදීමේ පෙරදසුන — අමතර package ගාස්තුවක් නැත",
                  )}
                </caption>
                <thead>
                  <tr>
                    <th>{t("Item", "අයිතමය")}</th>
                    <th>{t("Current amount", "දැනට මුදල")}</th>
                    <th>{t("Proposed allocation", "යෝජිත කොටස")}</th>
                    <th>{t("Difference", "වෙනස")}</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((a) => {
                    const l = chosen.find((l) => l.id === a.id)!,
                      old = previewRepair([l]);
                    return (
                      <tr key={a.id}>
                        <td>{l.description}</td>
                        <td>{old.pending ? "M/R" : money(old.net_minor)}</td>
                        <td>{money(a.amount_minor)}</td>
                        <td>
                          {old.pending
                            ? "—"
                            : money(a.amount_minor - old.net_minor)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p>
                {t(
                  "Proportional allocation in cents. Largest remainders receive remaining cents; stable item ID breaks ties. Original quotations are retained.",
                  "ශත අනුව සමානුපාතිකව බෙදේ. ඉතිරි ශත විශාලම භාගයට; සම නම් ස්ථිර item ID අනුව. මුල් මිල රැකේ.",
                )}
              </p>
            </div>
          )}
          <div className="tenuli-actions">
            <button
              type="button"
              disabled={
                busy || !allocations.length || !reason.trim() || !!previewError
              }
              onClick={() =>
                void run("price_propose", {
                  kind,
                  line_ids: selected,
                  proposed_minor: decimalMinor(amount),
                  reason,
                  supporting_note: note,
                })
              }
            >
              {t("Record proposal for review", "සමාලෝචනයට යෝජනාව සුරකින්න")}
            </button>
            <button
              type="button"
              disabled={busy || chosen.length !== 1 || !reason.trim()}
              onClick={() =>
                void run("price_propose", {
                  kind: "item",
                  line_ids: selected,
                  status: "not_required",
                  reason,
                  supporting_note: note,
                })
              }
            >
              {t("Mark Not Required", "සමාලෝචනය අවශ්‍ය නැත")}
            </button>
          </div>
        </div>
      )}
      {pending.map((r) => {
        const decision = changes.get(r.id),
          status = decision?.status || r.status,
          original = previewRepair(r.original_lines),
          rawQuote = previewRepair(
            r.original_lines.map((l: RepairLine) => ({
              ...l,
              agreed_minor: null,
            })),
          );
        return (
          <article className="review-record" key={r.id}>
            <h4>
              {r.kind === "package"
                ? t("Package review", "කණ්ඩායම් මිල සමාලෝචනය")
                : t("Item review", "අයිතම මිල සමාලෝචනය")}{" "}
              · {labels[status]}
            </h4>
            <p>
              {r.original_lines
                .map((l: RepairLine) => l.description)
                .join(" · ")}
            </p>
            <dl className="review-values">
              <div>
                <dt>{t("Original quoted amount", "මුල් යෝජිත මුදල")}</dt>
                <dd>
                  {rawQuote.pending
                    ? `M/R · ${money(rawQuote.net_minor)} ${t("known", "දන්නා")}`
                    : money(rawQuote.net_minor)}
                </dd>
              </div>
              <div>
                <dt>{t("Proposed revised amount", "යෝජිත සංශෝධිත මුදල")}</dt>
                <dd>
                  {r.proposed_minor == null ? "—" : money(r.proposed_minor)}
                </dd>
              </div>
              <div>
                <dt>{t("Final agreed amount", "අවසන් එකඟ වූ මුදල")}</dt>
                <dd>
                  {status === "accepted"
                    ? money(decision!.proposed_minor)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>{t("Difference from prior amount", "පෙර මුදලට වෙනස")}</dt>
                <dd>
                  {original.pending || r.proposed_minor == null
                    ? "—"
                    : money(r.proposed_minor - original.net_minor)}
                </dd>
              </div>
            </dl>
            <p>
              {t("Reason", "හේතුව")}: {r.reason}
            </p>
            {r.supporting_note && <p>{r.supporting_note}</p>}
            <small>
              {t("Recorded by", "සටහන් කළේ")}: {r.recorded_by} ·{" "}
              {new Date(r.recorded_at).toLocaleString(
                language === "si" ? "si-LK" : "en-GB",
                { timeZone: "Asia/Colombo" },
              )}{" "}
              (Asia/Colombo)
            </small>
            <details>
              <summary>
                {t(
                  "Preserved quotations and allocation",
                  "රැකගත් මිල සහ බෙදීම",
                )}
              </summary>
              {r.original_lines.map((l: RepairLine) => (
                <p key={l.id}>
                  {l.description} · {l.quantity} ×{" "}
                  {l.unit_minor == null ? "M/R" : money(l.unit_minor)} −{" "}
                  {money(l.discount_minor)} →{" "}
                  {r.allocations.find((a: Row) => a.id === l.id)
                    ?.amount_minor != null
                    ? money(
                        r.allocations.find((a: Row) => a.id === l.id)
                          .amount_minor,
                      )
                    : "—"}
                </p>
              ))}
            </details>
            {decision && (
              <p>
                {labels[decision.status]} · {decision.reason} ·{" "}
                {decision.recorded_by} ·{" "}
                {new Date(decision.recorded_at).toLocaleString("en-GB", {
                  timeZone: "Asia/Colombo",
                })}
              </p>
            )}
            {manage && enabled && status === "pending" && (
              <div>
                <label>
                  {t(
                    "Decision reason / agreement reference",
                    "තීරණ හේතුව / එකඟතා යොමුව",
                  )}
                  <input
                    maxLength={1000}
                    value={decisionReasons[r.id] || ""}
                    onChange={(e) =>
                      setDecisionReasons((v) => ({
                        ...v,
                        [r.id]: e.target.value,
                      }))
                    }
                  />
                </label>
                <div className="tenuli-actions">
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !decisionReasons[r.id]?.trim() ||
                      r.source_version !== job.version
                    }
                    onClick={() =>
                      void run("price_decide", {
                        review_id: r.id,
                        decision: "accepted",
                        reason: decisionReasons[r.id],
                      })
                    }
                  >
                    {t(
                      "Accept agreed pricing & create revision",
                      "එකඟ වූ මිල පිළිගෙන සංශෝධනය සාදන්න",
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !decisionReasons[r.id]?.trim()}
                    onClick={() =>
                      void run("price_decide", {
                        review_id: r.id,
                        decision: "rejected",
                        reason: decisionReasons[r.id],
                      })
                    }
                  >
                    {t("Reject proposal", "යෝජනාව ප්‍රතික්ෂේප කරන්න")}
                  </button>
                </div>
                {r.source_version !== job.version && (
                  <p>
                    {t(
                      "Estimate changed. Record a new proposal to accept pricing.",
                      "Estimate එක වෙනස් වී ඇත. මිල පිළිගැනීමට නව යෝජනාවක් සටහන් කරන්න.",
                    )}
                  </p>
                )}
              </div>
            )}
          </article>
        );
      })}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
