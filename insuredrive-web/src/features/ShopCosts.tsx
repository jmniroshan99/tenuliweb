import { useEffect, useState } from "react";
import { Plus, RefreshCw, Download } from "lucide-react";
import { Modal, Table, Badge } from "../components/Controls";
import { repair, shopBillURL, uploadShopBill } from "../lib/repair-api";
import { money, day, today, exportCSV } from "../lib/format";
import type { Field, Row } from "../lib/types";
import { ActionForm, field, amount, choice, reason } from "./RepairForms";
import RepairDocument from "./RepairDocument";
import { WorkshopSetup } from "../components/WorkshopAccess";
export default function ShopCosts({
  permissions,
  language,
  administrator,
  refreshAccess,
}: {
  permissions: Set<string>;
  language: string;
  administrator: boolean;
  refreshAccess: () => Promise<void>;
}) {
  const [data, setData] = useState<Row | null>(null),
    [rows, setRows] = useState<Row[]>([]),
    [tab, setTab] = useState("purchases"),
    [billId, setBillId] = useState(""),
    [action, setAction] = useState<Row | null>(null),
    [doc, setDoc] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [loadFailure, setLoadFailure] = useState<
      (Error & { code?: string }) | null
    >(null),
    [busy, setBusy] = useState(false),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [filter, setFilter] = useState("all"),
    [applied, setApplied] = useState({ from: "", to: "" });
  const manage = permissions.has("manage_shop_costs"),
    profit = permissions.has("view_job_profit"),
    canExport = profit && permissions.has("export_repair_reports");
  async function load(dates = applied) {
    setBusy(true);
    try {
      const [shop, report] = await Promise.all([
        repair("shop_list"),
        profit ? repair("report", dates) : Promise.resolve([]),
      ]);
      setData(shop);
      setRows(report);
      setApplied(dates);
      setError("");
      setLoadFailure(null);
    } catch (e) {
      setError((e as Error).message);
      setLoadFailure(e as Error);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let alive = true;
    Promise.all([
      repair("shop_list"),
      profit ? repair("report") : Promise.resolve([]),
    ])
      .then(([shop, report]) => {
        if (alive) {
          setData(shop);
          setRows(report);
        }
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
  }, [profit]);
  const bills: Row[] = data?.bills || [],
    suppliers: Row[] = data?.suppliers || [],
    jobs: Row[] = data?.jobs || [],
    allocations: Row[] = data?.allocations || [],
    credits: Row[] = data?.credits || [],
    payments: Row[] = data?.payments || [],
    bill = bills.find((b) => b.id === billId);
  const supplier = (id: string) =>
    suppliers.find((s) => s.id === id)?.data?.name ||
    "Internal / direct expense";
  const paid = (id: string) =>
    payments
      .filter((p) => p.bill_id === id)
      .reduce(
        (a, p) => a + Number(p.amount_minor) * (p.kind === "refund" ? -1 : 1),
        0,
      );
  const credited = (id: string) =>
    credits
      .filter((c) => c.bill_id === id)
      .reduce((a, c) => a + Number(c.net_minor) + Number(c.tax_minor), 0);
  const payable = (b: Row) =>
    Number(b.actual_minor) + Number(b.tax_minor) - credited(b.id) - paid(b.id);
  const allocated = (id: string) =>
    allocations
      .filter((a) => a.bill_id === id)
      .reduce((s, a) => s + Number(a.quantity), 0);
  const filtered = rows.filter(
    (r) =>
      filter === "all" || (filter === "provisional" ? !r.complete : r.complete),
  );
  const sum = (key: string) =>
    filtered.reduce((s, r) => s + Number(r[key] || 0), 0);
  function ask(
    name: string,
    title: string,
    fields: Field[],
    initial: Row = {},
  ) {
    setAction({
      name,
      title,
      fields,
      initial: { bill_id: bill?.id, version: bill?.version, ...initial },
    });
  }
  const supplierField: Field = {
    key: "supplier_id",
    en: "External shop (blank for internal expense)",
    options: suppliers.map((s) => ({ value: s.id, label: s.data.name })),
  };
  const jobField: Field = {
    key: "job_id",
    en: "Job",
    required: true,
    options: jobs.map((j) => ({
      value: j.id,
      label: `${j.number} · ${j.vehicle} · ${j.customer}`,
    })),
  };
  const costFields = [
    supplierField,
    field("description", "Purchase / expense description", "text", true),
    choice("category", "Category", [
      "Parts",
      "Outsourced work",
      "Internal labour",
      "Transport",
      "Other direct cost",
    ]),
    {
      ...field("quantity", "Purchased quantity", "number", true),
      min: 0.001,
      step: "0.001",
    },
    field("unit", "Unit", "text", true),
    amount("estimated_minor", "Estimated cost (optional)", false),
    amount("actual_minor", "Confirmed cost (blank if pending)", false),
    field("reference", "Supplier invoice / reference"),
    field("purchase_date", "Purchase date", "date", true),
    field("due_date", "Due date", "date"),
    field("terms", "Payment terms"),
  ];
  const supplierFields = [
    field("name", "Shop name", "text", true),
    field("contact", "Contact person"),
    field("phone", "Phone"),
    field("address", "Address"),
    field("terms", "Payment terms"),
  ];
  async function output(kind: string) {
    setBusy(true);
    try {
      const approved: Row[] = await repair("report_export", applied),
        chosen = approved.filter(
          (r) =>
            filter === "all" ||
            (filter === "provisional" ? !r.complete : r.complete),
        );
      if (kind === "csv")
        exportCSV(
          "Tenuli_Job_Profit",
          chosen.map((r) => ({
            ...Object.fromEntries(
              Object.entries(r)
                .filter(([key]) => key !== "tax_minor")
                .map(([key, value]) => [
                  key.endsWith("_minor") ? key.replace("_minor", "_LKR") : key,
                  key.endsWith("_minor")
                    ? (Number(value) / 100).toFixed(2)
                    : value,
                ]),
            ),
            currency: "LKR",
            cost_status: r.complete ? "confirmed" : "provisional",
          })),
        );
      else
        setDoc({
          kind: "report",
          number: "TAC-PROFIT-" + today(),
          created_at: new Date().toISOString(),
          snapshot: {
            business: { name: "Tenuli Auto Care", logo: "/tenuli-capture-logo.png" },
            period: `Job cohort ${applied.from || "all dates"} to ${applied.to || "today"} · ${filter} · lifetime amounts as of now`,
            rows: chosen,
          },
        });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data && loadFailure)
    return (
      <WorkshopSetup
        module="Shop Costs & Profit"
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
        module="Shop Costs & Profit"
        administrator={administrator}
        language={language}
        upgrade
        onRetry={load}
      />
    );
  return (
    <div className="tenuli-module">
      <div className="tenuli-toolbar">
        <div>
          <span className="eyebrow">PRIVATE MANAGEMENT</span>
          <h2>{language === "si" ? "වියදම් සහ ලාභ" : "Shop Costs & Profit"}</h2>
          <p className="muted">
            Track external shops, allocate costs and measure job gross profit.
          </p>
        </div>
        <div className="actions">
          <button
            disabled={busy}
            onClick={() => load()}
            aria-label="Refresh costs"
          >
            <RefreshCw size={16} />
          </button>
          {manage && (
            <>
              <button
                onClick={() =>
                  ask("supplier_save", "Add supplier", supplierFields)
                }
              >
                Add supplier
              </button>
              <button
                className="primary"
                onClick={() =>
                  ask("bill_save", "Add purchase / direct cost", costFields, {
                    quantity: 1,
                    unit: "item",
                    category: "Parts",
                    estimated_minor: null,
                    purchase_date: today(),
                  })
                }
              >
                <Plus size={16} />
                Add cost
              </button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p>Loading shop costs…</p>}
      <div className="tenuli-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "purchases"}
          onClick={() => setTab("purchases")}
        >
          Purchases & allocations
        </button>
        <button
          role="tab"
          aria-selected={tab === "suppliers"}
          onClick={() => setTab("suppliers")}
        >
          Suppliers
        </button>
        {profit && (
          <button
            role="tab"
            aria-selected={tab === "profit"}
            onClick={() => setTab("profit")}
          >
            Job profit report
          </button>
        )}
      </div>
      {tab === "purchases" && (
        <>
          <div className="tenuli-stats">
            <div>
              <small>Confirmed supplier / expense balance</small>
              <strong>
                {money(
                  bills
                    .filter((b) => b.actual_minor !== null)
                    .reduce((s, b) => s + payable(b), 0),
                )}
              </strong>
            </div>
            <div>
              <small>Costs awaiting confirmation</small>
              <strong>
                {bills.filter((b) => b.actual_minor === null).length}
              </strong>
            </div>
            <div>
              <small>Net cash paid</small>
              <strong>
                {money(bills.reduce((s, b) => s + paid(b.id), 0))}
              </strong>
            </div>
          </div>
          <section className="panel">
            <Table
              rows={bills.map((b) => ({
                ...b,
                supplier_name: supplier(b.supplier_id),
              }))}
              columns={[
                {
                  label: "Purchase / shop",
                  render: (b) => (
                    <button
                      className="tenuli-link"
                      onClick={() => setBillId(b.id)}
                    >
                      {b.description}
                      <small>
                        {b.supplier_name} · {b.reference}
                      </small>
                    </button>
                  ),
                },
                {
                  label: "Allocated / purchased",
                  render: (b) => `${allocated(b.id)} / ${b.quantity} ${b.unit}`,
                },
                {
                  label: "Shop bill total",
                  render: (b) =>
                    b.actual_minor === null ? (
                      <>
                        <Badge value="pending" />
                        <small>Estimated {money(b.estimated_minor)}</small>
                      </>
                    ) : (
                      money(Number(b.actual_minor) + Number(b.tax_minor))
                    ),
                },
                {
                  label: "Balance to pay",
                  render: (b) =>
                    b.actual_minor === null ? "Pending" : money(payable(b)),
                },
                {
                  label: "Due / purchase",
                  render: (b) => (
                    <>
                      {day(b.due_date || b.purchase_date)}
                      <small>{b.category}</small>
                    </>
                  ),
                },
              ]}
            />
          </section>
        </>
      )}
      {tab === "suppliers" && (
        <section className="panel">
          <Table
            rows={suppliers.map((s) => ({ ...s, ...s.data }))}
            columns={[
              {
                label: "External shop",
                render: (s) => (
                  <>
                    <b>{s.name}</b>
                    <small>
                      {s.contact} · {s.phone}
                    </small>
                  </>
                ),
              },
              {
                label: "Address / terms",
                render: (s) => (
                  <>
                    {s.address}
                    <small>{s.terms}</small>
                  </>
                ),
              },
              {
                label: "Confirmed balance",
                render: (s) =>
                  money(
                    bills
                      .filter(
                        (b) =>
                          b.supplier_id === s.id && b.actual_minor !== null,
                      )
                      .reduce((v, b) => v + payable(b), 0),
                  ),
              },
              {
                label: "Actions",
                render: (s) =>
                  manage ? (
                    <button
                      onClick={() =>
                        ask("supplier_save", "Edit supplier", supplierFields, {
                          ...s.data,
                          id: s.id,
                          version: s.version,
                        })
                      }
                    >
                      Edit
                    </button>
                  ) : (
                    "View only"
                  ),
              },
            ]}
          />
        </section>
      )}
      {tab === "profit" && profit && (
        <>
          <form
            className="tenuli-filters"
            onSubmit={(e) => {
              e.preventDefault();
              if (from && to && from > to) {
                setError("Start date must be before end date");
                return;
              }
              void load({ from, to });
            }}
          >
            <label>
              From
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <label>
              Cost status
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All jobs</option>
                <option value="provisional">Provisional</option>
                <option value="confirmed">Costs confirmed</option>
              </select>
            </label>
            <button disabled={busy}>Apply dates</button>
            {canExport && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => output("csv")}
                >
                  <Download size={16} />
                  CSV
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => output("pdf")}
                >
                  PDF report
                </button>
              </>
            )}
          </form>
          <p className="muted">
            Date filters select jobs by invoice date, or creation date when
            uninvoiced. Figures are lifetime balances for that cohort. Search
            below finds a job, customer or vehicle.
          </p>
          <div className="tenuli-stats">
            <div>
              <small>Sales revenue</small>
              <strong>{money(sum("revenue_minor"))}</strong>
            </div>
            <div>
              <small>Recorded job costs</small>
              <strong>{money(sum("direct_cost_minor"))}</strong>
            </div>
            <div>
              <small>
                Job profit ·{" "}
                {filtered.some((r) => !r.complete)
                  ? "PROVISIONAL"
                  : "costs confirmed"}
              </small>
              <strong>{money(sum("profit_minor"))}</strong>
            </div>
            <div>
              <small>Customer balance</small>
              <strong>{money(sum("receivable_minor"))}</strong>
            </div>
          </div>
          <p className="tenuli-note">
            {language === "si"
              ? "ලාභය = විකුණුම් ආදායම − සටහන් කළ වැඩ වියදම්. තහවුරු නොකළ වියදම් ඇත්නම් මෙය තාවකාලික ලාභයකි. සාමාන්‍ය ව්‍යාපාර වියදම් ඇතුළත් නොවේ."
              : "Profit = sales revenue − recorded job costs. Pending costs are not included yet, so profit stays provisional. General business overheads are not included."}
          </p>
          <section className="panel">
            <Table
              rows={filtered}
              columns={[
                {
                  label: "Job / customer",
                  render: (r) => (
                    <>
                      <b>{r.number}</b>
                      <small>
                        {r.customer} · {r.vehicle}
                      </small>
                      <Badge value={r.status} />
                    </>
                  ),
                },
                {
                  label: "Sales / job costs",
                  render: (r) => (
                    <>
                      {money(r.revenue_minor)}
                      <small>Cost {money(r.direct_cost_minor)}</small>
                    </>
                  ),
                },
                {
                  label: "Profit",
                  render: (r) => (
                    <>
                      <b>{money(r.profit_minor)}</b>
                      <small>
                        {r.complete ? "Costs confirmed" : "PROVISIONAL"}
                      </small>
                    </>
                  ),
                },
                { label: "Balance", render: (r) => money(r.receivable_minor) },
                { label: "More details", render: (r) => <details className="profit-details"><summary>{language === "si" ? "වැඩි විස්තර" : "More details"}</summary><p>Margin {r.margin === null ? "N/A" : `${r.margin}%`}</p><p>Markup {r.markup === null ? "N/A" : `${r.markup}%`}</p><p>Estimated profit {money(r.estimated_profit_minor)}</p><small>{r.price_pending ? `Known items only · ${r.price_pending} price pending` : "Estimated sales − estimated costs"}</small><p>Net cash {money(r.cash_movement_minor)}</p></details> },
                {
                  label: "Costs verified",
                  render: (r) =>
                    manage ? (
                      <button
                        disabled={r.complete}
                        onClick={() =>
                          ask(
                            "costs_complete",
                            "Confirm all direct costs are recorded",
                            [reason],
                            { job_id: r.id },
                          )
                        }
                      >
                        {r.complete ? "Verified" : "Mark complete"}
                      </button>
                    ) : r.complete ? (
                      "Yes"
                    ) : (
                      "No"
                    ),
                },
              ]}
            />
          </section>
          <p className="muted">
            Net cash = customer receipts less refunds − supplier cash allocated
            by purchased quantity. It is separate from gross profit. Zero-cost
            jobs require an explicit cost-complete confirmation.
          </p>
        </>
      )}
      {bill && (
        <Modal title={bill.description} wide onClose={() => setBillId("")}>
          <div className="tenuli-job-head">
            <div>
              <h3>{supplier(bill.supplier_id)}</h3>
              <p>
                {bill.reference || "No supplier reference"} · {bill.category}
              </p>
              <p>
                {day(bill.purchase_date)} · Due {day(bill.due_date)}
              </p>
              <p>{bill.terms}</p>
            </div>
            <div>
              <p>
                Purchased: {bill.quantity} {bill.unit}
              </p>
              <p>Unallocated: {Number(bill.quantity) - allocated(bill.id)}</p>
              <p>
                Confirmed cost:{" "}
                {bill.actual_minor === null
                  ? "Pending"
                  : money(bill.actual_minor)}
              </p>
              <strong>
                Balance:{" "}
                {bill.actual_minor === null ? "Pending" : money(payable(bill))}
              </strong>
            </div>
          </div>
          <div className="tenuli-actions">
            {manage && (
              <>
                {bill.actual_minor === null && (
                  <button
                    className="primary"
                    onClick={() =>
                      ask(
                        "bill_confirm",
                        "Confirm actual supplier cost",
                        [amount("amount_minor", "Confirmed cost"), reason],
                        {},
                      )
                    }
                  >
                    Confirm actual cost
                  </button>
                )}
                <button
                  onClick={() =>
                    ask(
                      "allocation",
                      "Allocate purchased quantity",
                      [
                        jobField,
                        {
                          ...field(
                            "quantity",
                            "Quantity to this job",
                            "number",
                            true,
                          ),
                          min: 0.001,
                          step: "0.001",
                        },
                        field("line_id", "Repair line ID (optional)"),
                      ],
                      {
                        quantity: Math.max(
                          0,
                          Number(bill.quantity) - allocated(bill.id),
                        ),
                      },
                    )
                  }
                >
                  Allocate to job
                </button>
                {bill.actual_minor !== null && (
                  <>
                    <button
                      onClick={() =>
                        ask(
                          "supplier_payment",
                          "Record supplier payment",
                          [
                            amount("amount_minor", "Paid amount"),
                            choice("method", "Method", [
                              "cash",
                              "bank",
                              "card",
                            ]),
                            field("reference", "Reference"),
                            reason,
                          ],
                          { method: "bank" },
                        )
                      }
                    >
                      Pay supplier
                    </button>
                    <button
                      onClick={() =>
                        ask(
                          "supplier_refund",
                          "Receive supplier refund",
                          [
                            amount("amount_minor", "Refund amount"),
                            choice("method", "Method", [
                              "cash",
                              "bank",
                              "card",
                            ]),
                            field("reference", "Reference"),
                            reason,
                          ],
                          { method: "bank" },
                        )
                      }
                    >
                      Supplier refund
                    </button>
                    <button
                      onClick={() =>
                        ask(
                          "cost_credit",
                          "Record return / supplier credit",
                          [
                            {
                              ...jobField,
                              required: false,
                              en: "Allocated job (blank for unused stock)",
                            },
                            amount("amount_minor", "Credit amount"),
                            {
                              ...field(
                                "quantity",
                                "Returned quantity (0 for price discount)",
                                "number",
                                true,
                              ),
                              min: 0,
                              step: "0.001",
                            },
                            reason,
                          ],
                          { quantity: 0 },
                        )
                      }
                    >
                      Return / credit
                    </button>
                  </>
                )}
                <label className="tenuli-upload">
                  Attach shop bill
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      try {
                        await uploadShopBill(bill.id, f);
                        await load();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
              </>
            )}
            {bill.attachment_path && (
              <button
                onClick={async () => {
                  try {
                    const url = await shopBillURL(bill.attachment_path);
                    window.open(url, "_blank", "noopener,noreferrer");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                View private attachment
              </button>
            )}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p className="muted">
            Unused stock is not a job expense. Allocate each bill to each job
            once; a bill can be split across several jobs. Returns stay linked
            to the original allocation.
          </p>
          <h3>Job allocations</h3>
          <Table
            search={false}
            rows={allocations.filter((a) => a.bill_id === bill.id)}
            columns={[
              {
                label: "Job",
                render: (a) =>
                  jobs.find((j) => j.id === a.job_id)?.number || a.job_id,
              },
              { label: "Quantity", render: (a) => a.quantity },
              { label: "Estimated", render: (a) => money(a.estimated_minor) },
              {
                label: "Confirmed",
                render: (a) =>
                  a.actual_minor === null ? "Pending" : money(a.actual_minor),
              },
              {
                label: "Repair line ID",
                render: (a) => a.line_id || "Whole job",
              },
            ]}
          />
          <h3>Supplier payments & refunds</h3>
          <Table
            search={false}
            rows={payments.filter((p) => p.bill_id === bill.id)}
            columns={[
              { label: "Date", render: (p) => day(p.created_at) },
              { label: "Type", render: (p) => p.kind },
              { label: "Amount", render: (p) => money(p.amount_minor) },
              {
                label: "Reference / reason",
                render: (p) => (
                  <>
                    {p.reference}
                    <small>{p.reason}</small>
                  </>
                ),
              },
            ]}
          />
          <h3>Returns & credits</h3>
          <Table
            search={false}
            rows={credits.filter((c) => c.bill_id === bill.id)}
            columns={[
              {
                label: "Job",
                render: (c) =>
                  jobs.find((j) => j.id === c.job_id)?.number ||
                  "Unallocated stock",
              },
              {
                label: "Credit amount",
                render: (c) => money(Number(c.net_minor) + Number(c.tax_minor)),
              },
              { label: "Returned quantity", render: (c) => c.quantity },
              { label: "Reason", render: (c) => c.reason },
            ]}
          />
        </Modal>
      )}
      {action && (
        <Modal title={action.title} onClose={() => setAction(null)}>
          <ActionForm
            fields={action.fields}
            optionalKeys={
              action.name === "bill_save"
                ? ["category", "unit", "reference", "due_date", "terms"]
                : action.name === "supplier_save"
                  ? ["contact", "address", "terms"]
                  : ["reference"]
            }
            initial={action.initial}
            language={language}
            onCancel={() => setAction(null)}
            onSave={async (p) => {
              if (action.name === "bill_save") {
                p.estimated_minor ??= p.actual_minor ?? 0;
                p.tax_minor = 0;
              }
              await repair(action.name, p);
              setAction(null);
              await load();
            }}
          />
        </Modal>
      )}
      {doc && (
        <Modal
          title="Internal job profit report"
          wide
          onClose={() => setDoc(null)}
        >
          <RepairDocument doc={doc} language={language} />
        </Modal>
      )}
    </div>
  );
}
