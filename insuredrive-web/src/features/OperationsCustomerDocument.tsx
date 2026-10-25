import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import "../operations-documents.css";
import { date, day, money } from "../lib/format";
import { paginateMeasured, textChunks } from "../lib/modern-document";
import { operationsItems, operationsSummary } from "../lib/operations-document";
import { sectionSinhala } from "../lib/grouped-billing";
import { TENULI_LOGO_URL } from "../lib/brand";
import type { Row } from "../lib/types";

type Props = { doc: Row; language: string };
type Block =
  | { kind: "parties" | "closing" }
  | { kind: "text"; label: string; text: string }
  | { kind: "item"; line: Row }
  | { kind: "payment"; payment: Row; first: boolean };
const amount = (v: unknown) =>
  new Intl.NumberFormat("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v || 0) / 100);
const tr = (language: string) => (en: string, si: string) =>
  language === "si" ? si : en;

function Header({
  doc,
  language,
  continued = false,
}: Props & { continued?: boolean }) {
  const s = doc.snapshot,
    b = s.business || {},
    t = tr(language),
    receiving = doc.kind === "receiving";
  return (
    <header
      className={
        "operations-header" +
        (continued ? " is-continuation" : "") +
        (s.letterhead_style === "blue-v1" ? " has-blue-letterhead" : "")
      }
    >
      <div
        className="operations-letterhead"
        data-letterhead={s.letterhead_style}
      >
        <img
          src={b.logo || TENULI_LOGO_URL}
          alt={b.name || "Tenuli Auto Care"}
        />
        <div>
          <h2>{b.name}</h2>
          {!continued && (
            <>
              {b.notes && <p className="operations-tagline">{b.notes}</p>}
              {b.address && <p>{b.address}</p>}
              <p>{[b.phone, b.email].filter(Boolean).join(" | ")}</p>
            </>
          )}
        </div>
      </div>
      <div className="operations-title">
        <h1>
          {receiving
            ? t(
                "Vehicle Receiving Note & Advance Acknowledgement",
                "වාහන භාරගැනීම සහ අත්තිකාරම් පිළිගැනීම",
              )
            : t(
                "Repair Completion & Final Bill",
                "අලුත්වැඩියා නිමකිරීම සහ අවසන් බිල්පත",
              )}
        </h1>
        <span>LKR</span>
      </div>
      <div className="operations-meta">
        <div>
          <span>{t("Document no.", "ලේඛන අංකය")}</span>
          <b>{doc.number}</b>
        </div>
        <div>
          <span>{t("Job no.", "කාර්ය අංකය")}</span>
          <b>{s.job_number || s.job_id || doc.job_id}</b>
        </div>
        <div>
          <span>
            {t("Issued · Sri Lanka time", "නිකුත් කළේ · ශ්‍රී ලංකා වේලාව")}
          </span>
          <b>{date(doc.created_at)}</b>
        </div>
        <div>
          <span>{t("Revision", "සංශෝධනය")}</span>
          <b>
            {doc.copy_revision ??
              doc.revision ??
              s.copy_revision ??
              s.revision ??
              1}
          </b>
        </div>
      </div>
      {!continued && (
        <div className="operations-dates">
          {s.estimate_number && (
            <span>
              {t("Estimate", "ඇස්තමේන්තුව")}: <b>{s.estimate_number}</b>
            </span>
          )}
          {s.received_at && (
            <span>
              {t("Received", "භාරගත්තේ")}: <b>{date(s.received_at)}</b>
            </span>
          )}
          {!receiving && s.completion?.completed_at && (
            <span>
              {t("Completed", "නිම කළේ")}:{" "}
              <b>{date(s.completion.completed_at)}</b>
            </span>
          )}
        </div>
      )}
      {s.original_number && (
        <p className="operations-revision">
          {t("Original document", "මුල් ලේඛනය")}: {s.original_number} ·{" "}
          {day(s.original_issued_at)}
        </p>
      )}
      {s.sample_data && (
        <div className="operations-sample">
          SAMPLE / TEST DATA — NOT A CUSTOMER BILL
        </div>
      )}
    </header>
  );
}

function Parties({ doc, language }: Props) {
  const t = tr(language),
    i = doc.snapshot.info || {};
  return (
    <div className="operations-parties">
      <section>
        <h3>{t("Customer details", "පාරිභෝගික විස්තර")}</h3>
        <strong>{i.customer_name}</strong>
        {i.phone && <p>{i.phone}</p>}
      </section>
      <section>
        <h3>{t("Vehicle details", "වාහන විස්තර")}</h3>
        <strong>{i.registration}</strong>
        {i.make_model && <p>{i.make_model}</p>}
      </section>
    </div>
  );
}

function Items({ lines, language }: { lines: Row[]; language: string }) {
  const t = tr(language);
  return (
    <table className="operations-items">
      <colgroup>
        {[4, 30, 7, 6, 18, 15, 20].map((w, i) => (
          <col key={i} style={{ width: w + "%" }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {[
            t("No.", "අංක"),
            t("Description / service / part", "විස්තරය / සේවාව / කොටස"),
            t("Pos.", "ස්ථානය"),
            t("Qty", "ප්‍රමාණය"),
            t("Unit price", "ඒකක මිල"),
            t("Discount", "වට්ටම"),
            t("Amount", "මුදල"),
          ].map((h, i) => (
            <th key={i}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <Fragment key={l.fragmentKey}>
            {(i === 0 || lines[i - 1].category !== l.category) && (
              <tr className="operations-category">
                <th colSpan={7}>
                  {language === "si"
                    ? sectionSinhala[l.category] || l.category
                    : l.category}
                  {!l.sectionStart && (
                    <small> · {t("continued", "ඉදිරියට")}</small>
                  )}
                </th>
              </tr>
            )}
            <tr className="operations-item">
              <td>{!l.continuation && l.row_number}</td>
              <td>
                {l.continuation && (
                  <small className="operations-continuation">
                    {t("Item continued", "අයිතමය ඉදිරියට")} · {l.row_number}
                  </small>
                )}
                <div>{l.description}</div>
                {l.notes && <small>{l.notes}</small>}
                {!l.continuation && l.agreed_minor != null && (
                  <small>
                    {t("Agreed allocated amount", "එකඟ වූ වෙන්කළ මුදල")}
                  </small>
                )}
              </td>
              <td>{!l.continuation && l.position}</td>
              <td>{!l.continuation && l.quantity}</td>
              <td>
                {!l.continuation &&
                  (l.agreed_minor != null
                    ? "—"
                    : l.unit_minor == null
                      ? "M/R"
                      : amount(l.unit_minor))}
              </td>
              <td>
                {!l.continuation &&
                  (l.agreed_minor != null ? "—" : amount(l.discount_minor))}
              </td>
              <td>
                {!l.continuation && (
                  <b>
                    {l.net_minor == null
                      ? "M/R"
                      : amount(Number(l.net_minor) + Number(l.tax_minor || 0))}
                  </b>
                )}
              </td>
            </tr>
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

function Payment({
  block,
  language,
}: {
  block: Extract<Block, { kind: "payment" }>;
  language: string;
}) {
  const t = tr(language),
    p = block.payment;
  const purpose =
    p.kind === "refund"
      ? t("Refund", "ආපසු ගෙවීම")
      : p.purpose === "advance"
        ? t("Advance", "අත්තිකාරම")
        : t("Payment", "ගෙවීම");
  const method =
    (
      {
        cash: t("Cash", "මුදල්"),
        bank: t("Bank transfer", "බැංකු මාරුව"),
        card: t("Card", "කාඩ්පත"),
      } as Row
    )[p.method] || p.method;
  return (
    <section className="operations-payment-entry">
      {block.first && <h3>{t("Recorded payments", "වාර්තා කළ ගෙවීම්")}</h3>}
      <div>
        <span>
          {date(p.created_at)} · {purpose} · {method}
          {p.reference && ` · ${p.reference}`}
        </span>
        <b>{money(p.amount_minor)}</b>
      </div>
    </section>
  );
}

function Closing({ doc, language }: Props) {
  const t = tr(language),
    s = doc.snapshot,
    receiving = doc.kind === "receiving",
    v = operationsSummary(s, receiving);
  const state = (
    {
      estimate: t(
        "Estimate / advance acknowledgement",
        "ඇස්තමේන්තුව / අත්තිකාරම් පිළිගැනීම",
      ),
      paid: t("Paid", "ගෙවා ඇත"),
      partial: t("Partially Paid", "කොටසක් ගෙවා ඇත"),
      unpaid: t("Unpaid", "ගෙවා නැත"),
      overpaid: t("Overpayment / credit balance", "වැඩිපුර ගෙවීම / බැර ශේෂය"),
    } as Row
  )[v.state];
  const rows: [string, string][] = [
    [
      v.pending
        ? t("Known-price subtotal", "මිල දන්නා අයිතම එකතුව")
        : receiving
          ? t("Estimated total", "ඇස්තමේන්තුගත එකතුව")
          : t("Final bill total", "අවසන් බිල්පත් එකතුව"),
      "total_minor",
    ],
    ...(Number(v.credit_minor)
      ? [
          [t("Credit adjustments", "බැර සංශෝධන"), "credit_minor"] as [
            string,
            string,
          ],
        ]
      : []),
    [
      Number(v.advance_minor) > 0
        ? receiving
          ? t("Advance received", "ලැබුණු අත්තිකාරම")
          : t("Advance payments applied", "යෙදවූ අත්තිකාරම් ගෙවීම්")
        : t("No advance received", "අත්තිකාරමක් ලැබී නැත"),
      "advance_minor",
    ],
    [
      receiving
        ? t("Other recorded payments", "වෙනත් වාර්තා කළ ගෙවීම්")
        : t("Subsequent payments applied", "යෙදවූ පසු ගෙවීම්"),
      "other_payments_minor",
    ],
    ...(Number(v.refund_minor)
      ? [
          [t("Refunds returned", "ආපසු ගෙවූ මුදල"), "refund_minor"] as [
            string,
            string,
          ],
        ]
      : []),
    [
      receiving
        ? t("Total net payments received", "ලැබුණු මුළු ශුද්ධ ගෙවීම්")
        : t("Total net payments applied", "යෙදවූ මුළු ශුද්ධ ගෙවීම්"),
      "paid_minor",
    ],
  ];
  const balanceLabel = v.pending
    ? t("Provisional balance (known items)", "තාවකාලික ශේෂය (මිල දන්නා අයිතම)")
    : v.balance < 0
      ? t("Overpayment / credit balance", "වැඩිපුර ගෙවීම / බැර ශේෂය")
      : receiving
        ? t("Estimated remaining amount", "ඇස්තමේන්තුගත ඉතිරි මුදල")
        : t("Balance due", "ගෙවිය යුතු ඉතිරි මුදල");
  return (
    <section className="operations-closing">
      <div className="operations-settlement">
        <div>
          <h3>{t("Payment summary", "ගෙවීම් සාරාංශය")}</h3>
          <span className="operations-status">{state}</span>
          <p>
            {t("Captured at", "වාර්තා කළේ")}: {date(v.as_of || doc.created_at)}
          </p>
          {v.pending && (
            <p className="operations-notice">
              {t(
                "M/R: price pending. This subtotal and remaining amount include known prices only and are provisional.",
                "M/R: මිල තහවුරු කර නැත. මෙම එකතුව සහ ඉතිරි මුදල මිල දන්නා අයිතම සඳහා පමණි; ඒවා තාවකාලිකය.",
              )}
            </p>
          )}
          <p className="operations-notice">
            {receiving
              ? t(
                  "Vehicle received for inspection / repair. This acknowledges receipt and recorded payments; repairs are not certified complete.",
                  "පරීක්ෂා කිරීම / අලුත්වැඩියාව සඳහා වාහනය භාරගන්නා ලදී. මෙය භාරගැනීම සහ වාර්තා කළ ගෙවීම් පිළිගනී; වැඩ නිම වූ බව තහවුරු නොකරයි.",
                )
              : t(
                  "This bill records completed repairs and payments at issue. Vehicle handover is recorded separately.",
                  "මෙම බිල්පත නිකුත් කරන විට නිම කළ වැඩ සහ ගෙවීම් දක්වයි. වාහනය භාරදීම වෙනම වාර්තා කෙරේ.",
                )}
          </p>
        </div>
        <div>
          <dl>
            {rows.map(([label, key]) => (
              <Fragment key={key}>
                <dt>{label}</dt>
                <dd>{money(v[key])}</dd>
              </Fragment>
            ))}
          </dl>
          <div className="operations-balance">
            <span>{balanceLabel}</span>
            <strong>
              {money(v.pending ? v.balance : Math.abs(v.balance))}
            </strong>
          </div>
        </div>
      </div>
      <div className="operations-signatures">
        <div>
          <b>{s.prepared_by || "\u00a0"}</b>
          <span>{t("Prepared by", "සකස් කළේ")}</span>
        </div>
        <div>
          <b>{"\u00a0"}</b>
          <span>{t("Authorised signature", "බලයලත් අත්සන")}</span>
        </div>
        <div>
          <b>{"\u00a0"}</b>
          <span>
            {receiving
              ? t("Customer acknowledgement", "පාරිභෝගික පිළිගැනීම")
              : t(
                  "Customer signature - bill received",
                  "පාරිභෝගික අත්සන - බිල්පත ලැබුණි",
                )}
          </span>
        </div>
      </div>
    </section>
  );
}

function View({ block, doc, language }: Props & { block: Block }) {
  if (block.kind === "parties")
    return <Parties doc={doc} language={language} />;
  if (block.kind === "closing")
    return <Closing doc={doc} language={language} />;
  if (block.kind === "item")
    return <Items lines={[block.line]} language={language} />;
  if (block.kind === "payment")
    return <Payment block={block} language={language} />;
  if (block.kind === "text")
    return (
      <section className="operations-text">
        <h3>{block.label}</h3>
        <p>{block.text}</p>
      </section>
    );
  return null;
}

export function buildOperationsBlocks(doc: Row, language: string): Block[] {
  const t = tr(language),
    s = doc.snapshot,
    r = s.receiving_content || {},
    c = s.completion?.content || {},
    i = s.info || {};
  const list: Block[] = [{ kind: "parties" }];
  const add = (label: string, value: unknown) => {
    if (value)
      textChunks(String(value), 360).forEach((text, n) =>
        list.push({
          kind: "text",
          label: label + (n ? t(" (continued)", " (ඉදිරියට)") : ""),
          text,
        }),
      );
  };
  add(
    t("Reported problem", "සඳහන් කළ දෝෂය"),
    r.reported_problem || i.reported_problem,
  );
  add(
    t("Requested repairs / services", "ඉල්ලා සිටි අලුත්වැඩියා / සේවා"),
    r.requested_work || i.requested_work,
  );
  for (const [key, en, si] of [
    ["condition", "Vehicle condition", "වාහනයේ තත්ත්වය"],
    ["damage", "Existing damage", "දැනට පවතින හානි"],
    ["accessories", "Accessories received", "භාරගත් උපාංග"],
    ["odometer", "Odometer (km)", "ධාවන දුර (කි.මී.)"],
    ["fuel_level", "Fuel level", "ඉන්ධන මට්ටම"],
    ["expected_date", "Expected completion", "නිම කිරීමට අපේක්ෂිත දිනය"],
    ["notes", "Receiving notes", "භාරගැනීමේ සටහන්"],
  ])
    add(t(en, si), key === "expected_date" && r[key] ? day(r[key]) : r[key]);
  for (const [key, en, si] of [
    ["insurance", "Insurer", "රක්ෂණ සමාගම"],
    ["claim_number", "Claim reference", "හිමිකම් යොමුව"],
    ["accident_date", "Accident date", "අනතුරු දිනය"],
    ["chassis_number", "Chassis number", "චැසි අංකය"],
  ])
    add(t(en, si), key === "accident_date" && i[key] ? day(i[key]) : i[key]);
  list.push(
    ...operationsItems(s).map((line) => ({ kind: "item" as const, line })),
  );
  if (doc.kind !== "receiving")
    for (const [key, en, si] of [
      ["work_performed", "Completed work", "නිම කළ වැඩ"],
      ["parts_replaced", "Parts replaced", "මාරු කළ අමතර කොටස්"],
      ["checks", "Checks performed", "සිදු කළ පරීක්ෂණ"],
      ["recommendations", "Recommendations", "නිර්දේශ"],
      ["warranty", "Recorded warranty terms", "වාර්තා කළ වගකීම් කොන්දේසි"],
      ["notes", "Completion notes", "නිමකිරීමේ සටහන්"],
    ])
      add(t(en, si), c[key]);
  add(t("Customer notes", "පාරිභෝගික සටහන්"), i.notes);
  // Internal revision reasons are retained in the audit trail, not printed by default.
  (s.payment_details || []).forEach((payment: Row, n: number) =>
    list.push({ kind: "payment", payment, first: n === 0 }),
  );
  list.push({ kind: "closing" });
  return list;
}

export default function OperationsCustomerDocument({
  doc,
  language,
  initialPages,
}: Props & { initialPages?: number[][] }) {
  const measure = useRef<HTMLDivElement>(null),
    [pages, setPages] = useState<number[][] | null>(initialPages || null),
    [error, setError] = useState("");
  const blocks = useMemo(
    () => buildOperationsBlocks(doc, language),
    [doc, language],
  );
  useEffect(() => {
    let active = true;
    setPages(null);
    setError("");
    (async () => {
      await document.fonts.ready;
      if (!active || !measure.current) return;
      await Promise.all(
        [...measure.current.querySelectorAll("img")].map((img) => img.decode()),
      );
      if (!active || !measure.current) return;
      const root = measure.current;
      const header = (selector: string) =>
        root.querySelector<HTMLElement>(selector)!.getBoundingClientRect()
          .height;
      const weights = [
        ...root.querySelectorAll<HTMLElement>("[data-measure-block]"),
      ].map((el, n) => {
        if (blocks[n].kind !== "item")
          return { height: el.getBoundingClientRect().height };
        const line = (blocks[n] as Extract<Block, { kind: "item" }>).line;
        const row = el
          .querySelector(".operations-item")!
          .getBoundingClientRect().height;
        const band = el
          .querySelector(".operations-category")!
          .getBoundingClientRect().height;
        const head = el.querySelector("thead")!.getBoundingClientRect().height;
        return {
          height: row + (line.sectionStart ? band : 0) + 0.25,
          group: "items",
          start: head + (line.sectionStart ? 0 : band) + 12,
        };
      });
      setPages(
        paginateMeasured(
          weights,
          1122.52 - 98.28 - 34 - header(".measure-first"),
          1122.52 - 98.28 - 34 - header(".measure-later"),
        ),
      );
    })().catch((e) => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [blocks, doc, language]);
  const t = tr(language);
  return (
    <div data-modern-ready={pages ? "true" : "false"}>
      <div
        className="operations-paper operations-measure"
        lang={language}
        ref={measure}
        aria-hidden="true"
      >
        <div className="measure-first">
          <Header doc={doc} language={language} />
        </div>
        <div className="measure-later">
          <Header doc={doc} language={language} continued />
        </div>
        {blocks.map((block, n) => (
          <div data-measure-block key={n}>
            <View block={block} doc={doc} language={language} />
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!pages && !error && (
        <p>{t("Preparing A4 pages…", "A4 පිටු සකස් කරමින්…")}</p>
      )}
      {pages?.map((indices, n) => (
        <article
          key={n}
          className="tenuli-paper document-page operations-paper"
          lang={language}
        >
          <Header doc={doc} language={language} continued={n > 0} />
          <div className="operations-body">
            {indices.map((index, k) => {
              const block = blocks[index];
              if (block.kind !== "item")
                return (
                  <View
                    key={index}
                    block={block}
                    doc={doc}
                    language={language}
                  />
                );
              if (blocks[indices[k - 1]]?.kind === "item") return null;
              const lines: Row[] = [];
              for (let j = k; j < indices.length; j++) {
                const b = blocks[indices[j]];
                if (b.kind !== "item") break;
                lines.push(b.line);
              }
              return <Items key={index} lines={lines} language={language} />;
            })}
          </div>
          <footer className="operations-footer">
            <span>
              {t("Thank you for choosing", "ස්තූතියි")}{" "}
              {doc.snapshot.business?.name}
            </span>
            <span>
              {doc.number} · {n + 1} / {pages.length}
            </span>
          </footer>
        </article>
      ))}
    </div>
  );
}
