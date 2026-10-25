import "../modern-documents.css";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { billSections, sectionSinhala } from "../lib/grouped-billing";
import {
  paginateMeasured,
  textChunks,
  itemFragments,
} from "../lib/modern-document";
import { date, day, money } from "../lib/format";
import type { Row } from "../lib/types";

type Block =
  | { kind: "party" }
  | { kind: "finish" }
  | { kind: "work"; work: string; parts?: string }
  | {
      kind: "text";
      label: string;
      text: string;
      group: string;
      first: boolean;
      heading?: string;
    }
  | {
      kind: "item";
      category: string;
      line: Row;
      subtotal: number;
      last: boolean;
      continued: boolean;
    }
  | { kind: "advance"; first: boolean; payment?: Row };
type Props = { doc: Row; language: string };
const amount = (v: number | string = 0) =>
  new Intl.NumberFormat("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v) / 100);

function hasLargeAmounts(doc: Row) {
  return (doc.snapshot.calculation?.lines || []).some((l: Row) =>
    [
      l.unit_minor,
      l.discount_minor,
      Number(l.net_minor || 0) + Number(l.tax_minor || 0),
    ].some((v) => amount(v).length > 13),
  );
}

function PageHeader({
  doc,
  language,
  continued = false,
}: Props & { continued?: boolean }) {
  const t = (en: string, si: string) => (language === "si" ? si : en);
  const s = doc.snapshot,
    b = s.business || {},
    receiving = doc.kind === "receiving";
  return (
    <header
      className={
        "modern-header" + (continued ? " modern-header-continued" : "")
      }
    >
      <div className="modern-brand" data-letterhead={s.letterhead_style}>
        <img
          src={b.logo || "/tenuli-logo.svg"}
          alt="Tenuli Auto Care"
          style={
            b.brand_version === "capture-2026-v1"
              ? { width: 125, height: 52, flexBasis: 125, borderRadius: 0 }
              : undefined
          }
        />
        <div>
          <h2>{b.name || "Tenuli Auto Care"}</h2>
          {!continued && (
            <>
              <p>{b.address}</p>
              <p>{[b.phone, b.email].filter(Boolean).join("  ·  ")}</p>
            </>
          )}
        </div>
      </div>
      <div className="modern-title">
        <h1>
          {receiving
            ? t("Vehicle Receiving Note", "වාහන භාරගැනීමේ සටහන")
            : t("Repair Completion", "අලුත්වැඩියා නිමකිරීම")}
          <span>
            {receiving
              ? t("& Advance Acknowledgement", "සහ අත්තිකාරම් පිළිගැනීම")
              : t("& Final Bill", "සහ අවසන් බිල්පත")}
          </span>
        </h1>
        <div className="modern-reference">
          <b>{s.original_number || doc.number}</b>
          <span>
            {receiving
              ? t("Received", "භාරගත් වේලාව")
              : t("Invoice date", "බිල්පත් දිනය")}
            :{" "}
            {receiving
              ? date(s.received_at)
              : day(s.original_issued_at || doc.created_at)}
          </span>
          {continued && <span>{t("Continued", "ඉදිරියට")}</span>}
        </div>
      </div>
      {!continued && (
        <div className="modern-meta">
          <div>
            <span>{t("Job number", "කාර්ය අංකය")}</span>
            <b>{s.job_number || s.estimate_number}</b>
          </div>
          <div>
            <span>{t("Issued", "නිකුත් කළේ")}</span>
            <b>{date(doc.created_at)}</b>
          </div>
          <div>
            <span>
              {receiving ? t("Revision", "සංශෝධනය") : t("Completed", "නිම කළේ")}
            </span>
            <b>{receiving ? doc.revision : date(s.completion?.completed_at)}</b>
          </div>
        </div>
      )}
      {s.original_number && (
        <p className="modern-revision">
          {t("Revised copy", "සංශෝධිත පිටපත")}: {doc.number} ·{" "}
          {date(doc.created_at)}
        </p>
      )}
    </header>
  );
}
function Parties({ doc, language }: Props) {
  const t = (en: string, si: string) => (language === "si" ? si : en),
    info = doc.snapshot.info || {};
  return (
    <div className="modern-parties">
      <section>
        <h3>{t("Customer details", "පාරිභෝගික විස්තර")}</h3>
        <strong>{info.customer_name}</strong>
        {info.phone && (
          <p>
            {t("Phone", "දුරකථන")}: {info.phone}
          </p>
        )}
      </section>
      <section>
        <h3>{t("Vehicle details", "වාහන විස්තර")}</h3>
        <strong>{info.registration}</strong>
        {info.make_model && <p>{info.make_model}</p>}
        {info.insurance && (
          <p>
            {t("Insurer", "රක්ෂණ සමාගම")}: {info.insurance}
          </p>
        )}
        {info.accident_date && (
          <p>
            {t("Accident date", "අනතුරු දිනය")}: {day(info.accident_date)}
          </p>
        )}
      </section>
    </div>
  );
}
function ItemTable({
  blocks,
  language,
  wide = false,
}: {
  wide?: boolean;
  blocks: Extract<Block, { kind: "item" }>[];
  language: string;
}) {
  const t = (en: string, si: string) => (language === "si" ? si : en),
    first = blocks[0],
    last = blocks[blocks.length - 1];
  return (
    <section className="modern-item-section">
      <h3 className="modern-section-head">
        {language === "si"
          ? sectionSinhala[first.category] || first.category
          : first.category}
        {first.continued && <small>{t("Continued", "ඉදිරියට")}</small>}
      </h3>
      <table className="modern-items">
        <colgroup>
          {(wide ? [5, 29, 8.5, 19, 18, 20.5] : [5, 35.5, 8.5, 17, 15, 19]).map(
            (width, i) => (
              <col key={i} style={{ width: width + "%" }} />
            ),
          )}
        </colgroup>
        <thead>
          <tr>
            {[
              t("No.", "අංක"),
              t("Description", "විස්තරය"),
              t("Qty", "ප්‍රමාණය"),
              t("Unit Price", "ඒකක මිල"),
              t("Discount", "වට්ටම"),
              t("Amount", "මුදල"),
            ].map((v, i) => (
              <th key={i} scope="col">
                {v}
                {i > 2 && <small>LKR</small>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {blocks.map(({ line }, i) => (
            <tr className="modern-item-row" key={line.id || i}>
              <td>{!line._continuation && line.row_number}</td>
              <td>
                {line._continuation && (
                  <small className="modern-line-continuation">
                    {t("Item continued", "අයිතමය ඉදිරියට")} · {line.row_number}
                  </small>
                )}
                <div className="modern-description">
                  {line.description}
                  {line.position ? ` · ${line.position}` : ""}
                </div>
                {line.agreed_minor != null && (
                  <small>{t("Agreed line amount", "එකඟ වූ අයිතම මුදල")}</small>
                )}
                {line.notes && (
                  <small className="modern-item-note">{line.notes}</small>
                )}
              </td>
              <td>{!line._continuation && line.quantity}</td>
              <td>
                {!line._continuation &&
                  (line.agreed_minor != null
                    ? "—"
                    : line.unit_minor == null
                      ? "M/R"
                      : amount(line.unit_minor))}
              </td>
              <td>
                {!line._continuation &&
                  (line.agreed_minor != null
                    ? "—"
                    : amount(line.discount_minor))}
              </td>
              <td>
                <b>
                  {line._continuation
                    ? ""
                    : line.unit_minor == null && line.agreed_minor == null
                      ? "M/R"
                      : amount(
                          Number(line.net_minor || 0) +
                            Number(line.tax_minor || 0),
                        )}
                </b>
              </td>
            </tr>
          ))}
        </tbody>
        {last.last && (
          <tfoot>
            <tr>
              <th colSpan={5} scope="row">
                {t("Section subtotal", "කොටසේ එකතුව")}
              </th>
              <td>{amount(last.subtotal)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}
function Advance({
  doc,
  language,
  block,
}: Props & { block: Extract<Block, { kind: "advance" }> }) {
  const t = (en: string, si: string) => (language === "si" ? si : en),
    ack = doc.snapshot.payment_ack || {},
    p = block.payment;
  return (
    <section className="modern-advance">
      {block.first && (
        <>
          <h3>
            {t("Advance payment acknowledgement", "අත්තිකාරම් ගෙවීම පිළිගැනීම")}
          </h3>
          <div className="modern-advance-total">
            <span>
              {Number(ack.advance_minor) > 0
                ? t("Advance received", "ලැබුණු අත්තිකාරම")
                : t("No advance received", "අත්තිකාරමක් ලැබී නැත")}
            </span>
            {Number(ack.advance_minor) > 0 && (
              <strong>{money(ack.advance_minor)}</strong>
            )}
          </div>
        </>
      )}
      {p && (
        <div className="modern-advance-entry">
          <div>
            <b>{money(p.amount_minor)}</b>
            <span>{date(p.created_at)}</span>
          </div>
          <p>
            {(
              {
                cash: t("Cash", "මුදල්"),
                bank: t("Bank transfer", "බැංකු මාරුව"),
                card: t("Card", "කාඩ්පත"),
              } as Record<string, string>
            )[p.method] || p.method}
            {p.reference && (
              <>
                {" "}
                · {t("Reference", "යොමුව")}: {p.reference}
              </>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
function Closing({ doc, language }: Props) {
  const t = (en: string, si: string) => (language === "si" ? si : en),
    receiving = doc.kind === "receiving",
    s = doc.snapshot,
    v = s.settlement || {};
  const status =
    Number(v.balance_minor) < 0
      ? t("Refund due", "ආපසු ගෙවිය යුතුයි")
      : Number(v.balance_minor) === 0
        ? t("Paid", "ගෙවා ඇත")
        : Number(v.paid_minor) > 0
          ? t("Partially Paid", "කොටසක් ගෙවා ඇත")
          : t("Unpaid", "ගෙවා නැත");
  const rows: [string, string][] = [
    [t("Bill Total", "බිල්පත් එකතුව"), "total_minor"],
    [t("Advance Received", "ලැබුණු අත්තිකාරම"), "advance_minor"],
    [t("Subsequent Payments", "පසු ගෙවීම්"), "other_payments_minor"],
    ...(Number(v.refund_minor)
      ? [[t("Refunds", "ආපසු ගෙවීම්"), "refund_minor"] as [string, string]]
      : []),
    [t("Total Paid", "ගෙවූ මුළු මුදල"), "paid_minor"],
    ...(Number(v.credit_minor)
      ? [
          [t("Credits Applied", "අදාළ බැර මුදල"), "credit_minor"] as [
            string,
            string,
          ],
        ]
      : []),
  ];
  return (
    <section className="modern-closing">
      {receiving ? (
        <p className="modern-receiving-notice">
          {t(
            "Received for inspection / repair. Repair approval and insurer coverage are recorded separately.",
            "පරීක්ෂා කිරීම / අලුත්වැඩියාව සඳහා භාරගන්නා ලදී. අලුත්වැඩියා අනුමැතිය සහ රක්ෂණ ආවරණය වෙනම වාර්තා කෙරේ.",
          )}
        </p>
      ) : (
        <div className="modern-settlement">
          <div className="modern-settlement-caption">
            <h3>{t("Payment summary", "ගෙවීම් සාරාංශය")}</h3>
            <span className="modern-status">{status}</span>
            <p>
              {t("Amounts captured at", "මුදල් වාර්තා කළ වේලාව")}
              <br />
              {date(v.as_of || doc.created_at)}
              <br />
              {t("Sri Lanka time", "ශ්‍රී ලංකා වේලාව")}
            </p>
          </div>
          <div className="modern-payment-values">
            <dl>
              {rows.map(([label, key]) => (
                <Fragment key={key}>
                  <dt
                    className={
                      key === "total_minor" || key === "paid_minor"
                        ? "modern-emphasis"
                        : ""
                    }
                  >
                    {label}
                  </dt>
                  <dd
                    className={
                      key === "total_minor" || key === "paid_minor"
                        ? "modern-emphasis"
                        : ""
                    }
                  >
                    {money(v[key])}
                  </dd>
                </Fragment>
              ))}
            </dl>
            <div className="modern-balance">
              <span>{t("Outstanding Balance", "ඉතිරි මුදල")}</span>
              <strong>{money(v.balance_minor)}</strong>
            </div>
          </div>
        </div>
      )}
      <div className="modern-signatures">
        <span>{t("Customer signature", "පාරිභෝගික අත්සන")}</span>
        <span>{t("Staff signature", "කාර්ය මණ්ඩල අත්සන")}</span>
      </div>
    </section>
  );
}
function BlockView({
  block,
  doc,
  language,
  continuation = false,
}: Props & { block: Block; continuation?: boolean }) {
  if (block.kind === "work")
    return (
      <section
        className={"modern-work-summary" + (block.parts ? " has-parts" : "")}
      >
        <div>
          <h3>{language === "si" ? "නිම කළ වැඩ" : "Completed work"}</h3>
          <p>{block.work}</p>
        </div>
        {block.parts && (
          <div>
            <h3>
              {language === "si" ? "මාරු කළ අමතර කොටස්" : "Parts replaced"}
            </h3>
            <p>{block.parts}</p>
          </div>
        )}
      </section>
    );
  if (block.kind === "party") return <Parties doc={doc} language={language} />;
  if (block.kind === "finish") return <Closing doc={doc} language={language} />;
  if (block.kind === "advance")
    return <Advance doc={doc} language={language} block={block} />;
  if (block.kind === "item")
    return (
      <ItemTable
        blocks={[block]}
        language={language}
        wide={hasLargeAmounts(doc)}
      />
    );
  return (
    <section className="modern-text">
      {block.heading && (
        <h3 className="modern-detail-heading">{block.heading}</h3>
      )}
      {(block.first || continuation) && (
        <h3>
          {block.label}
          {!block.first && (
            <small>{language === "si" ? " (ඉදිරියට)" : " (continued)"}</small>
          )}
        </h3>
      )}
      <p>{block.text}</p>
    </section>
  );
}
export default function ModernCustomerDocument({ doc, language }: Props) {
  const measure = useRef<HTMLDivElement>(null),
    [pages, setPages] = useState<number[][] | null>(null),
    [error, setError] = useState("");
  const blocks = useMemo<Block[]>(() => {
    const s = doc.snapshot,
      receiving = doc.kind === "receiving",
      c = receiving ? s.content || {} : s.completion?.content || {};
    const t = (en: string, si: string) => (language === "si" ? si : en);
    const list: Block[] = [{ kind: "party" }];
    const text = (
      key: string,
      label: string,
      value: unknown,
      heading?: string,
    ) => {
      if (value)
        textChunks(String(value)).forEach((chunk, i) =>
          list.push({
            kind: "text",
            label,
            text: chunk,
            group: key,
            first: i === 0,
            heading: i === 0 ? heading : undefined,
          }),
        );
    };
    if (receiving) {
      text(
        "problem",
        t("Reported problem", "සඳහන් කළ දෝෂය"),
        c.reported_problem,
      );
      text(
        "requested",
        t("Requested repairs / services", "ඉල්ලා සිටි අලුත්වැඩියා / සේවා"),
        c.requested_work,
      );
      let optional = true;
      for (const [key, label] of [
        ["condition", t("Vehicle condition", "වාහනයේ තත්ත්වය")],
        ["damage", t("Existing damage", "දැනට පවතින හානි")],
        ["accessories", t("Accessories received", "භාරගත් උපාංග")],
        ["odometer", t("Odometer (km)", "ධාවන දුර (කි.මී.)")],
        ["fuel_level", t("Fuel level", "ඉන්ධන මට්ටම")],
        ["expected_date", t("Expected completion", "නිම කිරීමට අපේක්ෂිත දිනය")],
        ["notes", t("Additional notes", "අමතර සටහන්")],
      ]) {
        if (c[key]) {
          text(
            key,
            label,
            key === "expected_date" ? day(c[key]) : c[key],
            optional
              ? t(
                  "Vehicle condition & additional details",
                  "වාහන තත්ත්වය සහ අමතර විස්තර",
                )
              : undefined,
          );
          optional = false;
        }
      }
      if (s.correction_reason)
        text(
          "revision",
          t("Revision reason", "සංශෝධනයට හේතුව"),
          s.correction_reason,
        );
      const payments = s.payment_ack?.payments || [];
      if (payments.length)
        payments.forEach((payment: Row, i: number) =>
          list.push({ kind: "advance", first: i === 0, payment }),
        );
      else list.push({ kind: "advance", first: true });
    } else {
      for (const section of billSections(s.calculation?.lines || []))
        section.lines.forEach((source, i) => {
          const parts = itemFragments(source);
          parts.forEach((line, k) =>
            list.push({
              kind: "item",
              category: section.category,
              line,
              subtotal: section.total,
              last: i === section.lines.length - 1 && k === parts.length - 1,
              continued: i > 0 || k > 0,
            }),
          );
        });
      const compactWork =
        String(c.work_performed || "").length +
          String(c.parts_replaced || "").length <=
        300;
      if (compactWork)
        list.push({
          kind: "work",
          work: c.work_performed || "",
          parts: c.parts_replaced,
        });
      for (const [key, label] of [
        ["work_performed", t("Completed work", "නිම කළ වැඩ")],
        ["parts_replaced", t("Parts replaced", "මාරු කළ අමතර කොටස්")],
        ["checks", t("Checks performed", "සිදු කළ පරීක්ෂණ")],
        ["recommendations", t("Recommendations", "නිර්දේශ")],
        ["warranty", t("Warranty terms", "වගකීම් කොන්දේසි")],
        ["notes", t("Additional notes", "අමතර සටහන්")],
      ])
        if (
          !(compactWork && ["work_performed", "parts_replaced"].includes(key))
        )
          text(key, label, c[key]);
      text(
        "customer-notes",
        t("Customer notes", "පාරිභෝගික සටහන්"),
        s.info?.notes,
      );
      text(
        "revision",
        t("Revision reason", "සංශෝධනයට හේතුව"),
        s.correction_reason,
      );
    }
    list.push({ kind: "finish" });
    return list;
  }, [doc, language]);
  useEffect(() => {
    let active = true;
    setPages(null);
    setError("");
    (async () => {
      await document.fonts.ready;
      if (!active || !measure.current) return;
      await Promise.all(
        [...measure.current.querySelectorAll("img")].map(
          (img: HTMLImageElement) => img.decode().catch(() => {}),
        ),
      );
      if (!active || !measure.current) return;
      const root = measure.current;
      const first = root
        .querySelector<HTMLElement>(".measure-first")!
        .getBoundingClientRect().height;
      const later = root
        .querySelector<HTMLElement>(".measure-later")!
        .getBoundingClientRect().height;
      const weights = [
        ...root.querySelectorAll<HTMLElement>("[data-measure-block]"),
      ].map((el, i) => {
        const block = blocks[i];
        if (block.kind === "item") {
          const head =
            el
              .querySelector<HTMLElement>(".modern-section-head")!
              .getBoundingClientRect().height +
            el.querySelector<HTMLElement>("thead")!.getBoundingClientRect()
              .height +
            12;
          return {
            height:
              2 +
              el.querySelector<HTMLElement>("tbody")!.getBoundingClientRect()
                .height +
              (el.querySelector<HTMLElement>("tfoot")?.getBoundingClientRect()
                .height || 0),
            group: block.category,
            start: head,
          };
        }
        return { height: el.getBoundingClientRect().height + 1 };
      });
      // A4 height minus two 13 mm margins, footer and its clear space.
      setPages(
        paginateMeasured(
          weights,
          1122.52 - 98.28 - 30 - first,
          1122.52 - 98.28 - 30 - later,
        ),
      );
    })().catch((e) => {
      if (active) setError((e as Error).message);
    });
    return () => {
      active = false;
    };
  }, [blocks, doc, language]);
  const t = (en: string, si: string) => (language === "si" ? si : en);
  return (
    <div data-modern-ready={pages ? "true" : "false"}>
      <div
        className="modern-paper modern-measure"
        ref={measure}
        aria-hidden="true"
      >
        <div className="measure-first">
          <PageHeader doc={doc} language={language} />
        </div>
        <div className="measure-later">
          <PageHeader doc={doc} language={language} continued />
        </div>
        {blocks.map((block, i) => (
          <div data-measure-block key={i}>
            <BlockView
              block={block}
              doc={doc}
              language={language}
              continuation
            />
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
      {pages?.map((indices, pageIndex) => (
        <article
          className="tenuli-paper document-page modern-paper"
          lang={language}
          key={pageIndex}
        >
          <PageHeader doc={doc} language={language} continued={pageIndex > 0} />
          <div className="modern-page-body">
            {indices.map((i, j) => {
              const block = blocks[i];
              if (block.kind === "item") {
                const prev = blocks[indices[j - 1]];
                if (prev?.kind === "item" && prev.category === block.category)
                  return null;
                const group: Extract<Block, { kind: "item" }>[] = [];
                for (let k = j; k < indices.length; k++) {
                  const b = blocks[indices[k]];
                  if (b.kind !== "item" || b.category !== block.category) break;
                  group.push(b);
                }
                return (
                  <ItemTable
                    blocks={group}
                    language={language}
                    wide={hasLargeAmounts(doc)}
                    key={i}
                  />
                );
              }
              return (
                <BlockView
                  key={i}
                  block={block}
                  doc={doc}
                  language={language}
                  continuation={j === 0}
                />
              );
            })}
          </div>
          <footer className="modern-footer">
            <span>{doc.number}</span>
            <span>
              {t(
                `Page ${pageIndex + 1} of ${pages.length}`,
                `පිටුව ${pageIndex + 1} / ${pages.length}`,
              )}
            </span>
          </footer>
        </article>
      ))}
    </div>
  );
}
