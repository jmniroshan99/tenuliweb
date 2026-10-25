import { date, day, money } from "../lib/format";
import { notePages, type NoteSection } from "../lib/service-document-model";
import type { Row } from "../lib/types";
export default function ServiceDocumentPages({
  doc,
  language,
}: {
  doc: Row;
  language: string;
}) {
  const t = (en: string, si: string) => (language === "si" ? si : en);
  const s = doc.snapshot,
    c = s.content || {},
    b = s.business || {},
    info = s.info || {},
    receiving = doc.kind === "receiving";
  const labels: Record<string, string> = {
    reported_problem: t("Reported problem", "සඳහන් කළ දෝෂය"),
    requested_work: t(
      "Requested repairs / services",
      "ඉල්ලා සිටි අලුත්වැඩියා / සේවා",
    ),
    expected_date: t("Expected completion", "නිම කිරීමට අපේක්ෂිත දිනය"),
    odometer: t("Odometer (km)", "ධාවන දුර (කි.මී.)"),
    fuel_level: t("Fuel level", "ඉන්ධන මට්ටම"),
    damage: t("Existing damage", "දැනට පවතින හානි"),
    condition: t("Vehicle condition", "වාහනයේ තත්ත්වය"),
    accessories: t("Accessories received", "භාරගත් උපාංග"),
    notes: t("Additional notes", "අමතර සටහන්"),
    work_performed: t("Work performed", "සිදු කළ වැඩ"),
    parts_replaced: t("Parts replaced", "මාරු කළ අමතර කොටස්"),
    checks: t("Checks performed", "සිදු කළ පරීක්ෂණ"),
    recommendations: t("Recommendations", "නිර්දේශ"),
    warranty: t("Warranty terms", "වගකීම් කොන්දේසි"),
  };
  const keys = receiving
    ? [
        "reported_problem",
        "requested_work",
        "expected_date",
        "odometer",
        "fuel_level",
        "damage",
        "condition",
        "accessories",
        "notes",
      ]
    : [
        "work_performed",
        "parts_replaced",
        "checks",
        "recommendations",
        "warranty",
        "notes",
      ];
  const sections: NoteSection[] = keys
    .filter((k) => c[k])
    .map((k) => ({
      label: labels[k],
      text: k === "expected_date" ? day(c[k]) : String(c[k]),
    }));
  if (receiving && s.payment_ack) {
    const methodLabels: Record<string, string> = {
      cash: t("Cash", "මුදල්"),
      bank: t("Bank transfer", "බැංකු මාරුව"),
      card: t("Card", "කාඩ්පත"),
    };
    for (const payment of s.payment_ack.payments || [])
      sections.push({
        label: t("Advance payment received", "ලැබුණු අත්තිකාරම් ගෙවීම"),
        text: `${money(payment.amount_minor)} · ${date(payment.created_at)}\n${methodLabels[payment.method] || payment.method} · ${payment.number}${payment.reference ? " · " + payment.reference : ""}`,
      });
  }
  if (s.correction_reason)
    sections.push({
      label: t("Revision reason", "සංශෝධනයට හේතුව"),
      text: s.correction_reason,
    });
  if (s.handover?.notes)
    sections.push({
      label: t("Handover notes", "භාරදීමේ සටහන්"),
      text: s.handover.notes,
    });
  const pages = notePages(
    sections,
    20,
    s.template_version === "receiving-advance-v1",
  );
  return (
    <>
      {pages.map((blocks, index) => (
        <article
          className="tenuli-paper document-page service-paper"
          key={index}
        >
          <header
            className="tenuli-document-head"
            data-letterhead={s.letterhead_style}
          >
            <img
              src={b.logo || "/tenuli-logo.svg"}
              alt="Tenuli Auto Care logo"
              style={
                b.brand_version === "capture-2026-v1"
                  ? { width: 155, height: 65, objectFit: "contain" }
                  : undefined
              }
            />
            <div>
              <h2>{b.name || "Tenuli Auto Care"}</h2>
              <p>{b.address}</p>
              <p>
                {b.phone} · {b.email}
              </p>
            </div>
          </header>
          <div className="tenuli-document-title">
            <strong>
              {receiving
                ? t(
                    s.template_version === "receiving-advance-v1"
                      ? "VEHICLE RECEIVING NOTE & ADVANCE ACKNOWLEDGEMENT"
                      : "VEHICLE RECEIVING NOTE / JOB CARD",
                    s.template_version === "receiving-advance-v1"
                      ? "වාහන භාරගැනීම සහ අත්තිකාරම් පිළිගැනීම"
                      : "වාහන භාරගැනීමේ සටහන / කාර්ය පත්‍රය",
                  )
                : t(
                    "REPAIR COMPLETION & VEHICLE HANDOVER NOTE",
                    "අලුත්වැඩියා නිමකිරීමේ සහ වාහන භාරදීමේ සටහන",
                  )}
            </strong>
            <span>{doc.number}</span>
          </div>
          <div className="tenuli-document-meta">
            <div>
              <b>{info.customer_name}</b>
              {info.phone && <p>{info.phone}</p>}
              <p>
                <b>{info.registration}</b> {info.make_model}
              </p>
              <p>
                {t("Job", "කාර්ය අංකය")}: {s.job_number}
              </p>
            </div>
            <div>
              <p>
                {t("Revision", "සංශෝධනය")}: {doc.revision} ·{" "}
                {t("Issued", "නිකුත් කළේ")}: {date(doc.created_at)}
              </p>
              <p>
                {receiving
                  ? t("Received", "භාරගත් වේලාව")
                  : t("Completed", "නිම කළ වේලාව")}
                : {date(receiving ? s.received_at : s.completed_at)}
              </p>
              <small>
                {t("All times: Sri Lanka", "සියලු වේලාවන්: ශ්‍රී ලංකාව")}
              </small>
            </div>
          </div>
          <div className="service-paper-body">
            {blocks.map((block, i) => (
              <section key={i}>
                <h4>{block.label}</h4>
                <p>{block.text}</p>
              </section>
            ))}
          </div>
          {index === pages.length - 1 && (
            <>
              {receiving && s.payment_ack && (
                <p className="receiving-advance-total">
                  <b>
                    {t("Advance received", "ලැබුණු අත්තිකාරම")}:{" "}
                    {money(s.payment_ack.advance_minor)}
                  </b>
                </p>
              )}
              {receiving ? (
                <p className="service-paper-notice">
                  {t(
                    "Vehicle received for inspection / repair. This note does not approve an estimate or authorize additional repairs.",
                    "පරීක්ෂා කිරීම / අලුත්වැඩියාව සඳහා වාහනය භාරගන්නා ලදී. මෙම සටහන ඇස්තමේන්තුවකට හෝ අමතර අලුත්වැඩියාවකට අනුමැතියක් නොවේ.",
                  )}
                </p>
              ) : (
                <>
                  {s.billing ? (
                    <div className="service-billing">
                      <div>
                        <b>
                          {t("Invoice", "බිල්පත")}: {s.billing.invoice_number}
                        </b>
                        <p>
                          {t("Amounts recorded at", "මුදල් වාර්තා කළ වේලාව")}:{" "}
                          {date(s.billing.as_of)}
                        </p>
                      </div>
                      <dl>
                        <dt>{t("Total", "මුළු මුදල")}</dt>
                        <dd>{money(s.billing.total_minor)}</dd>
                        <dt>{t("Paid amount", "ගෙවූ මුදල")}</dt>
                        <dd>{money(s.billing.paid_minor)}</dd>
                        {s.billing.credit_minor !== 0 && (
                          <>
                            <dt>{t("Credits applied", "අදාළ බැර මුදල")}</dt>
                            <dd>{money(s.billing.credit_minor)}</dd>
                          </>
                        )}
                        <dt>
                          <b>{t("Outstanding balance", "ඉතිරි මුදල")}</b>
                        </dt>
                        <dd>
                          <b>{money(s.billing.balance_minor)}</b>
                        </dd>
                      </dl>
                    </div>
                  ) : (
                    <p>
                      {t(
                        "No invoice issued at the time of this document.",
                        "මෙම ලේඛනය නිකුත් කරන විට බිල්පතක් නිකුත් කර නොමැත.",
                      )}
                    </p>
                  )}
                  <p className="service-paper-notice">
                    {s.handover ? (
                      <>
                        {t("Vehicle returned", "වාහනය ආපසු භාරදුන් වේලාව")}:{" "}
                        {date(s.handover.handed_over_at)}
                        <br />
                        {t("Received by", "භාරගත් පුද්ගලයා")}:{" "}
                        {s.handover.recipient}
                      </>
                    ) : (
                      t(
                        "Repair completed. Vehicle handover has not been recorded. This note is not proof of payment.",
                        "අලුත්වැඩියාව නිම කර ඇත. වාහනය භාරදීම වාර්තා කර නැත. මෙම සටහන ගෙවීම් තහවුරු කිරීමක් නොවේ.",
                      )
                    )}
                  </p>
                </>
              )}
              <div className="tenuli-signatures">
                <span>{t("Customer signature", "පාරිභෝගික අත්සන")}</span>
                <span>{t("Staff signature", "කාර්ය මණ්ඩල අත්සන")}</span>
              </div>
            </>
          )}
          <footer className="tenuli-document-footer">
            Tenuli Auto Care · {doc.number} · {index + 1}/{pages.length}
          </footer>
        </article>
      ))}
    </>
  );
}
