import ModernCustomerDocument from "./ModernCustomerDocument";
import OperationsCustomerDocument from "./OperationsCustomerDocument";
import { OPERATIONS_LAYOUT } from "../lib/operations-document";
import { MODERN_LAYOUT } from "../lib/modern-document";
import GroupedRepairDocument from "./GroupedRepairDocument";
import ServiceDocumentPages from "./ServiceDocumentPages";
import { useEffect, useRef, useState } from "react";
import { Download, Printer, Share2 } from "lucide-react";
import { money, day, downloadBlob } from "../lib/format";
import { documentGroups } from "../lib/repair-model";
import type { Row } from "../lib/types";
export default function RepairDocument({
  doc,
  language,
  paid = 0,
}: {
  doc: Row;
  language: string;
  paid?: number;
}) {
  const root = useRef<HTMLDivElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [showPdf, setShowPdf] = useState(false),
    [file, setFile] = useState<{
      blob: Blob;
      url: string;
      name: string;
    } | null>(null);
  useEffect(
    () => () => {
      if (file) URL.revokeObjectURL(file.url);
    },
    [file],
  );
  const t = (en: string, si: string) => (language === "si" ? si : en),
    s = doc.snapshot,
    info = s.info || {},
    business = s.business || {},
    calc = s.calculation || {},
    receipt = doc.kind === "payment" || doc.kind === "refund",
    report = doc.kind === "report";
  const title = report
    ? "INTERNAL PROFIT REPORT"
    : receipt
      ? doc.kind === "refund"
        ? t("REFUND RECEIPT", "ආපසු ගෙවීම් රිසිට්පත")
        : t("PAYMENT RECEIPT", "ගෙවීම් රිසිට්පත")
      : doc.kind === "invoice"
        ? t("REPAIR INVOICE", "අලුත්වැඩියා බිල්පත")
        : doc.kind === "credit"
          ? t("CREDIT NOTE", "බැර සටහන")
          : t("REPAIR ESTIMATE", "අලුත්වැඩියා ඇස්තමේන්තුව");
  const groups = receipt
    ? [[]]
    : documentGroups(report ? s.rows : calc.lines || []);
  async function readyPages() {
    await document.fonts.ready;
    for (let i = 0; i < 100; i++) {
      const pending = root.current?.querySelector(
        '[data-modern-ready="false"]',
      );
      if (!pending) return;
      const message = pending.querySelector('[role="alert"]')?.textContent;
      if (message) throw Error(message);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw Error("A4 pages are still preparing. Please try again.");
  }
  async function printDocument() {
    setError("");
    // Open synchronously from the user's click, then print only the issued copy.
    // Native modal top layers can obscure window.print() on the admin screen.
    const preview = window.open("", "_blank");
    if (!preview) {
      setError(
        t(
          "Allow the print window, or download the PDF to print it.",
          "මුද්‍රණ කවුළුවට ඉඩ දෙන්න, නැතහොත් PDF බාගෙන මුද්‍රණය කරන්න.",
        ),
      );
      return;
    }
    try {
      await readyPages();
      preview.opener = null;
      preview.document.title = doc.number;
      preview.document.documentElement.lang = language;
      const base = preview.document.createElement("base");
      base.href = document.baseURI;
      preview.document.head.append(base);
      const ready: Promise<void>[] = [];
      document
        .querySelectorAll('link[rel="stylesheet"], style')
        .forEach((node) => {
          const copy = node.cloneNode(true) as HTMLElement;
          if (copy.tagName === "LINK")
            ready.push(
              new Promise((resolve, reject) => {
                copy.onload = () => resolve();
                copy.onerror = () =>
                  reject(Error("Print styles could not load"));
              }),
            );
          preview.document.head.append(copy);
        });
      const styles = preview.document.createElement("style");
      styles.textContent = `html,body{margin:0!important;padding:0!important;background:white!important} html body:has(.tenuli-paper) *{visibility:visible!important} .tenuli-paper-scroll{max-height:none!important;overflow:visible!important;padding:0!important;background:white!important} .tenuli-paper{margin:0 auto!important;box-shadow:none!important} @media print{body>*{visibility:visible!important} .tenuli-paper{width:210mm;min-height:277mm;break-after:page} .tenuli-paper:last-child{break-after:auto}.tenuli-receipt{width:80mm!important;min-height:0!important}}`;
      preview.document.head.append(styles);
      const printed = root.current!.cloneNode(true) as HTMLElement;
      printed
        .querySelectorAll(".modern-measure, .operations-measure")
        .forEach((node) => node.remove());
      preview.document.body.append(printed);
      await Promise.all(ready);
      await preview.document.fonts.ready;
      await Promise.all(
        [...preview.document.images].map((img) => img.decode().catch(() => {})),
      );
      preview.focus();
      preview.print();
    } catch (e) {
      preview.close();
      setError((e as Error).message);
    }
  }
  async function output(download = true) {
    if (file) {
      if (download) downloadBlob(file.blob, file.name);
      else setShowPdf(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await readyPages();
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      let pdf: InstanceType<typeof jsPDF> | undefined;
      for (const node of root.current!.querySelectorAll<HTMLElement>(
        ".tenuli-paper",
      )) {
        const canvas = await html2canvas(node, {
          scale: 2,
          backgroundColor: "#ffffff",
        });
        const w = receipt ? 80 : 210,
          h = receipt ? Math.max(100, (canvas.height * w) / canvas.width) : 297;
        if (!pdf)
          pdf = new jsPDF({ unit: "mm", compress: true, format: [w, h] });
        else pdf.addPage([w, h]);
        const dw = Math.min(w, (canvas.width * h) / canvas.height);
        pdf.addImage(
          canvas.toDataURL("image/png"),
          "PNG",
          (w - dw) / 2,
          0,
          dw,
          (canvas.height * dw) / canvas.width,
        );
      }
      const blob = pdf!.output("blob"),
        name = doc.number + ".pdf";
      setFile({ blob, url: URL.createObjectURL(blob), name });
      if (download) downloadBlob(blob, name);
      else setShowPdf(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    if (!file) return;
    try {
      const f = new File([file.blob], file.name, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [f] }))
        await navigator.share({ files: [f], title: business.name });
      else downloadBlob(file.blob, file.name);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="document-actions no-print">
        <button onClick={printDocument}>
          <Printer size={16} />
          {t("Print", "මුද්‍රණය")}
        </button>
        <button className="primary" disabled={busy} onClick={() => output()}>
          <Download size={16} />
          {busy ? "Preparing…" : t("Download PDF", "PDF බාගන්න")}
        </button>
        {["receiving-advance-v1", "final-bill-v1"].includes(
          s.template_version,
        ) && (
          <button
            disabled={busy}
            onClick={() => (showPdf ? setShowPdf(false) : output(false))}
          >
            {showPdf
              ? t("Document preview", "ලේඛන පෙරදසුන")
              : t("View PDF", "PDF බලන්න")}
          </button>
        )}
        {file && (
          <>
            <button onClick={share}>
              <Share2 size={16} />
              {t("Share PDF", "PDF බෙදාගන්න")}
            </button>
            <a href={file.url} download={file.name}>
              Save PDF
            </a>
          </>
        )}
        <small>
          {receipt ? "80 mm receipt" : "A4 document"} ·{" "}
          {report ? "Private internal report" : "Customer copy"}
        </small>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {showPdf && file && (
        <div className="issued-pdf-viewer">
          <iframe
            title={t("Issued bill PDF", "නිකුත් කළ බිල්පත PDF")}
            src={file.url}
          />
          <p>
            {t(
              "If your device cannot display the PDF, use Document preview or Download PDF.",
              "ඔබගේ උපාංගයේ PDF දර්ශනය නොවේ නම් ලේඛන පෙරදසුන හෝ PDF බාගැනීම භාවිතා කරන්න.",
            )}
          </p>
        </div>
      )}
      <div hidden={showPdf}>
        <div className="tenuli-paper-scroll" ref={root}>
          {s.layout_version === OPERATIONS_LAYOUT &&
          (doc.kind === "receiving" || doc.kind === "invoice") ? (
            <OperationsCustomerDocument doc={doc} language={language} />
          ) : s.layout_version === MODERN_LAYOUT &&
            ["receiving", "invoice"].includes(doc.kind) ? (
            <ModernCustomerDocument doc={doc} language={language} />
          ) : ["receiving", "completion"].includes(doc.kind) ? (
            <ServiceDocumentPages doc={doc} language={language} />
          ) : ["grouped-v1", "final-bill-v1"].includes(s.template_version) &&
            ["estimate", "invoice"].includes(doc.kind) ? (
            <GroupedRepairDocument doc={doc} language={language} />
          ) : (
            groups.map((lines, index) => (
              <article
                className={
                  "tenuli-paper document-page " +
                  (receipt ? "tenuli-receipt" : "")
                }
                key={index}
              >
                <header
                  className="tenuli-document-head"
                  data-letterhead={s.letterhead_style}
                >
                  <img
                    src={business.logo || "/tenuli-logo.svg"}
                    alt="Tenuli Auto Care logo"
                    style={
                      business.brand_version === "capture-2026-v1"
                        ? { width: 125, height: 52, objectFit: "contain" }
                        : undefined
                    }
                  />
                  <div>
                    <h2>{business.name || "Tenuli Auto Care"}</h2>
                    <p>{business.address}</p>
                    <p>
                      {business.phone} · {business.email}
                    </p>
                    <small>{business.notes}</small>
                  </div>
                </header>
                <div className="tenuli-document-title">
                  <strong>{title}</strong>
                  <span>{doc.number}</span>
                </div>
                <div className="tenuli-document-meta">
                  <div>
                    <b>
                      {info.customer_name || (report ? "Management copy" : "")}
                    </b>
                    <p>{info.phone}</p>
                    <p>{info.address}</p>
                    {info.registration && (
                      <p>
                        <b>{t("Vehicle", "වාහනය")}:</b> {info.registration} ·{" "}
                        {info.make_model}
                      </p>
                    )}
                  </div>
                  <div>
                    <p>
                      {t("Date", "දිනය")}: {day(doc.created_at)}
                    </p>
                    {s.job_number && <p>Job: {s.job_number}</p>}
                    {s.due_date && (
                      <p>
                        {t("Due", "ගෙවිය යුතු දිනය")}: {day(s.due_date)}
                      </p>
                    )}
                    {info.accident_date && (
                      <p>Accident: {day(info.accident_date)}</p>
                    )}
                    {info.insurance && <p>Insurance: {info.insurance}</p>}
                    {info.claim_number && <p>Claim: {info.claim_number}</p>}
                    {info.policy_number && <p>Policy: {info.policy_number}</p>}
                    {doc.kind === "estimate" && info.valid_until && (
                      <p>Valid until: {day(info.valid_until)}</p>
                    )}
                  </div>
                </div>
                {doc.status === "void" && (
                  <p className="tenuli-stamp">VOID / අවලංගු</p>
                )}
                {receipt ? (
                  <>
                    <div className="tenuli-receipt-amount">
                      <small>
                        {doc.kind === "refund" ? "Refunded" : "Received"}
                      </small>
                      <h2>{money(doc.amount_minor)}</h2>
                    </div>
                    <p>
                      Payer: {doc.payer} · {doc.method}
                    </p>
                    <p>Reference: {doc.reference || "—"}</p>
                    <p>{doc.reason}</p>
                  </>
                ) : report ? (
                  <>
                    <p className="muted">{s.period}</p>
                    <table>
                      <thead>
                        <tr>
                          <th>Job / vehicle</th>
                          <th>Revenue</th>
                          <th>Direct cost</th>
                          <th>Gross profit</th>
                          <th>Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((r: Row) => (
                          <tr key={r.id}>
                            <td>
                              {r.number}
                              <br />
                              {r.vehicle}
                              <br />
                              <small>
                                {r.complete ? "Costs confirmed" : "PROVISIONAL"}
                              </small>
                            </td>
                            <td>{money(r.revenue_minor)}</td>
                            <td>{money(r.direct_cost_minor)}</td>
                            <td>{money(r.profit_minor)}</td>
                            <td>
                              {r.margin === null ? "N/A" : r.margin + "%"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p>
                      Profit = sales revenue − recorded job costs. Pending costs
                      keep profit provisional. Business overheads are excluded.
                      Uninvoiced jobs have zero recognized revenue. Balances are
                      lifetime amounts as of report generation.
                    </p>
                  </>
                ) : (
                  <table className="tenuli-document-items">
                    <thead>
                      <tr>
                        <th>{t("Work / item", "වැඩ / අයිතමය")}</th>
                        <th>Qty</th>
                        <th>Unit price</th>
                        <th>Discount</th>
                        <th>{t("Amount", "මුදල")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l: Row, i: number) => (
                        <tr key={l.id || i}>
                          <td>
                            <b>{l.description}</b>
                            {l.notes && <p>{l.notes}</p>}
                            {l.excluded && <em>Excluded / ඉවත් කළ</em>}
                          </td>
                          <td>
                            {l.quantity} {l.unit}
                          </td>
                          <td>
                            {l.unit_minor == null ? "M/R" : money(l.unit_minor)}
                          </td>
                          <td>{money(l.discount_minor || 0)}</td>
                          <td>
                            {l.excluded
                              ? "Excluded"
                              : l.net_minor == null
                                ? "Price pending"
                                : money(
                                    Number(l.net_minor) +
                                      Number(l.tax_minor || 0),
                                  )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {!receipt && !report && index === groups.length - 1 && (
                  <>
                    <div className="tenuli-document-bottom">
                      <div>
                        {calc.pending > 0 && (
                          <p className="tenuli-pending">
                            PROVISIONAL · {calc.pending} price(s) pending. The
                            total covers priced items only.
                          </p>
                        )}
                        <p>{info.notes || s.reason}</p>
                        {s.original_number && (
                          <p>Credit against: {s.original_number}</p>
                        )}
                        {doc.kind === "estimate" && (
                          <p>
                            This estimate is subject to approval. Insurer cover
                            is not confirmed by this document.
                          </p>
                        )}
                        {info.advisor && <p>Service advisor: {info.advisor}</p>}
                        {Number(calc.tax_minor) > 0 && (
                          <p>
                            {t(
                              "Original issued amounts retained.",
                              "මුල් නිකුත් කළ මුදල් වෙනස් කර නැත.",
                            )}
                          </p>
                        )}
                      </div>
                      <dl>
                        <dt>
                          <b>{calc.pending ? "Known total" : "Total"}</b>
                        </dt>
                        <dd>
                          <b>{money(calc.total_minor)}</b>
                        </dd>
                        {doc.kind === "invoice" && doc.status !== "void" && (
                          <>
                            <dt>Paid / credits applied*</dt>
                            <dd>{money(paid)}</dd>
                            <dt>Balance*</dt>
                            <dd>{money(Number(calc.total_minor) - paid)}</dd>
                          </>
                        )}
                      </dl>
                    </div>
                    {doc.kind === "invoice" && (
                      <small>
                        *Live settlement display at{" "}
                        {new Date().toLocaleString("en-GB", {
                          timeZone: "Asia/Colombo",
                        })}
                        ; issued charges above remain fixed.
                      </small>
                    )}
                    <div className="tenuli-signatures">
                      <span>Customer signature</span>
                      <span>Service advisor signature</span>
                    </div>
                  </>
                )}
                <footer className="tenuli-document-footer">
                  {report
                    ? "CONFIDENTIAL · INTERNAL USE ONLY"
                    : business.name || "Tenuli Auto Care"}{" "}
                  · LKR · {index + 1}/{groups.length}
                </footer>
              </article>
            ))
          )}
        </div>
      </div>
    </>
  );
}
