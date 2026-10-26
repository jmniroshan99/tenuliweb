import PriceReview from "./PriceReview";
import { useEffect, useState } from "react";
import { Plus, RefreshCw, FileText, Wrench } from "lucide-react";
import { Badge, Modal, Table } from "../components/Controls";
import { repair } from "../lib/repair-api";
import { useSharedRepairCatalogue } from "../lib/shared-repair-catalogue";
import { money, day } from "../lib/format";
import { previewRepair, type RepairLine } from "../lib/repair-model";
import type { Field, Row } from "../lib/types";
import { ActionForm, field, amount, choice, reason } from "./RepairForms";
import GroupedRepairEditor, { initialRepairLines } from "./GroupedRepairEditor";
import { ReceivingForm } from "./ServiceDocuments";
import CustomerDocuments, {
  FinalBillForm,
  CollectBalanceForm,
  CurrentBillSummary,
} from "./CustomerDocuments";
import RepairDocument from "./RepairDocument";
import { WorkshopSetup } from "../components/WorkshopAccess";
const infoFields: Field[] = [
  field("customer_name", "Customer name", "text", true),
  field("phone", "Phone"),
  field("address", "Address"),
  field("registration", "Vehicle registration", "text", true),
  field("make_model", "Make / model"),
  field("accident_date", "Accident date", "date"),
  field("insurance", "Insurance company"),
  field("policy_number", "Policy number"),
  field("claim_number", "Claim number"),
  field("valid_until", "Estimate valid until", "date"),
  field("advisor", "Service advisor"),
  field("expected_date", "Expected completion", "date"),
  amount("expected_customer_minor", "Expected customer contribution", false),
  amount("expected_insurer_minor", "Expected insurer contribution", false),
  field("notes", "Customer-facing notes"),
  field("reported_problem", "Reported problem", "textarea"),
  field("requested_work", "Requested work", "textarea"),
  field("assessor_details", "Assessor details"),
  field("chassis_number", "Chassis number"),
  field("manufacture_notes", "Manufacture notes"),
];
export default function Repairs({
  catalogueScope,
  permissions,
  language,
  administrator,
  refreshAccess,
}: {
  catalogueScope: string;
  permissions: Set<string>;
  language: string;
  administrator: boolean;
  refreshAccess: () => Promise<void>;
}) {
  const [savedEstimateId, setSavedEstimateId] = useState("");
  const [data, setData] = useState<Row | null>(null),
    [selected, setSelected] = useState(""),
    [receivingVehicle, setReceivingVehicle] = useState(false),
    [editor, setEditor] = useState<Row | null>(null),
    [action, setAction] = useState<Row | null>(null),
    [doc, setDoc] = useState<Row | null>(null),
    [finalEditor, setFinalEditor] = useState(false),
    [collection, setCollection] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [loadFailure, setLoadFailure] = useState<
      (Error & { code?: string }) | null
    >(null),
    [loading, setLoading] = useState(false);
  const can = (p: string) => permissions.has(p),
    manage = can("manage_repairs"),
    billing = can("manage_repair_payments");
  const t = (en: string, si: string) => (language === "si" ? si : en);
  async function load() {
    setLoading(true);
    try {
      setData(await repair("list"));
      setError("");
      setLoadFailure(null);
    } catch (e) {
      setError((e as Error).message);
      setLoadFailure(e as Error);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let alive = true;
    repair("list")
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setLoadFailure(e);
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  const jobs: Row[] = data?.jobs || [],
    job = jobs.find((j) => j.id === selected),
    docs: Row[] = (data?.documents || []).filter(
      (d: Row) => d.job_id === selected,
    ),
    payments: Row[] = (data?.payments || []).filter(
      (d: Row) => d.job_id === selected,
    ),
    handedOver = (data?.handovers || []).some(
      (h: Row) => h.job_id === selected,
    ),
    invoice = docs.find((d) => d.kind === "invoice" && d.status === "issued"),
    received = payments.reduce(
      (a, p) => a + (p.kind === "refund" ? -1 : 1) * Number(p.amount_minor),
      0,
    ),
    credits = docs
      .filter((d) => d.kind === "credit" && d.parent_id === invoice?.id)
      .reduce((a, d) => a + Number(d.total_minor), 0);
  const latestBill =
    invoice &&
    ((data?.document_copies || [])
      .filter((d: Row) => d.source_document_id === invoice.id)
      .sort((a: Row, b: Row) => b.copy_revision - a.copy_revision)[0] ||
      invoice);
  const customerHistory: Row[] = [
    ...docs,
    ...(data?.document_copies || []),
    ...(data?.service_documents || []),
  ]
    .filter(
      (d: Row) =>
        d.job_id === selected &&
        (d.kind === "receiving" ||
          d.snapshot?.template_version === "final-bill-v1"),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const archiveHistory: Row[] = [
    ...docs,
    ...(data?.document_copies || []),
    ...(data?.service_documents || []),
    ...payments.filter((p: Row) => !p.purpose),
  ].filter(
    (d: Row) =>
      d.job_id === selected &&
      d.kind !== "receiving" &&
      d.snapshot?.template_version !== "final-bill-v1",
  );
  function ask(
    name: string,
    title: string,
    fields: Field[] = [reason],
    initial: Row = {},
  ) {
    setAction({
      name,
      title,
      fields,
      initial: { job_id: job?.id, version: job?.version, ...initial },
    });
  }
  const paymentFields = [
    amount("amount_minor", "Amount"),
    choice("payer", "Paid by", ["customer", "insurer", "other"]),
    choice("method", "Method", ["cash", "bank", "card"]),
    field("reference", "Reference"),
    reason,
  ];
  if (!data && loadFailure)
    return (
      <WorkshopSetup
        module="Repair Billing"
        administrator={administrator}
        language={language}
        error={loadFailure}
        onRetry={async () => {
          await refreshAccess();
          await load();
        }}
      />
    );
  if (data && !data.simple_billing)
    return (
      <WorkshopSetup
        module="Repair Billing"
        administrator={administrator}
        language={language}
        upgrade
        onRetry={load}
      />
    );
  if (data && !data.two_document_workflow)
    return (
      <div className="tenuli-module">
        <h2>{t("Repair Billing update", "අලුත්වැඩියා බිල්පත් යාවත්කාලීනය")}</h2>
        <p>
          {t(
            "Run the included ENABLE_AUTOMART.sql update to enable the two A4 customer documents and advance payments while preserving previous records.",
            "පෙර ලේඛන සුරකිමින් කොටස් අනුව බිල්පත් සක්‍රිය කිරීමට ENABLE_AUTOMART.sql ක්‍රියාත්මක කරන්න.",
          )}
        </p>
        <a href="/setup/ENABLE_AUTOMART.sql" download>
          Download SQL update
        </a>
        <button onClick={load}>{t("Check again", "නැවත පරීක්ෂා කරන්න")}</button>
      </div>
    );
  return (
    <div className="tenuli-module">
      <div className="tenuli-toolbar">
        <div>
          <span className="eyebrow">TENULI WORKSHOP</span>
          <h2>{t("Repair Billing", "අලුත්වැඩියා බිල්පත්")}</h2>
          <p className="muted">
            {t(
              "Receive a vehicle, finish repairs and collect the balance.",
              "වාහනය භාරගෙන, අලුත්වැඩියා නිමකර ඉතිරි මුදල ලබාගන්න.",
            )}
          </p>
        </div>
        <div className="actions">
          <button
            onClick={load}
            disabled={loading}
            aria-label="Refresh repairs"
          >
            <RefreshCw size={16} />
          </button>
          {can("manage_system_settings") && (
            <button
              onClick={() =>
                ask(
                  "business_save",
                  "Document business details",
                  [
                    field("name", "Business name", "text", true),
                    field("address", "Address"),
                    field("phone", "Phone"),
                    field("email", "Email"),
                    field("notes", "Footer / services"),
                    field(
                      "logo",
                      "Logo data URL (PNG/JPEG/WebP) or /tenuli-logo.svg",
                      "textarea",
                      true,
                    ),
                  ],
                  { ...data?.business?.data, version: data?.business?.version },
                )
              }
            >
              Bill settings
            </button>
          )}
          {manage && data?.service_documents_enabled && (
            <button
              className="primary"
              onClick={() => setReceivingVehicle(true)}
            >
              {t("Receive vehicle", "වාහනය භාරගන්න")}
            </button>
          )}
          {manage && (
            <button className="primary" onClick={() => setEditor({})}>
              <Plus size={16} />
              {t("New estimate", "නව ඇස්තමේන්තුව")}
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}. For a new installation, apply TENULI_REPAIRS_UPGRADE.sql
          after the rental upgrade.
        </p>
      )}
      {!data && !error && <p>Loading repair jobs…</p>}
      <div className="tenuli-stats">
        <div>
          <small>All estimates & jobs</small>
          <strong>{jobs.length}</strong>
        </div>
        <div>
          <small>In workshop</small>
          <strong>
            {jobs.filter((j) => j.status === "in_progress").length}
          </strong>
        </div>
        <div>
          <small>Awaiting customer approval</small>
          <strong>
            {jobs.filter((j) => ["draft", "sent"].includes(j.status)).length}
          </strong>
        </div>
      </div>
      <section className="panel">
        <Table
          rows={jobs}
          columns={[
            {
              label: "Estimate / job",
              render: (j) => (
                <button
                  className="tenuli-link"
                  onClick={() => setSelected(j.id)}
                >
                  {j.job_number || j.number}
                  <small>Revision {j.revision}</small>
                </button>
              ),
            },
            {
              label: "Customer / vehicle",
              render: (j) => (
                <>
                  {j.info.customer_name}
                  <small>
                    {j.info.registration} · {j.info.make_model}
                  </small>
                </>
              ),
            },
            { label: "Status", render: (j) => <Badge value={j.status} /> },
            {
              label: "Known total",
              render: (j) => {
                const c = previewRepair(j.lines);
                return (
                  <>
                    {money(c.total_minor)}
                    {c.pending > 0 && (
                      <small className="tenuli-warning">
                        {c.pending} price pending
                      </small>
                    )}
                  </>
                );
              },
            },
            { label: "Updated", render: (j) => day(j.updated_at) },
          ]}
        />
      </section>
      {job && (
        <Modal
          title={job.job_number || job.number}
          wide
          onClose={() => setSelected("")}
        >
          {savedEstimateId === job.id && (
            <p role="status" className="tenuli-note">
              {t("Estimate saved", "ඇස්තමේන්තුව සුරැකුණා")}
            </p>
          )}
          <div className="tenuli-job-head">
            <div>
              <h3>{job.info.customer_name}</h3>
              <p>
                {job.info.registration} · {job.info.make_model}
              </p>
              <p>{job.info.phone}</p>
            </div>
            <div>
              <Badge value={job.status} />
              <p>Customer: {job.customer_approval}</p>
              <p>Insurer: {job.insurer_approval}</p>
            </div>
          </div>
          <PriceReview
            job={job}
            reviews={data?.price_reviews || []}
            language={language}
            manage={
              manage && !handedOver && !invoice && job.status !== "cancelled"
            }
            enabled={!!data?.pricing_reviews}
            refresh={load}
          />
          <details className="more-details repair-internal-actions">
            <summary>
              {t(
                "Repair pricing, approvals & accounting",
                "අලුත්වැඩියා මිල, අනුමැති සහ ගිණුම්",
              )}
            </summary>
            <div className="tenuli-actions">
              {manage &&
                !handedOver &&
                job.status !== "cancelled" &&
                !invoice && (
                  <button onClick={() => setEditor(job)}>
                    Revise estimate
                  </button>
                )}
              {manage && job.status === "draft" && (
                <button onClick={() => ask("send", "Issue estimate snapshot")}>
                  Issue estimate
                </button>
              )}
              {manage && ["draft", "sent"].includes(job.status) && (
                <>
                  <button
                    className="primary"
                    onClick={() => ask("approve", "Record customer approval")}
                  >
                    Approve repair
                  </button>
                  <button onClick={() => ask("reject", "Reject estimate")}>
                    Reject
                  </button>
                </>
              )}
              {manage && job.status === "approved" && (
                <button
                  className="primary"
                  onClick={() => ask("start", "Start repair work")}
                >
                  <Wrench size={16} />
                  Start job
                </button>
              )}
              {manage && job.status === "in_progress" && (
                <button
                  className="primary"
                  onClick={() => ask("complete", "Complete repair work")}
                >
                  Complete job
                </button>
              )}
              {manage && job.status !== "cancelled" && (
                <>
                  <button
                    onClick={() =>
                      ask(
                        "insurer_decision",
                        "Record insurer decision",
                        [
                          choice("decision", "Decision", [
                            "not_requested",
                            "pending",
                            "approved",
                            "rejected",
                          ]),
                          reason,
                        ],
                        { decision: job.insurer_approval },
                      )
                    }
                  >
                    Insurer decision
                  </button>
                  {!invoice && !handedOver && (
                    <button onClick={() => ask("cancel", "Cancel job")}>
                      Cancel job
                    </button>
                  )}
                </>
              )}
              {billing && received > 0 && (
                <button
                  onClick={() =>
                    ask("refund", "Record customer refund", paymentFields, {
                      payer: "customer",
                      method: "cash",
                    })
                  }
                >
                  Refund
                </button>
              )}
              {billing && invoice && (
                <>
                  <button
                    onClick={() =>
                      ask(
                        "customer_credit",
                        "Issue customer credit",
                        [amount("amount_minor", "Credit amount"), reason],
                        { document_id: invoice.id },
                      )
                    }
                  >
                    Credit note
                  </button>
                  <button
                    onClick={() =>
                      ask("invoice_void", "Void invoice", [reason], {
                        document_id: invoice.id,
                      })
                    }
                  >
                    Void invoice
                  </button>
                </>
              )}
            </div>
          </details>
          <CustomerDocuments
            data={data!}
            job={job}
            manage={manage}
            canPay={billing}
            canViewBill={can("view_repair_billing") || billing}
            language={language}
            open={setDoc}
            reload={load}
            onFinal={() => setFinalEditor(true)}
          />
          <div className="tenuli-stats">
            {(can("view_repair_billing") || billing) && (
              <>
                <div>
                  <small>{t("Paid amount", "ගෙවූ මුදල")}</small>
                  <strong>{money(received)}</strong>
                </div>
                <div>
                  <small>{invoice ? "Balance" : "Advance held"}</small>
                  <strong>
                    {money(
                      invoice
                        ? invoice.total_minor - credits - received
                        : received,
                    )}
                  </strong>
                </div>
              </>
            )}
          </div>
          <details className="more-details">
            <summary>{t("More details", "වැඩි විස්තර")}</summary>
            <div className="tenuli-stats">
              {" "}
              <div>
                <small>Customer contribution expected</small>
                <strong>{money(job.info.expected_customer_minor)}</strong>
              </div>
              <div>
                <small>Insurer contribution expected</small>
                <strong>{money(job.info.expected_insurer_minor)}</strong>
              </div>
            </div>
          </details>
          <Table
            search={false}
            rows={job.lines}
            columns={[
              {
                label: "Work / item",
                render: (l) => (
                  <>
                    {l.description}
                    <small>
                      {l.category} · {l.notes}
                    </small>
                  </>
                ),
              },
              { label: "Qty", render: (l) => `${l.quantity} ${l.unit}` },
              {
                label: "Unit price",
                render: (l) =>
                  l.unit_minor === null
                    ? "M/R · price pending"
                    : money(l.unit_minor),
              },
              {
                label: "Included",
                render: (l) => (l.excluded ? "Excluded" : "Yes"),
              },
            ]}
          />
          <h3>{t("Customer document history", "පාරිභෝගික ලේඛන ඉතිහාසය")}</h3>
          <div className="tenuli-doc-list">
            {customerHistory.map((d) => (
              <button key={d.id} onClick={() => setDoc(d)}>
                <FileText size={16} />
                <span>
                  {d.number}
                  <small>
                    {d.kind === "receiving"
                      ? t("Receiving note & advance", "භාරගැනීම සහ අත්තිකාරම")
                      : t(
                          "Repair completion & final bill",
                          "නිමකිරීම සහ අවසන් බිල්පත",
                        )}{" "}
                    · {day(d.created_at)}
                  </small>
                </span>
                <strong>
                  {d.kind === "receiving"
                    ? `R${d.revision}`
                    : money(d.total_minor)}
                </strong>
              </button>
            ))}
            {!customerHistory.length && (
              <p>
                {t(
                  "No customer documents issued yet.",
                  "තවම පාරිභෝගික ලේඛන නිකුත් කර නැත.",
                )}
              </p>
            )}
          </div>
          <details className="more-details internal-document-history">
            <summary>
              {t(
                "Internal records & historical documents",
                "අභ්‍යන්තර වාර්තා සහ පැරණි ලේඛන",
              )}
            </summary>
            <p>
              {t(
                "Estimates, earlier receipts and completion notes remain available here. New customer copies use the two A4 documents above.",
                "ඇස්තමේන්තු, පෙර රිසිට්පත් සහ නිමකිරීමේ සටහන් මෙහි ඇත. නව පාරිභෝගික පිටපත් සඳහා ඉහත A4 ලේඛන දෙක භාවිතා කරන්න.",
              )}
            </p>
            <div className="tenuli-doc-list">
              {archiveHistory.map((d) => (
                <button key={d.id} onClick={() => setDoc(d)}>
                  <FileText size={16} />
                  <span>
                    {d.number}
                    <small>
                      {d.kind} · {d.status || d.payer || "issued"} ·{" "}
                      {day(d.created_at)}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            {payments.length > 0 && (
              <Table
                search={false}
                rows={payments}
                columns={[
                  {
                    label: t("Payment reference", "ගෙවීම් යොමුව"),
                    render: (p) => p.number,
                  },
                  {
                    label: t("Type", "වර්ගය"),
                    render: (p) => `${p.kind} · ${p.purpose || "historical"}`,
                  },
                  {
                    label: t("Amount", "මුදල"),
                    render: (p) => money(p.amount_minor),
                  },
                  { label: t("Method", "ක්‍රමය"), render: (p) => p.method },
                  {
                    label: t("Reference", "යොමුව"),
                    render: (p) => p.reference,
                  },
                  {
                    label: t("Date", "දිනය"),
                    render: (p) => day(p.created_at),
                  },
                ]}
              />
            )}
          </details>
          <h3>Job history</h3>
          <ul className="tenuli-history">
            {[
              ...(data?.events || []),
              ...(data?.service_events || []),
              ...(data?.workflow_events || []),
            ]
              .sort((a: Row, b: Row) =>
                b.created_at.localeCompare(a.created_at),
              )
              .filter((e: Row) => e.job_id === job.id)
              .map((e: Row) => (
                <li key={e.id}>
                  <b>{e.action.replaceAll("_", " ")}</b> · {e.reason}
                  <small>{new Date(e.created_at).toLocaleString()}</small>
                </li>
              ))}
          </ul>
        </Modal>
      )}
      {receivingVehicle && (
        <Modal
          title={t("Receive vehicle", "වාහනය භාරගන්න")}
          onClose={() => setReceivingVehicle(false)}
        >
          <ReceivingForm
            language={language}
            jobs={jobs}
            canPay={billing}
            onCancel={() => setReceivingVehicle(false)}
            onIssued={async (d) => {
              setReceivingVehicle(false);
              setSelected(d.job_id);
              await load();
              setDoc(d);
            }}
          />
        </Modal>
      )}
      {editor && (
        <Modal
          title={editor.id ? "Revise estimate" : "New repair estimate"}
          wide
          onClose={() => setEditor(null)}
        >
          <EstimateEditor
            job={editor}
            catalogueScope={catalogueScope}
            language={language}
            jobs={jobs}
            catalogueAccess
            manageCatalogue={administrator && can("manage_system_settings")}
            close={() => setEditor(null)}
            save={async (p) => {
              if (!data?.pricing_reviews)
                throw Error(
                  t(
                    "Install TENULI_PRICING_PHOTOS_UPGRADE.sql on the existing database, then refresh before saving estimates with this version.",
                    "මෙම version එකෙන් estimate සුරැකීමට පෙර පවතින database එකට TENULI_PRICING_PHOTOS_UPGRADE.sql යොදා refresh කරන්න.",
                  ),
                );
              const j = await repair("save", p);
              setSavedEstimateId(j.id);
              setEditor(null);
              setSelected(j.id);
              await load();
            }}
          />
        </Modal>
      )}
      {action && (
        <Modal title={action.title} onClose={() => setAction(null)}>
          <ActionForm
            businessLogo={action.name === "business_save"}
            fields={action.fields}
            initial={action.initial}
            language={language}
            onCancel={() => setAction(null)}
            onSave={async (p) => {
              const result = await repair(action.name, p);
              setAction(null);
              await load();
              if (action.name === "document_reissue") setDoc(result);
            }}
          />
        </Modal>
      )}
      {doc && (
        <Modal title={doc.number} wide onClose={() => setDoc(null)}>
          {doc.snapshot.customer_document_policy !== "two-a4-v1" &&
            data?.grouped_billing &&
            doc.kind === "estimate" &&
            doc.status === "issued" &&
            (doc.kind === "invoice" ? billing : manage) && (
              <div className="document-actions no-print">
                <button
                  onClick={() => {
                    const original = doc.source_document_id || doc.id;
                    const rev = Math.max(
                      0,
                      ...(data.document_copies || [])
                        .filter((d: Row) => d.source_document_id === original)
                        .map((d: Row) => d.copy_revision),
                    );
                    ask(
                      "document_reissue",
                      t(
                        "Issue numbered revised copy",
                        "අංකිත සංශෝධිත පිටපත නිකුත් කරන්න",
                      ),
                      [reason],
                      { document_id: original, copy_revision: rev },
                    );
                    setDoc(null);
                  }}
                >
                  {t("Issue revised copy", "සංශෝධිත පිටපතක් නිකුත් කරන්න")}
                </button>
                <small>
                  {t(
                    "Preserves issued charges. Uses the new layout and current payment amounts; the original stays in history.",
                    "නිකුත් කළ ගාස්තු නොවෙනස්ව තබා නව සැලැස්ම සහ වත්මන් ගෙවීම් සමඟ පිටපතක් නිකුත් කරයි. මුල් පිටපත ඉතිහාසයේ පවතී.",
                  )}
                </small>
              </div>
            )}
          <div
            className={doc.kind === "invoice" ? "issued-bill-view" : undefined}
          >
            {doc.kind === "invoice" && (
              <CurrentBillSummary
                doc={doc}
                language={language}
                canPay={billing}
                refreshKey={data}
                onCollect={(status) => setCollection(status)}
                onRevise={() => setFinalEditor(true)}
              />
            )}
            <div className="issued-bill-pdf">
              {doc.snapshot.customer_document_policy === "two-a4-v1" &&
              doc.snapshot.template_version !== "final-bill-v1" ? (
                <section className="internal-record-view">
                  <h3>
                    {t(
                      "Internal accounting / estimate record",
                      "අභ්‍යන්තර ගිණුම් / ඇස්තමේන්තු වාර්තාව",
                    )}
                  </h3>
                  <p>
                    {t(
                      "Customer copies use the receiving note or combined final bill. This record remains in the job history.",
                      "පාරිභෝගික පිටපත් සඳහා භාරගැනීමේ සටහන හෝ ඒකාබද්ධ අවසන් බිල්පත භාවිතා කරන්න. මෙම වාර්තාව ඉතිහාසයේ සුරැකේ.",
                    )}
                  </p>
                  <p>
                    <b>{doc.snapshot.info?.customer_name}</b> ·{" "}
                    {doc.snapshot.info?.registration}
                  </p>
                  <p>{doc.snapshot.reason}</p>
                  <Table
                    search={false}
                    rows={doc.snapshot.calculation?.lines || []}
                    columns={[
                      {
                        label: t("Item", "අයිතමය"),
                        render: (l) => l.description,
                      },
                      {
                        label: t("Quantity", "ප්‍රමාණය"),
                        render: (l) => l.quantity,
                      },
                      {
                        label: t("Amount", "මුදල"),
                        render: (l) =>
                          l.unit_minor === null
                            ? "M/R"
                            : money(
                                Number(l.net_minor || 0) +
                                  Number(l.tax_minor || 0),
                              ),
                      },
                    ]}
                  />
                  <p>
                    {t(
                      doc.snapshot.calculation?.pending
                        ? "Known total"
                        : "Total",
                      "එකතුව",
                    )}
                    : <b>{money(doc.total_minor)}</b>
                  </p>
                </section>
              ) : (
                <RepairDocument
                  key={doc.id + language}
                  doc={doc}
                  language={language}
                  paid={received + credits}
                />
              )}
            </div>
          </div>
        </Modal>
      )}
      {finalEditor && job && (
        <Modal
          title={t("Review final bill", "අවසන් බිල්පත පරීක්ෂා කරන්න")}
          onClose={() => setFinalEditor(false)}
        >
          <FinalBillForm
            job={job}
            invoice={invoice}
            latest={latestBill}
            paid={received}
            credits={credits}
            language={language}
            onCancel={() => setFinalEditor(false)}
            onIssued={async (d) => {
              setFinalEditor(false);
              await load();
              setDoc(d);
            }}
          />
        </Modal>
      )}
      {collection && job && invoice && (
        <Modal
          title={t("Collect Balance", "ඉතිරි මුදල ලබාගන්න")}
          onClose={() => setCollection(null)}
        >
          <CollectBalanceForm
            job={job}
            invoice={invoice}
            status={collection}
            language={language}
            onCancel={() => setCollection(null)}
            onPaid={async () => {
              setCollection(null);
              await load();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
export function EstimateEditor({
  catalogueScope,
  job,
  language,
  jobs = [],
  save,
  close,
  catalogueAccess = false,
  manageCatalogue = false,
}: {
  job: Row;
  language: string;
  jobs?: Row[];
  catalogueScope: string;
  save: (p: Row) => Promise<void>;
  close: () => void;
  catalogueAccess?: boolean;
  manageCatalogue?: boolean;
}) {
  const catalogue = useSharedRepairCatalogue(catalogueScope, catalogueAccess);
  const [lines, setLines] = useState<RepairLine[]>(() =>
    initialRepairLines(job),
  );
  const t = (en: string, si: string) => (language === "si" ? si : en);
  return (
    <ActionForm
      fields={[...infoFields, ...(job.id ? [reason] : [])]}
      fieldGroups={[
        {
          title: t("Customer Details", "පාරිභෝගික විස්තර"),
          keys: ["customer_name", "phone"],
        },
        {
          title: t("Vehicle Details", "වාහන විස්තර"),
          keys: ["registration", "make_model"],
        },
        {
          title: t("Repair Details", "අලුත්වැඩියා විස්තර"),
          keys: ["reported_problem", "requested_work"],
        },
      ]}
      optionalKeys={infoFields
        .filter(
          (f) =>
            ![
              "customer_name",
              "phone",
              "registration",
              "make_model",
              "reported_problem",
              "requested_work",
            ].includes(f.key),
        )
        .map((f) => f.key)}
      initial={{
        expected_customer_minor: 0,
        expected_insurer_minor: 0,
        ...job.info,
      }}
      language={language}
      onCancel={close}
      onSave={async (p) => {
        for (const n of document.querySelectorAll<HTMLInputElement>(
          ".grouped-edit-line input",
        ))
          if (!n.checkValidity() || n.getAttribute("aria-invalid") === "true")
            throw Error(
              t(
                "Check item descriptions, quantities, prices and discounts.",
                "විස්තර, ප්‍රමාණ, මිල සහ වට්ටම් පරීක්ෂා කරන්න.",
              ),
            );
        previewRepair(lines);
        const { reason, ...info } = p;
        info.expected_customer_minor ??= 0;
        info.expected_insurer_minor ??= 0;
        await save({
          job_id: job.id,
          version: job.version,
          reason,
          info,
          lines,
        });
      }}
    >
      {job.lines?.some((line: RepairLine) => line.tax_bps > 0) && (
        <p className="tenuli-note">
          {t(
            "Saving this revision uses simple pricing. Previously issued copies keep their original amounts.",
            "මෙම සංශෝධනය සරල මිල ගණනය භාවිත කරයි. පෙර නිකුත් කළ මුදල් වෙනස් නොවේ.",
          )}
        </p>
      )}
      <p className="tenuli-note">
        {t("Job / estimate / revision", "Job / estimate / සංශෝධනය")}:{" "}
        {job.job_number || job.id || t("Assigned on save", "සුරැකීමේදී ලැබේ")} ·{" "}
        {job.number || "—"} · R{job.revision || 1} ·{" "}
        {new Date(job.created_at || Date.now()).toLocaleDateString(
          language === "si" ? "si-LK" : "en-GB",
          { timeZone: "Asia/Colombo" },
        )}
      </p>
      <GroupedRepairEditor
        lines={lines}
        setLines={setLines}
        jobs={jobs}
        language={language}
        sharedCatalogue={catalogue.items}
        saveSharedItem={
          manageCatalogue && catalogue.ready ? catalogue.save : undefined
        }
      />
      {catalogueAccess && catalogue.error && (
        <p className="tenuli-note" role="status">
          {t(
            "Shared suggestions are unavailable. The built-in catalogue and custom estimate items are ready to use.",
            "පොදු යෝජනා ලබාගත නොහැක. නාමාවලිය සහ ඔබගේ අයිතම භාවිත කළ හැක.",
          )}{" "}
          {manageCatalogue &&
            t(
              "To enable shared saving, install TENULI_CATALOGUE_UPGRADE.sql from this release.",
              "පොදු සුරැකීම සඳහා මෙම අනුවාදයේ TENULI_CATALOGUE_UPGRADE.sql යොදන්න.",
            )}{" "}
          <button type="button" onClick={catalogue.retry}>
            {t("Retry shared suggestions", "පොදු යෝජනා නැවත උත්සාහ කරන්න")}
          </button>
        </p>
      )}
    </ActionForm>
  );
}
