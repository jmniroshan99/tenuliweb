import { useEffect, useState } from "react";
import { Form, Modal } from "../components/Controls";
import { repair } from "../lib/repair-api";
import { colomboISO, date, decimalMinor, money, today } from "../lib/format";
import type { Field, Row } from "../lib/types";
import { previewRepair } from "../lib/repair-model";
import { ReceivingForm } from "./ServiceDocuments";

const detail = (
  key: string,
  en: string,
  si: string,
  required = false,
): Field => ({
  key,
  en,
  si,
  required,
  type: "textarea",
  wide: true,
  maxLength: 2000,
});
export function FinalBillForm({
  job,
  invoice,
  latest,
  paid = 0,
  credits = 0,
  language,
  onCancel,
  onIssued,
}: {
  job: Row;
  invoice?: Row;
  latest?: Row;
  paid?: number;
  credits?: number;
  language: string;
  onCancel: () => void;
  onIssued: (d: Row) => Promise<void>;
}) {
  const t = (en: string, si: string) => (language === "si" ? si : en);
  const calculation = invoice?.snapshot.calculation || previewRepair(job.lines);
  const content =
    latest?.snapshot.completion?.content ||
    job.completion_details?.content ||
    {};
  const fields: Field[] = [
    detail("work_performed", "Work performed", "සිදු කළ වැඩ", true),
    detail(
      "parts_replaced",
      "Parts replaced (if any)",
      "මාරු කළ අමතර කොටස් (තිබේ නම්)",
    ),
    detail("recommendations", "Recommendations", "නිර්දේශ"),
    detail("warranty", "Warranty terms", "වගකීම් කොන්දේසි"),
    detail("checks", "Checks performed", "සිදු කළ පරීක්ෂණ"),
    detail("notes", "Additional notes", "අමතර සටහන්"),
    ...(!invoice
      ? [
          {
            key: "due_date",
            en: "Payment due date",
            si: "ගෙවිය යුතු දිනය",
            type: "date",
            required: true,
          },
        ]
      : [
          {
            ...detail(
              "reason",
              "Reason for this revision",
              "මෙම සංශෝධනයට හේතුව",
              true,
            ),
            maxLength: 1000,
          },
        ]),
    ...(!job.completed_at
      ? [
          {
            key: "completed_at",
            en: "Actual completion date and time",
            si: "නිම කළ දිනය සහ වේලාව",
            type: "datetime-local",
            required: true,
          },
        ]
      : []),
  ];
  return (
    <Form
      language={language}
      fields={fields}
      initial={{
        work_performed: "",
        ...content,
        due_date: today(),
      }}
      optionalKeys={["recommendations", "warranty", "checks", "notes"]}
      submit={t(
        invoice ? "Issue updated final bill" : "Issue final bill",
        invoice
          ? "යාවත්කාලීන අවසන් බිල්පත නිකුත් කරන්න"
          : "අවසන් බිල්පත නිකුත් කරන්න",
      )}
      onCancel={onCancel}
      onSave={async (p) =>
        onIssued(
          await repair(invoice ? "final_reissue" : "final_issue", {
            ...p,
            job_id: job.id,
            version: job.version,
            document_id: invoice?.id,
            copy_revision: latest?.copy_revision || 0,
            completed_at: p.completed_at
              ? colomboISO(p.completed_at)
              : undefined,
          }),
        )
      }
    >
      <div className="tenuli-stats final-review-totals">
        <div>
          <small>
            {calculation.pending
              ? t("Known total", "තහවුරු කළ එකතුව")
              : t("Bill total", "බිල්පත් එකතුව")}
          </small>
          <strong>
            {money(invoice?.total_minor ?? calculation.total_minor)}
          </strong>
        </div>
        <div>
          <small>{t("Already paid", "දැනටමත් ගෙවා ඇත")}</small>
          <strong>{money(paid)}</strong>
        </div>
        <div>
          <small>{t("Balance", "ඉතිරි මුදල")}</small>
          <strong>
            {calculation.pending
              ? t("Prices pending", "මිල තහවුරු කර නැත")
              : money(
                  Number(invoice?.total_minor ?? calculation.total_minor) -
                    credits -
                    paid,
                )}
          </strong>
        </div>
      </div>
      {calculation.pending > 0 && (
        <p className="error">
          {t(
            "Confirm or exclude all pending prices before issuing the final bill.",
            "අවසන් බිල්පත නිකුත් කිරීමට පෙර මිල තහවුරු කරන්න හෝ අයිතම ඉවත් කරන්න.",
          )}
        </p>
      )}
      <p className="tenuli-note">
        {t(
          "This A4 document combines completed work and the bill. It does not record payment or vehicle handover. Issued charges stay fixed; updated copies capture the current payment summary.",
          "මෙම A4 ලේඛනයේ නිම කළ වැඩ සහ බිල්පත ඇතුළත්ය. ගෙවීම හෝ වාහනය භාරදීම වාර්තා නොකෙරේ. නිකුත් කළ ගාස්තු නොවෙනස්ව පවතී.",
        )}
      </p>
    </Form>
  );
}

export function CollectBalanceForm({
  job,
  invoice,
  status,
  language,
  onCancel,
  onPaid,
}: {
  job: Row;
  invoice: Row;
  status: Row;
  language: string;
  onCancel: () => void;
  onPaid: () => Promise<void>;
}) {
  const t = (en: string, si: string) => (language === "si" ? si : en);
  return (
    <Form
      language={language}
      fields={[
        {
          key: "amount",
          en: "Amount received (LKR)",
          si: "ලැබුණු මුදල (රු.)",
          type: "number",
          min: 0.01,
          step: "0.01",
          required: true,
        },
        {
          key: "method",
          en: "Payment method",
          si: "ගෙවීම් ක්‍රමය",
          required: true,
          options: [
            { value: "cash", label: t("Cash", "මුදල්") },
            { value: "bank", label: t("Bank transfer", "බැංකු මාරුව") },
            { value: "card", label: t("Card", "කාඩ්පත") },
          ],
        },
        {
          key: "payer",
          en: "Paid by",
          si: "ගෙවන්නා",
          required: true,
          options: [
            { value: "customer", label: t("Customer", "පාරිභෝගිකයා") },
            { value: "insurer", label: t("Insurer", "රක්ෂණ සමාගම") },
            { value: "other", label: t("Other", "වෙනත්") },
          ],
        },
        {
          key: "reference",
          en: "Payment reference (optional)",
          si: "ගෙවීමේ යොමුව (අත්‍යවශ්‍ය නැත)",
          maxLength: 200,
        },
      ]}
      initial={{
        amount: (Number(status.balance_minor) / 100).toFixed(2),
        payer: "customer",
      }}
      optionalKeys={["reference"]}
      onCancel={onCancel}
      submit={t("Confirm payment received", "ගෙවීම ලැබුණු බව තහවුරු කරන්න")}
      onSave={async (p) => {
        const amount = decimalMinor(p.amount);
        if (amount > Number(status.balance_minor))
          throw Error(
            t(
              "Payment cannot exceed the balance.",
              "ගෙවීම ඉතිරි මුදල ඉක්මවිය නොහැක.",
            ),
          );
        await repair("collect_balance", {
          job_id: job.id,
          document_id: invoice.id,
          amount_minor: amount,
          expected_balance_minor: status.balance_minor,
          method: p.method,
          payer: p.payer,
          reference: p.reference,
          confirm: p.confirm === "on",
        });
        await onPaid();
      }}
    >
      <p className="tenuli-note">
        {t("Current balance", "වත්මන් ඉතිරි මුදල")}:{" "}
        <b>{money(status.balance_minor)}</b>.{" "}
        {t(
          "Partial payments are allowed. The advance is already deducted.",
          "කොටස් වශයෙන් ගෙවිය හැක. අත්තිකාරම දැනටමත් අඩු කර ඇත.",
        )}
      </p>
      <label className="service-confirm">
        <input name="confirm" type="checkbox" required />
        {t(
          "I confirm this money has actually been received.",
          "මෙම මුදල සැබවින්ම ලැබුණු බව තහවුරු කරමි.",
        )}
      </label>
    </Form>
  );
}

export function CurrentBillSummary({
  doc,
  language,
  canPay,
  onCollect,
  onRevise,
  refreshKey,
}: {
  doc: Row;
  language: string;
  canPay: boolean;
  onCollect: (status: Row) => void;
  onRevise: () => void;
  refreshKey: unknown;
}) {
  const t = (en: string, si: string) => (language === "si" ? si : en);
  const [status, setStatus] = useState<Row | null>(null),
    [error, setError] = useState("");
  const id = doc.source_document_id || doc.id;
  useEffect(() => {
    let active = true;
    setStatus(null);
    setError("");
    repair("bill_status", { document_id: id })
      .then((s) => {
        if (active) setStatus(s);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, refreshKey]);
  return (
    <aside className="current-bill-summary no-print">
      <h3>{t("Current payment summary", "වත්මන් ගෙවීම් සාරාංශය")}</h3>
      <p>
        {t(
          "The PDF is the issued snapshot. This panel shows the latest ledger amounts when loaded.",
          "PDF එක නිකුත් කළ පිටපතයි. මෙම කොටසේ පූරණය කළ විට වත්මන් ගෙවීම් පෙන්වයි.",
        )}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!status && !error && <p>{t("Loading…", "පූරණය වෙමින්…")}</p>}
      {status && (
        <>
          <strong className="current-bill-state">
            {status.invoice_status === "void"
              ? t("Void", "අවලංගු")
              : Number(status.balance_minor) < 0
                ? t("Refund due", "ආපසු ගෙවිය යුතුයි")
                : Number(status.balance_minor) === 0
                  ? t("Paid", "ගෙවා ඇත")
                  : Number(status.paid_minor) > 0
                    ? t("Partially Paid", "කොටසක් ගෙවා ඇත")
                    : t("Unpaid", "ගෙවා නැත")}
          </strong>
          <dl>
            {[
              [t("Total", "මුළු මුදල"), "total_minor"],
              [t("Advance received", "ලැබුණු අත්තිකාරම"), "advance_minor"],
              [t("Other payments", "වෙනත් ගෙවීම්"), "other_payments_minor"],
              [t("Refunds", "ආපසු ගෙවීම්"), "refund_minor"],
              [t("Total paid", "ගෙවූ මුළු මුදල"), "paid_minor"],
              [t("Credits applied", "අදාළ බැර මුදල"), "credit_minor"],
              [t("Balance", "ඉතිරි මුදල"), "balance_minor"],
            ].map(([label, key]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{money(status[key])}</dd>
              </div>
            ))}
          </dl>
          <small>
            {t("Updated", "යාවත්කාලීන කළේ")}: {date(status.as_of)}
          </small>
          {canPay && status.invoice_status === "issued" && (
            <div className="current-bill-actions">
              <button
                className="primary"
                disabled={Number(status.balance_minor) <= 0}
                onClick={() => onCollect(status)}
              >
                {t("Collect Balance", "ඉතිරි මුදල ලබාගන්න")}
              </button>
              <button onClick={onRevise}>
                {t(
                  "Issue updated final bill",
                  "යාවත්කාලීන අවසන් බිල්පත නිකුත් කරන්න",
                )}
              </button>
            </div>
          )}
        </>
      )}
      <button
        onClick={async () => {
          setError("");
          try {
            setStatus(await repair("bill_status", { document_id: id }));
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {t("Refresh payment summary", "ගෙවීම් සාරාංශය නැවත පූරණය")}
      </button>
    </aside>
  );
}

export default function CustomerDocuments({
  data,
  job,
  manage,
  canPay,
  canViewBill,
  language,
  open,
  reload,
  onFinal,
}: {
  data: Row;
  job: Row;
  manage: boolean;
  canPay: boolean;
  canViewBill: boolean;
  language: string;
  open: (d: Row) => void;
  reload: () => Promise<void>;
  onFinal: () => void;
}) {
  const [mode, setMode] = useState("");
  const t = (en: string, si: string) => (language === "si" ? si : en);
  const rn = (data.service_documents || [])
    .filter((d: Row) => d.job_id === job.id && d.kind === "receiving")
    .sort((a: Row, b: Row) => b.revision - a.revision)[0];
  const invoice = (data.documents || []).find(
    (d: Row) =>
      d.job_id === job.id && d.kind === "invoice" && d.status === "issued",
  );
  const latest =
    invoice &&
    ((data.document_copies || [])
      .filter((d: Row) => d.source_document_id === invoice.id)
      .sort((a: Row, b: Row) => b.copy_revision - a.copy_revision)[0] ||
      invoice);
  const hand = (data.handovers || []).find((h: Row) => h.job_id === job.id);
  const ready = latest?.snapshot.template_version === "final-bill-v1";
  return (
    <section className="customer-document-workflow">
      <h3>{t("Two customer documents", "පාරිභෝගික ලේඛන දෙක")}</h3>
      <div className="customer-document-cards">
        <section>
          <span className="eyebrow">01 · A4</span>
          <h4>
            {t(
              "Vehicle Receiving Note & Advance Acknowledgement",
              "වාහන භාරගැනීම සහ අත්තිකාරම් පිළිගැනීම",
            )}
          </h4>
          <p>
            {t(
              "Full repair breakdown, estimated total, advance and remaining amount.",
              "සම්පූර්ණ වැඩ විස්තර, ඇස්තමේන්තුගත එකතුව, අත්තිකාරම් සහ ඉතිරි මුදල.",
            )}
          </p>
          <div className="actions">
            {(rn || (manage && job.status !== "cancelled")) && (
              <button onClick={() => (rn ? open(rn) : setMode("receiving"))}>
                {t("Print Receiving Note", "භාරගැනීමේ සටහන මුද්‍රණය")}
              </button>
            )}
            {rn && manage && job.status !== "cancelled" && (
              <button onClick={() => setMode("receiving")}>
                {t("Revise receiving note", "භාරගැනීමේ සටහන සංශෝධනය")}
              </button>
            )}
          </div>
        </section>
        <section>
          <span className="eyebrow">02 · A4</span>
          <h4>
            {t(
              "Repair Completion & Final Bill",
              "අලුත්වැඩියා නිමකිරීම සහ අවසන් බිල්පත",
            )}
          </h4>
          <p>
            {t(
              "Completed work, item charges, advance and remaining balance.",
              "නිම කළ වැඩ, අයිතම ගාස්තු, අත්තිකාරම් සහ ඉතිරි මුදල.",
            )}
          </p>
          <div className="actions">
            {latest && canViewBill && (
              <>
                <button className="primary" onClick={() => open(latest)}>
                  {t("View Issued Bill", "නිකුත් කළ බිල්පත බලන්න")}
                </button>
                <button onClick={() => open(latest)}>
                  {t(
                    "Print / Download Final Bill",
                    "අවසන් බිල්පත මුද්‍රණය / බාගන්න",
                  )}
                </button>
                {canPay && (
                  <button onClick={() => open(latest)}>
                    {t("Collect Balance", "ඉතිරි මුදල ලබාගන්න")}
                  </button>
                )}
              </>
            )}
            {canPay && job.status === "completed" && !ready && (
              <button className="primary" onClick={onFinal}>
                {t(
                  invoice
                    ? "Prepare combined final bill"
                    : "Review & Issue Final Bill",
                  invoice
                    ? "ඒකාබද්ධ අවසන් බිල්පත සකසන්න"
                    : "අවසන් බිල්පත පරීක්ෂා කර නිකුත් කරන්න",
                )}
              </button>
            )}
            {!invoice && job.status !== "completed" && (
              <small>
                {t(
                  "Available after repairs are completed.",
                  "අලුත්වැඩියා නිම කළ පසු ලබාගත හැක.",
                )}
              </small>
            )}
          </div>
        </section>
      </div>
      <div className="service-status">
        <span>
          {t("Received", "භාරගත් වේලාව")}:{" "}
          <b>{job.received_at ? date(job.received_at) : "—"}</b>
        </span>
        <span>
          {t("Completed", "නිම කළ වේලාව")}:{" "}
          <b>{job.completed_at ? date(job.completed_at) : "—"}</b>
        </span>
        <span>
          {t("Vehicle handover", "වාහනය භාරදීම")}:{" "}
          <b>
            {hand
              ? date(hand.handed_over_at)
              : t("Not recorded", "වාර්තා කර නැත")}
          </b>
        </span>
      </div>
      {manage && canViewBill && job.status === "completed" && !hand && (
        <button disabled={!ready} onClick={() => setMode("handover")}>
          {t("Record Vehicle Handover", "වාහනය භාරදීම වාර්තා කරන්න")}
        </button>
      )}
      <p className="tenuli-note">
        {t(
          "Printing and receiving payments do not record vehicle handover. Confirm handover separately when the vehicle is returned.",
          "මුද්‍රණය හෝ ගෙවීම් ලබාගැනීමෙන් වාහනය භාරදීම වාර්තා නොවේ. වාහනය ආපසු භාරදෙන විට වෙනම තහවුරු කරන්න.",
        )}
      </p>
      {mode && (
        <Modal
          title={t(
            mode === "receiving"
              ? "Vehicle receiving note"
              : "Confirm vehicle handover",
            mode === "receiving"
              ? "වාහන භාරගැනීමේ සටහන"
              : "වාහනය භාරදීම තහවුරු කරන්න",
          )}
          onClose={() => setMode("")}
        >
          {mode === "receiving" ? (
            <ReceivingForm
              language={language}
              job={job}
              previous={rn}
              canPay={canPay && !invoice && !hand}
              onCancel={() => setMode("")}
              onIssued={async (d) => {
                setMode("");
                await reload();
                open(d);
              }}
            />
          ) : (
            <Form
              language={language}
              fields={[
                {
                  key: "recipient",
                  en: "Vehicle received by",
                  si: "වාහනය භාරගත් පුද්ගලයා",
                  required: true,
                  maxLength: 200,
                },
                detail("handover_notes", "Handover notes", "භාරදීමේ සටහන්"),
              ]}
              initial={{ recipient: job.info.customer_name }}
              optionalKeys={["handover_notes"]}
              onCancel={() => setMode("")}
              submit={t(
                "Confirm vehicle returned",
                "වාහනය ආපසු භාරදුන් බව තහවුරු කරන්න",
              )}
              onSave={async (p) => {
                await repair("final_handover", {
                  ...p,
                  confirm: p.confirm === "on",
                  job_id: job.id,
                  version: job.version,
                });
                setMode("");
                await reload();
              }}
            >
              <label className="service-confirm">
                <input type="checkbox" name="confirm" required />
                {t(
                  "I confirm the vehicle has actually been returned to this person. Record the current date and time.",
                  "මෙම පුද්ගලයාට වාහනය ආපසු භාරදුන් බව තහවුරු කරමි. වත්මන් දිනය සහ වේලාව වාර්තා කරන්න.",
                )}
              </label>
              <p className="tenuli-note">
                {t(
                  "Any outstanding balance remains payable. This action does not create another customer document.",
                  "ඉතිරි මුදල ගෙවිය යුතු ලෙසම පවතී. මෙය තවත් පාරිභෝගික ලේඛනයක් නිකුත් නොකරයි.",
                )}
              </p>
            </Form>
          )}
        </Modal>
      )}
    </section>
  );
}
