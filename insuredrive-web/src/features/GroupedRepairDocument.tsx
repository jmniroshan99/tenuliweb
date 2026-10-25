import { groupedBillPages, sectionSinhala } from "../lib/grouped-billing";
import { notePages, type NoteSection } from "../lib/service-document-model";
import { day, date, money } from "../lib/format";
import type { Row } from "../lib/types";
export default function GroupedRepairDocument({
  doc,
  language,
}: {
  doc: Row;
  language: string;
}) {
  const t = (en: string, si: string) => (language === "si" ? si : en);
  const s = doc.snapshot,
    info = s.info || {},
    business = s.business || {},
    calc = s.calculation || {},
    settlement = s.settlement,
    finalBill = s.template_version === "final-bill-v1";
  const itemPages = groupedBillPages(calc.lines || []);
  const memo: NoteSection[] = [];
  if (finalBill) {
    const labels: Record<string, string> = {
      work_performed: t("Work performed", "සිදු කළ වැඩ"),
      parts_replaced: t("Parts replaced", "මාරු කළ අමතර කොටස්"),
      recommendations: t("Recommendations", "නිර්දේශ"),
      warranty: t("Warranty terms", "වගකීම් කොන්දේසි"),
      checks: t("Checks performed", "සිදු කළ පරීක්ෂණ"),
      notes: t("Additional notes", "අමතර සටහන්"),
    };
    for (const [key, label] of Object.entries(labels))
      if (s.completion?.content?.[key])
        memo.push({ label, text: s.completion.content[key] });
  }
  if (info.notes) memo.push({ label: t("Notes", "සටහන්"), text: info.notes });
  if (s.correction_reason)
    memo.push({
      label: t("Revision reason", "සංශෝධනයට හේතුව"),
      text: s.correction_reason,
    });
  const inlineMemo =
    finalBill &&
    itemPages.length === 1 &&
    itemPages[0].length <= 2 &&
    (calc.lines || []).length <= 6 &&
    memo.reduce((n, v) => n + v.text.length + v.label.length, 0) < 300;
  const memoPages =
    memo.length && !inlineMemo
      ? notePages(memo, finalBill ? 14 : 20, finalBill)
      : [];
  const pageCount = itemPages.length + memoPages.length;
  return (
    <>
      {Array.from({ length: pageCount }, (_, index) => (
        <article
          className="tenuli-paper document-page grouped-paper"
          key={index}
        >
          <header
            className="grouped-document-head"
            data-letterhead={s.letterhead_style}
          >
            <div>
              <h2>{business.name || "Tenuli Auto Care"}</h2>
              <p>{business.address}</p>
              <p>{business.email}</p>
              <p>{business.phone}</p>
            </div>
            <img
              src={business.logo || "/tenuli-logo.svg"}
              alt="Tenuli Auto Care logo"
              style={
                business.brand_version === "capture-2026-v1"
                  ? { width: 155, height: 65, objectFit: "contain" }
                  : undefined
              }
            />
          </header>
          <div className="tenuli-document-title">
            <strong>
              {finalBill
                ? t(
                    "REPAIR COMPLETION & FINAL BILL",
                    "අලුත්වැඩියා නිමකිරීම සහ අවසන් බිල්පත",
                  )
                : doc.kind === "invoice"
                  ? t("REPAIR INVOICE", "අලුත්වැඩියා බිල්පත")
                  : t("ESTIMATE", "ඇස්තමේන්තුව")}
            </strong>
            <span>
              {finalBill ? s.original_number || doc.number : doc.number}
            </span>
          </div>
          <div className="grouped-document-info">
            <p>
              <span>{t("Customer", "පාරිභෝගිකයා")}</span>
              <b>{info.customer_name}</b>
            </p>
            <p>
              <span>{t("Vehicle no.", "වාහන අංකය")}</span>
              <b>{info.registration}</b>
            </p>
            {info.phone && (
              <p>
                <span>{t("Phone", "දුරකථන අංකය")}</span>
                {info.phone}
              </p>
            )}
            {info.make_model && (
              <p>
                <span>{t("Make / model", "වාහන වර්ගය")}</span>
                {info.make_model}
              </p>
            )}
            {info.accident_date && (
              <p>
                <span>{t("Accident date", "අනතුර සිදු වූ දිනය")}</span>
                {day(info.accident_date)}
              </p>
            )}
            {info.insurance && (
              <p>
                <span>{t("Insurance", "රක්ෂණ සමාගම")}</span>
                {info.insurance}
              </p>
            )}
            {finalBill && (
              <p>
                <span>{t("Completed", "නිම කළේ")}</span>
                {date(s.completion.completed_at)}
              </p>
            )}
            <p>
              <span>
                {finalBill
                  ? t("Invoice date", "බිල්පත් දිනය")
                  : t("Issued date", "නිකුත් කළ දිනය")}
              </span>
              {day(
                finalBill
                  ? s.original_issued_at || doc.created_at
                  : doc.created_at,
              )}
            </p>
            <p>
              <span>
                {s.job_number
                  ? t("Job no.", "කාර්ය අංකය")
                  : t("Estimate no.", "ඇස්තමේන්තු අංකය")}
              </span>
              {s.job_number || s.estimate_number}
            </p>
          </div>
          {s.original_number && (
            <p className="grouped-copy-reference">
              {t("Revised copy of", "සංශෝධිත පිටපත")}: {s.original_number} ·{" "}
              {t("Copy revision", "පිටපත් සංශෝධනය")} {s.copy_revision} ·{" "}
              {date(doc.created_at)}
            </p>
          )}
          {doc.status === "void" && (
            <p className="tenuli-stamp">VOID / අවලංගු</p>
          )}
          {index < itemPages.length ? (
            itemPages[index].map((fragment) => (
              <section
                className="grouped-paper-section"
                key={fragment.category}
              >
                <h3>
                  {language === "si"
                    ? sectionSinhala[fragment.category]
                    : fragment.category}
                  {fragment.continued
                    ? " " + t("(continued)", "(ඉදිරියට)")
                    : ""}
                </h3>
                <table className="grouped-items">
                  <colgroup>
                    <col style={{ width: "5%" }} />
                    <col style={{ width: "37%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "17%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("Service / part", "සේවාව / කොටස")}</th>
                      <th>{t("Qty", "ප්‍රමාණය")}</th>
                      <th>{t("Unit price", "ඒකක මිල")}</th>
                      <th>{t("Discount", "වට්ටම")}</th>
                      <th>{t("Amount", "මුදල")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fragment.lines.map((line) => (
                      <tr key={line.id || line.row_number}>
                        <td>{line.row_number}</td>
                        <td>
                          <b>
                            {line.description}
                            {line.position ? ` · ${line.position}` : ""}
                          </b>
                          {line.agreed_minor != null && (
                            <small>
                              {t("Agreed line amount", "එකඟ වූ අයිතම මුදල")}
                            </small>
                          )}
                          {line.notes && <p>{line.notes}</p>}
                        </td>
                        <td>
                          {line.quantity}
                          {line.unit && line.unit !== "item" && (
                            <small>{line.unit}</small>
                          )}
                        </td>
                        <td>
                          {line.agreed_minor != null
                            ? "—"
                            : line.unit_minor == null
                              ? "M/R"
                              : money(line.unit_minor)}
                        </td>
                        <td>
                          {line.agreed_minor != null
                            ? "—"
                            : money(line.discount_minor || 0)}
                        </td>
                        <td>
                          {line.unit_minor == null && line.agreed_minor == null
                            ? "M/R"
                            : money(
                                Number(line.net_minor || 0) +
                                  Number(line.tax_minor || 0),
                              )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {fragment.showSubtotal && (
                    <tfoot>
                      <tr>
                        <td colSpan={5}>
                          {fragment.pending
                            ? t(
                                "Known section subtotal",
                                "කොටසේ තහවුරු කළ එකතුව",
                              )
                            : t("Section subtotal", "කොටසේ එකතුව")}
                        </td>
                        <td>{money(fragment.total)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </section>
            ))
          ) : (
            <div className="service-paper-body">
              {memoPages[index - itemPages.length].map((block, i) => (
                <section key={i}>
                  <h4>{block.label}</h4>
                  <p>{block.text}</p>
                </section>
              ))}
            </div>
          )}
          {inlineMemo && (
            <div className="service-paper-body final-inline-work">
              {memo.map((block, i) => (
                <section key={i}>
                  <h4>{block.label}</h4>
                  <p>{block.text}</p>
                </section>
              ))}
            </div>
          )}
          {index === pageCount - 1 && (
            <>
              {calc.pending > 0 && (
                <p className="grouped-pending">
                  {t(
                    "M/R = price pending. The known total includes priced items only.",
                    "M/R = මිල තහවුරු කර නැත. තහවුරු කළ මුළු මුදලට මිල දන්නා අයිතම පමණක් ඇතුළත් වේ.",
                  )}
                </p>
              )}
              {Number(calc.tax_minor) > 0 && (
                <p className="grouped-copy-reference">
                  {t(
                    "Original issued amounts retained.",
                    "මුල් නිකුත් කළ මුදල් වෙනස් කර නැත.",
                  )}
                </p>
              )}
              <div className="grouped-totals">
                <dl>
                  <dt>
                    <b>
                      {calc.pending
                        ? t("Known total", "තහවුරු කළ මුළු මුදල")
                        : t("Total", "මුළු මුදල")}
                    </b>
                  </dt>
                  <dd>
                    <b>{money(calc.total_minor)}</b>
                  </dd>
                  {doc.kind === "invoice" && settlement && (
                    <>
                      {finalBill && (
                        <>
                          <dt>{t("Advance received", "ලැබුණු අත්තිකාරම")}</dt>
                          <dd>{money(settlement.advance_minor)}</dd>
                          <dt>{t("Other payments", "වෙනත් ගෙවීම්")}</dt>
                          <dd>{money(settlement.other_payments_minor)}</dd>
                          {Number(settlement.refund_minor) > 0 && (
                            <>
                              <dt>{t("Refunds", "ආපසු ගෙවීම්")}</dt>
                              <dd>−{money(settlement.refund_minor)}</dd>
                            </>
                          )}
                        </>
                      )}
                      <dt>
                        {finalBill
                          ? t("Total paid", "ගෙවූ මුළු මුදල")
                          : t("Paid amount", "ගෙවූ මුදල")}
                      </dt>
                      <dd>{money(settlement.paid_minor)}</dd>
                      {Number(settlement.credit_minor) !== 0 && (
                        <>
                          <dt>{t("Credits applied", "අදාළ බැර මුදල")}</dt>
                          <dd>{money(settlement.credit_minor)}</dd>
                        </>
                      )}
                      <dt>
                        <b>{t("Balance", "ඉතිරි මුදල")}</b>
                      </dt>
                      <dd>
                        <b>{money(settlement.balance_minor)}</b>
                      </dd>
                    </>
                  )}
                </dl>
              </div>
              {doc.kind === "invoice" && settlement && (
                <p className="grouped-settlement-time">
                  {t(
                    "Payment amounts recorded at",
                    "ගෙවීම් මුදල් වාර්තා කළ වේලාව",
                  )}
                  : {date(settlement.as_of)}
                </p>
              )}
              {finalBill && (
                <p className="final-payment-state">
                  {Number(settlement.balance_minor) < 0
                    ? t("Refund due", "ආපසු ගෙවිය යුතුයි")
                    : Number(settlement.balance_minor) === 0
                      ? t("Paid", "ගෙවා ඇත")
                      : Number(settlement.paid_minor) > 0
                        ? t("Partially Paid", "කොටසක් ගෙවා ඇත")
                        : t("Unpaid", "ගෙවා නැත")}
                </p>
              )}
              <div className="tenuli-signatures">
                <span>{t("Customer signature", "පාරිභෝගික අත්සන")}</span>
                <span>{t("Staff signature", "කාර්ය මණ්ඩල අත්සන")}</span>
              </div>
            </>
          )}
          <footer className="tenuli-document-footer">
            Tenuli Auto Care · LKR · {index + 1}/{pageCount}
          </footer>
        </article>
      ))}
    </>
  );
}
