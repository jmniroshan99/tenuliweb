import { useEffect, useRef, useState } from "react";
import { Download, Printer, Share2 } from "lucide-react";
import type { RentalData, Row } from "../lib/types";
import {
  money,
  date,
  day,
  paidFor,
  depositFor,
  downloadBlob,
} from "../lib/format";
export function Invoice({
  invoice,
  data,
  receipt,
  language,
}: {
  invoice: Row;
  data: RentalData;
  receipt?: Row;
  language: string;
}) {
  const root = useRef<HTMLDivElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [download, setDownload] = useState<{ url: string; name: string } | null>(
      null,
    );
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download.url);
    },
    [download],
  );
  const si = language === "si",
    t = (en: string, s: string) => (si ? s : en),
    s = invoice.snapshot,
    c = s.calculation,
    b = s.booking;
  const groups: Row[][] = [];
  for (let i = 0; i < c.lines.length; i += 12)
    groups.push(c.lines.slice(i, i + 12));
  async function pdf() {
    await document.fonts.ready;
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    const nodes = Array.from(
      root.current!.querySelectorAll<HTMLElement>(".document-page"),
    );
    let doc: InstanceType<typeof jsPDF> | undefined;
    for (const node of nodes) {
      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: false,
      });
      const width = receipt ? 80 : 210,
        height = receipt
          ? Math.max(110, (canvas.height * width) / canvas.width)
          : 297;
      if (!doc) doc = new jsPDF({ unit: "mm", format: [width, height] });
      else doc.addPage([width, height]);
      const drawWidth = Math.min(
        width,
        (canvas.width * height) / canvas.height,
      );
      doc.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        (width - drawWidth) / 2,
        0,
        drawWidth,
        (canvas.height * drawWidth) / canvas.width,
      );
    }
    return doc!.output("blob");
  }
  async function output(share = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const blob = await pdf();
      const name = (receipt?.receipt_number || invoice.number) + ".pdf";
      setDownload({ url: URL.createObjectURL(blob), name });
      const file = new File([blob], name, { type: "application/pdf" });
      if (share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
      } else downloadBlob(blob, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="document-actions no-print">
        <button onClick={() => window.print()}>
          <Printer size={16} />
          {t("Print", "මුද්‍රණය")}
        </button>
        <button className="primary" disabled={busy} onClick={() => output()}>
          <Download size={16} />
          {busy ? "Preparing…" : t("Download PDF", "PDF බාගන්න")}
        </button>
        <button disabled={busy} onClick={() => output(true)}>
          <Share2 size={16} />
          {t("Share file", "ගොනුව බෙදාගන්න")}
        </button>
        <small>
          A4 invoice · 80 mm receipt · Sinhala font embedded as rendered page
        </small>
      </div>
      {error && <p className="error">{error}</p>}
      {download && (
        <p className="no-print" role="status">
          {t(
            "PDF ready. If the download did not start: ",
            "PDF සූදානම්. බාගත වීම ආරම්භ නොවූයේ නම්: ",
          )}
          <a href={download.url} download={download.name}>
            {t("Save PDF file", "PDF ගොනුව සුරකින්න")}
          </a>
          {" · "}
          <a href={download.url} target="_blank" rel="noopener noreferrer">
            {t("Open PDF preview", "PDF පෙරදසුන විවෘත කරන්න")}
          </a>
        </p>
      )}
      <div
        ref={root}
        className={receipt ? "document-root receipt-root" : "document-root"}
      >
        {receipt ? (
          <section className="document-page receipt-page">
            <header data-letterhead={s.letterhead_style}>
              {s.business.logo && (
                <img
                  src={s.business.logo}
                  alt={s.business.name}
                  style={{ width: 125, height: 52, objectFit: "contain" }}
                />
              )}
              <h2>{s.business.name}</h2>
              <p>
                {s.business.address}
                <br />
                {s.business.phone}
              </p>
              <hr />
            </header>
            <h3>{t("PAYMENT RECEIPT", "ගෙවීම් රිසිට්පත")}</h3>
            <strong>{receipt.receipt_number}</strong>
            <p>{date(receipt.created_at)}</p>
            <p>
              {s.customer.name}
              <br />
              {s.vehicle.registration_number}
            </p>
            <hr />
            <p>
              {receipt.kind.replaceAll("_", " ")} · {receipt.method}
            </p>
            <h2>{money(receipt.amount_minor)}</h2>
            <p>
              {receipt.reference}
              <br />
              {receipt.reason}
            </p>
            <hr />
            <p>
              {t("Invoice", "බිල්පත")}: {invoice.number}
            </p>
            <p>{t("Thank you", "ස්තූතියි")}</p>
          </section>
        ) : (
          groups.map((lines, idx) => (
            <section className="document-page invoice-page" key={idx}>
              <div
                className="invoice-head"
                data-letterhead={s.letterhead_style}
              >
                <div>
                  <img
                    src={s.business.logo || "/tenuli-logo.svg"}
                    alt="Tenuli Auto Care"
                    style={
                      s.business.logo
                        ? { width: 125, height: 52, objectFit: "contain" }
                        : undefined
                    }
                  />
                  <h2>{s.business.name}</h2>
                  <p>
                    {s.business.address}
                    <br />
                    {s.business.phone}
                  </p>
                </div>
                <div className="invoice-number">
                  <span>{t("RENTAL INVOICE", "වාහන කුලී බිල්පත")}</span>
                  <h2>{invoice.number}</h2>
                  <p>
                    {t("Issued", "නිකුත් කළේ")}: {day(invoice.issued_at)}
                    <br />
                    {t("Due", "ගෙවිය යුතු දිනය")}: {day(invoice.due_date)}
                  </p>
                  {invoice.status === "void" && (
                    <strong className="void-stamp">VOID / අවලංගු</strong>
                  )}
                </div>
              </div>
              <div className="invoice-parties">
                <div>
                  <small>{t("BILL TO", "පාරිභෝගිකයා")}</small>
                  <h3>{s.customer.name}</h3>
                  <p>
                    {s.customer.address}
                    <br />
                    {s.customer.phone}
                  </p>
                </div>
                <div>
                  <small>{t("VEHICLE & RENTAL", "වාහනය සහ කුලී කාලය")}</small>
                  <h3>
                    {s.vehicle.registration_number} · {s.vehicle.make}{" "}
                    {s.vehicle.model}
                  </h3>
                  <p>
                    {date(b.pickup_at)} →{" "}
                    {date(b.actual_return_at || b.return_at)}
                    <br />
                    {t("Odometer", "ධාවන දුර")}: {b.odometer_out ?? "—"} →{" "}
                    {b.odometer_in ?? "—"} km
                    <br />
                    {t("Included distance", "ඇතුළත් දුර")}: {c.included_km} km ·{" "}
                    {b.agreement_ref}
                  </p>
                </div>
              </div>
              <table className="invoice-items">
                <thead>
                  <tr>
                    <th>{t("Description", "විස්තරය")}</th>
                    <th>{t("Qty", "ප්‍රමාණය")}</th>
                    <th>{t("Rate", "අනුපාතය")}</th>
                    <th>{t("Amount", "මුදල")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, j) => (
                    <tr key={j}>
                      <td>{l.label}</td>
                      <td>{l.quantity}</td>
                      <td>{money(l.rate_minor)}</td>
                      <td>{money(l.amount_minor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {idx === groups.length - 1 && (
                <>
                  <div className="invoice-summary">
                    <div className="invoice-notes">
                      <h4>{t("Notes", "සටහන්")}</h4>
                      <p>
                        {s.business.notes ||
                          b.notes ||
                          "Thank you for choosing Tenuli Auto Care."}
                      </p>
                      <p>
                        {t(
                          "Refundable deposit held separately",
                          "ආපසු ගෙවන තැන්පතුව වෙනම තබා ඇත",
                        )}
                        : <strong>{money(depositFor(b.id, data))}</strong>
                      </p>
                      <small>
                        Deposit and payment balances shown as of{" "}
                        {date(new Date().toISOString())}. Issued charges are
                        fixed.{" "}
                        {Number(c.tax_minor) > 0 &&
                          "Original issued total retained."}
                      </small>
                    </div>
                    <dl>
                      <div>
                        <dt>{t("Subtotal", "උප එකතුව")}</dt>
                        <dd>{money(c.subtotal_minor)}</dd>
                      </div>
                      <div>
                        <dt>{t("Discount", "වට්ටම")}</dt>
                        <dd>− {money(c.discount_minor)}</dd>
                      </div>
                      <div className="total">
                        <dt>{t("Total", "මුළු මුදල")}</dt>
                        <dd>{money(c.total_minor)}</dd>
                      </div>
                      <div>
                        <dt>{t("Payments allocated", "ගෙවූ මුදල")}</dt>
                        <dd>{money(paidFor(invoice, data))}</dd>
                      </div>
                      <div className="balance">
                        <dt>{t("Balance due", "ඉතිරි මුදල")}</dt>
                        <dd>
                          {money(
                            Number(c.total_minor) - paidFor(invoice, data),
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="signatures">
                    <span>{t("Authorized signature", "බලයලත් අත්සන")}</span>
                    <span>{t("Customer signature", "පාරිභෝගික අත්සන")}</span>
                  </div>
                </>
              )}
              <footer className="invoice-footer">
                Tenuli Auto Care · LKR · Asia/Colombo{" "}
                <span>
                  {idx + 1} / {groups.length}
                </span>
              </footer>
            </section>
          ))
        )}
      </div>
    </>
  );
}
