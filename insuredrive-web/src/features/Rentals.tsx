import { useState } from "react";
import { Plus, ArrowRight, FileText, CheckCircle2, Wallet } from "lucide-react";
import type { Row, RentalData, LegacyData, Field } from "../lib/types";
import { Table, Form, Modal, Badge, Empty } from "../components/Controls";
import { Invoice } from "./Invoice";
import { rental } from "../lib/api";
import {
  money,
  date,
  localInput,
  colomboISO,
  decimalMinor,
  today,
  paymentState,
  paidFor,
  balanceFor,
  depositFor,
  exportCSV,
} from "../lib/format";
type Props = {
  page: string;
  data: RentalData;
  legacy: LegacyData;
  permissions: Set<string>;
  language: string;
  refresh: () => Promise<void>;
};
type Editor = {
  title: string;
  fields: Field[];
  initial?: Row;
  save: (v: Row) => Promise<void>;
  hint?: string;
};
const amount = (key: string, en: string, si?: string): Field => ({
  key,
  en,
  si,
  type: "number",
  min: 0,
  step: "0.01",
  required: true,
});
const customerFields: Field[] = [
  { key: "name", en: "Customer name", si: "පාරිභෝගික නම", required: true },
  { key: "phone", en: "Phone", si: "දුරකථනය", required: true },
  { key: "email", en: "Email", type: "email" },
  { key: "address", en: "Address", si: "ලිපිනය" },
  {
    key: "identity_reference",
    en: "NIC / Passport reference",
    si: "හැඳුනුම්පත් අංකය",
  },
  {
    key: "licence_reference",
    en: "Driving licence reference",
    si: "රියදුරු බලපත්‍ර අංකය",
  },
];
export default function Rentals({
  page,
  data,
  legacy,
  permissions,
  language,
  refresh,
}: Props) {
  const [editor, setEditor] = useState<Editor | null>(null),
    [doc, setDoc] = useState<{ invoice: Row; receipt?: Row } | null>(null),
    [quote, setQuote] = useState<{ b: Row; q: Row } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const si = language === "si",
    t = (en: string, s: string) => (si ? s : en),
    can = (p: string) => permissions.has(p),
    canManage = can("manage_rentals"),
    canBill = can("manage_billing"),
    canRefund = can("refund_payments");
  const vehicle = (b: Row) =>
      legacy.vehicles.find((v) => v.id === b.vehicle_id)?.registration_number ||
      b.vehicle_id?.slice(0, 8),
    customer = (b: Row) =>
      data.customers.find((c) => c.id === b.customer_id)?.name || "—";
  const run = async (a: string, p: Row) => {
    await rental(a, p);
    await refresh();
    setEditor(null);
  };
  function editCustomer(c: Row = {}) {
    setEditor({
      title: t("Rental customer", "කුලී පාරිභෝගිකයා"),
      fields: customerFields,
      initial: c,
      save: (v) =>
        run("customer_save", {
          ...v,
          ...(c.id ? { id: c.id, version: c.version } : {}),
        }),
    });
  }
  function editBooking(b: Row = {}) {
    const initial: Row = {
      rate_plan: "daily",
      rate: "8000",
      included_km: "100",
      excess_rate: "100",
      grace_minutes: "0",
      discount: "0",

      pickup_at: localInput(new Date().toISOString()),
      return_at: localInput(new Date(Date.now() + 86400000).toISOString()),
      ...b,
    };
    if (b.id) {
      Object.assign(initial, {
        pickup_at: localInput(b.pickup_at),
        return_at: localInput(b.return_at),
        rate: String(b.rate_minor / 100),
        excess_rate: String(b.excess_rate_minor / 100),
        discount: String(b.discount_minor / 100),
      });
      for (const x of b.extras || [])
        initial[x.label.toLowerCase()] = String(x.amount_minor / 100);
    }
    setEditor({
      title: t(
        b.id ? "Edit draft rental" : "New rental booking",
        b.id ? "කුලී කෙටුම්පත වෙනස් කරන්න" : "නව කුලී වෙන්කිරීම",
      ),
      hint: t(
        "Dates use Sri Lanka time. Daily = each started 24 hours; monthly = fixed 30 days. Saving uses simple pricing; issued copies remain unchanged.",
        "දිනය සහ වේලාව ශ්‍රී ලංකා වේලාවෙන්. දිනක් = පැය 24. මාසයක් = දින 30.",
      ),
      initial,
      fields: [
        {
          key: "customer_id",
          en: "Rental customer",
          si: "පාරිභෝගිකයා",
          required: true,
          options: data.customers.map((c) => ({ value: c.id, label: c.name })),
        },
        {
          key: "vehicle_id",
          en: "Vehicle",
          si: "වාහනය",
          required: true,
          options: legacy.vehicles
            .filter((v) => v.is_active !== false)
            .map((v) => ({
              value: v.id,
              label: v.registration_number + " · " + v.make + " " + v.model,
            })),
        },
        {
          key: "pickup_at",
          en: "Pickup (Asia/Colombo)",
          si: "ලබාදෙන දිනය / වේලාව",
          type: "datetime-local",
          required: true,
        },
        {
          key: "return_at",
          en: "Scheduled return (Asia/Colombo)",
          si: "ආපසු දෙන දිනය / වේලාව",
          type: "datetime-local",
          required: true,
        },
        {
          key: "rate_plan",
          en: "Rate plan",
          si: "ගාස්තු ක්‍රමය",
          required: true,
          options: ["daily", "hourly", "monthly"].map((value) => ({
            value,
            label: value,
          })),
        },
        amount("rate", "Rate per period (LKR)", "කාල ඒකකයක ගාස්තුව"),
        {
          key: "included_km",
          en: "Included km per period",
          type: "number",
          min: 0,
          required: true,
        },
        amount("excess_rate", "Excess kilometre rate (LKR)"),
        {
          key: "grace_minutes",
          en: "Overtime grace (minutes)",
          type: "number",
          min: 0,
          step: "1",
        },
        { key: "agreement_ref", en: "Agreement reference" },
        ...["Driver", "Delivery", "Fuel", "Damage", "Late return"].map(
          (en) => ({
            ...amount(en.toLowerCase(), en + " charge (LKR)"),
            required: false,
          }),
        ),
        amount("discount", "Discount (LKR)"),
        {
          key: "notes",
          en: "Notes",
          si: "සටහන්",
          type: "textarea",
          wide: true,
        },
      ],
      save: async (v) => {
        const extras = ["Driver", "Delivery", "Fuel", "Damage", "Late return"]
          .filter((k) => v[k.toLowerCase()] && Number(v[k.toLowerCase()]) > 0)
          .map((label) => ({
            label,
            amount_minor: decimalMinor(String(v[label.toLowerCase()])),
          }));
        await run("booking_save", {
          ...v,
          ...(b.id ? { id: b.id, version: b.version } : {}),
          pickup_at: colomboISO(v.pickup_at),
          return_at: colomboISO(v.return_at),
          rate_minor: decimalMinor(String(v.rate)),
          included_km: Number(v.included_km),
          excess_rate_minor: decimalMinor(String(v.excess_rate)),
          grace_minutes: Number(v.grace_minutes || 0),
          discount_minor: decimalMinor(String(v.discount || 0)),
          tax_bps: 0,
          extras,
        });
      },
    });
  }
  function lifecycle(b: Row, a: string) {
    const fields: Field[] =
      a === "checkout"
        ? [
            {
              key: "odometer_out",
              en: "Checkout odometer (km)",
              si: "පිටත්වීමේ දුරමානය",
              type: "number",
              required: true,
              min: 0,
            },
          ]
        : a === "return"
          ? [
              {
                key: "odometer_in",
                en: "Return odometer (km)",
                si: "ආපසු පැමිණීමේ දුරමානය",
                type: "number",
                required: true,
                min: Number(b.odometer_out),
              },
              {
                key: "actual_return_at",
                en: "Actual return (Asia/Colombo)",
                type: "datetime-local",
                required: true,
              },
            ]
          : a === "extend"
            ? [
                {
                  key: "return_at",
                  en: "New return (Asia/Colombo)",
                  type: "datetime-local",
                  required: true,
                },
              ]
            : a === "cancel"
              ? [
                  {
                    key: "reason",
                    en: "Cancellation reason",
                    si: "අවලංගු කිරීමේ හේතුව",
                    required: true,
                  },
                ]
              : [];
    setEditor({
      title: a.toUpperCase() + " · " + vehicle(b),
      fields,
      initial: {
        actual_return_at: localInput(new Date().toISOString()),
        return_at: localInput(b.return_at),
      },
      hint:
        a === "confirm"
          ? "The server checks vehicle availability before confirming."
          : a === "cancel"
            ? "Existing advances and deposits must be refunded separately."
            : undefined,
      save: (v) =>
        run(a, {
          id: b.id,
          version: b.version,
          ...v,
          ...(a === "return"
            ? { actual_return_at: colomboISO(v.actual_return_at) }
            : {}),
          ...(a === "extend" ? { return_at: colomboISO(v.return_at) } : {}),
        }),
    });
  }
  function payment(b: Row, kind = "payment") {
    setEditor({
      title:
        t("Record money movement", "ගෙවීම සටහන් කරන්න") + " · " + vehicle(b),
      fields: [
        {
          key: "kind",
          en: "Transaction",
          si: "ගනුදෙනුව",
          required: true,
          options: [
            ...(canBill ? ["payment", "deposit", "deposit_apply"] : []),
            ...(canRefund ? ["refund", "deposit_refund"] : []),
          ].map((value) => ({
            value,
            label: (
              {
                payment: "Rental payment / advance",
                deposit: "Receive refundable deposit",
                deposit_apply: "Apply deposit to invoice",
                refund: "Refund rental payment",
                deposit_refund: "Refund security deposit",
              } as Row
            )[value],
          })),
        },
        amount("amount", "Amount (LKR)", "මුදල (රු.)"),
        {
          key: "method",
          en: "Payment method",
          required: true,
          options: [
            { value: "cash", label: "Cash" },
            { value: "bank", label: "Bank transfer" },
            { value: "card", label: "Externally processed card" },
          ],
        },
        { key: "reference", en: "Payment reference" },
        {
          key: "reason",
          en: "Reason / approval",
          hint: "Required for refunds and deposit application.",
        },
      ],
      initial: { kind, method: "cash" },
      hint:
        "Refundable deposit balance: " +
        money(depositFor(b.id, data)) +
        ". No online card charging is performed.",
      save: (v) =>
        run(v.kind, {
          id: b.id,
          amount_minor: decimalMinor(String(v.amount)),
          method: v.method,
          reference: v.reference || "",
          reason: v.reason || "",
        }),
    });
  }
  function adjust(b: Row) {
    setEditor({
      title: "Adjust final charges",
      fields: [
        { key: "label", en: "Additional charge label" },
        { ...amount("amount", "Additional charge (LKR)"), required: false },
        amount("discount", "Total discount (LKR)"),
        { key: "reason", en: "Adjustment reason", required: true },
      ],
      initial: {
        discount: String(b.discount_minor / 100),

        amount: "0",
      },
      save: (v) =>
        run("charges_update", {
          id: b.id,
          version: b.version,
          extras: [
            ...b.extras,
            ...(Number(v.amount) > 0
              ? [
                  {
                    label: v.label || "Additional charge",
                    amount_minor: decimalMinor(String(v.amount)),
                  },
                ]
              : []),
          ],
          discount_minor: decimalMinor(String(v.discount)),
          tax_bps: 0,
          reason: v.reason,
        }),
    });
  }
  async function preview(b: Row) {
    setBusy(true);
    setError("");
    try {
      setQuote({ b, q: await rental("quote", { id: b.id }) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const bookingColumns = [
    {
      label: t("Vehicle / agreement", "වාහනය / ගිවිසුම"),
      render: (b: Row) => (
        <>
          <strong>{vehicle(b)}</strong>
          <small>{b.agreement_ref || b.id.slice(0, 8)}</small>
        </>
      ),
    },
    ...(!data.owner_only
      ? [
          {
            label: t("Customer", "පාරිභෝගිකයා"),
            render: (b: Row) => customer(b),
          },
        ]
      : []),
    {
      label: t("Rental period", "කුලී කාලය"),
      render: (b: Row) => (
        <>
          <span>{date(b.pickup_at)}</span>
          <small>→ {date(b.return_at)}</small>
        </>
      ),
    },
    {
      label: t("Status", "තත්ත්වය"),
      render: (b: Row) => (
        <>
          <Badge value={b.status} />
          {b.status === "active" && new Date(b.return_at) < new Date() && (
            <small className="danger">Overdue return</small>
          )}
        </>
      ),
    },
    {
      label: t("Actions", "ක්‍රියා"),
      render: (b: Row) => (
        <div className="row-actions">
          {canManage && b.status === "draft" && (
            <>
              <button onClick={() => editBooking(b)}>Edit</button>
              <button onClick={() => lifecycle(b, "confirm")}>Confirm</button>
            </>
          )}
          {canManage && b.status === "confirmed" && (
            <button onClick={() => lifecycle(b, "checkout")}>
              Check out <ArrowRight size={14} />
            </button>
          )}
          {canManage && b.status === "active" && (
            <button onClick={() => lifecycle(b, "return")}>
              Return <CheckCircle2 size={14} />
            </button>
          )}
          {canManage && ["confirmed", "active"].includes(b.status) && (
            <button onClick={() => lifecycle(b, "extend")}>Extend</button>
          )}
          {canManage && ["draft", "confirmed"].includes(b.status) && (
            <button onClick={() => lifecycle(b, "cancel")}>Cancel</button>
          )}
          {canBill &&
            b.status === "completed" &&
            !data.invoices.some(
              (i) => i.booking_id === b.id && i.status === "issued",
            ) && <button onClick={() => adjust(b)}>Adjust charges</button>}
          {!data.owner_only && (
            <button disabled={busy} onClick={() => preview(b)}>
              <FileText size={14} />
              Quote
            </button>
          )}
          {(canBill || canRefund) && (
            <button onClick={() => payment(b)}>
              <Wallet size={14} />
              Payment
            </button>
          )}
        </div>
      ),
    },
  ];
  const invRows: Row[] = data.invoices.map((i) => ({
    ...i,
    payment_status: paymentState(i, data),
    balance: balanceFor(i, data),
  }));
  return (
    <>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {page === "customers" && (
        <section className="card">
          <div className="section-head">
            <div>
              <h2>{t("Rental customers", "කුලී පාරිභෝගිකයන්")}</h2>
              <p>
                {t(
                  "Renters are separate from registered vehicle owners.",
                  "වාහන හිමිකරුවන්ගෙන් වෙනස් පාරිභෝගික වාර්තා.",
                )}
              </p>
            </div>
            {canManage && (
              <button className="primary" onClick={() => editCustomer()}>
                <Plus size={16} />
                {t("Add customer", "පාරිභෝගිකයෙක් එක් කරන්න")}
              </button>
            )}
          </div>
          <Table
            rows={data.customers}
            columns={[
              { label: "Name / නම", render: (c) => <strong>{c.name}</strong> },
              { label: "Phone", render: (c) => c.phone },
              { label: "Address", render: (c) => c.address },
              {
                label: "Actions",
                render: (c) =>
                  canManage && (
                    <button onClick={() => editCustomer(c)}>Edit</button>
                  ),
              },
            ]}
          />
        </section>
      )}
      {page === "rentals" && (
        <section className="card">
          <div className="section-head">
            <div>
              <h2>{t("Rental bookings", "කුලී වෙන්කිරීම්")}</h2>
              <p>
                {t(
                  "Book, check out, return and bill from one place.",
                  "වෙන්කිරීමේ සිට බිල්පත දක්වා.",
                )}
              </p>
            </div>
            {canManage && (
              <button
                className="primary"
                onClick={() => editBooking()}
                disabled={!data.customers.length}
              >
                <Plus size={16} />
                {t("New booking", "නව වෙන්කිරීම")}
              </button>
            )}
          </div>
          {canManage && !data.customers.length && (
            <p className="notice">Create a rental customer first.</p>
          )}
          <Table rows={data.bookings} columns={bookingColumns} />
        </section>
      )}
      {page === "invoices" && (
        <section className="card">
          <div className="section-head">
            <div>
              <h2>{t("Rental invoices", "කුලී බිල්පත්")}</h2>
              <p>
                {t(
                  "Issued charges are preserved. Payments and deposits have separate ledgers.",
                  "නිකුත් කළ බිල්පත් සුරක්ෂිතව තබා ඇත.",
                )}
              </p>
            </div>
            <button
              onClick={() =>
                exportCSV(
                  "rental-invoices",
                  invRows.map((i) => ({
                    number: i.number,
                    status: i.status,
                    payment_status: i.payment_status,
                    total_LKR: i.total_minor / 100,
                    balance_LKR: i.balance / 100,
                    due_date: i.due_date,
                  })),
                )
              }
            >
              Export CSV
            </button>
          </div>
          <Table
            rows={invRows}
            columns={[
              {
                label: "Invoice",
                render: (i) => (
                  <>
                    <strong>{i.number}</strong>
                    <small>{i.snapshot.customer.name}</small>
                  </>
                ),
              },
              {
                label: "Vehicle",
                render: (i) => i.snapshot.vehicle.registration_number,
              },
              { label: "Total", render: (i) => money(i.total_minor) },
              {
                label: "Balance",
                render: (i) => <strong>{money(i.balance)}</strong>,
              },
              {
                label: "Status",
                render: (i) => (
                  <>
                    <Badge value={i.payment_status} />
                    {i.status === "issued" &&
                      i.balance > 0 &&
                      i.due_date < today() && (
                        <small className="danger">Overdue</small>
                      )}
                  </>
                ),
              },
              {
                label: "Actions",
                render: (i) => (
                  <div className="row-actions">
                    <button onClick={() => setDoc({ invoice: i })}>
                      View / PDF
                    </button>
                    {(canBill || canRefund) && (
                      <button
                        onClick={() =>
                          payment(
                            data.bookings.find((b) => b.id === i.booking_id)!,
                          )
                        }
                      >
                        Payment
                      </button>
                    )}
                    {canRefund && i.status === "issued" && (
                      <button
                        onClick={() =>
                          setEditor({
                            title: "Void invoice " + i.number,
                            fields: [
                              { key: "reason", en: "Reason", required: true },
                            ],
                            save: (v) =>
                              run("invoice_void", {
                                invoice_id: i.id,
                                reason: v.reason,
                              }),
                          })
                        }
                      >
                        Void
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </section>
      )}
      {page === "payments" && (
        <section className="card">
          <div className="section-head">
            <div>
              <h2>{t("Payments & deposits", "ගෙවීම් සහ තැන්පතු")}</h2>
              <p>
                {t(
                  "Every money movement is recorded with its own receipt.",
                  "සෑම ගනුදෙනුවක්ම රිසිට් අංකයක් සමඟ සටහන් වේ.",
                )}
              </p>
            </div>
            {(canBill || canRefund) && (
              <button
                className="primary"
                onClick={() =>
                  setEditor({
                    title: "Select booking",
                    fields: [
                      {
                        key: "id",
                        en: "Booking",
                        required: true,
                        options: data.bookings.map((b) => ({
                          value: b.id,
                          label:
                            vehicle(b) +
                            " · " +
                            customer(b) +
                            " · " +
                            b.agreement_ref,
                        })),
                      },
                    ],
                    save: async (v) =>
                      payment(data.bookings.find((b) => b.id === v.id)!),
                  })
                }
              >
                <Plus size={16} />
                Record payment
              </button>
            )}
          </div>
          <Table
            rows={data.ledger}
            columns={[
              {
                label: "Receipt",
                render: (l) => (
                  <>
                    <strong>{l.receipt_number}</strong>
                    <small>{date(l.created_at)}</small>
                  </>
                ),
              },
              { label: "Transaction", render: (l) => <Badge value={l.kind} /> },
              { label: "Amount", render: (l) => money(l.amount_minor) },
              { label: "Method", render: (l) => l.method },
              {
                label: "Reference",
                render: (l) => (
                  <>
                    {l.reference}
                    <small>{l.reason}</small>
                  </>
                ),
              },
              {
                label: "Receipt",
                render: (l) => {
                  const b = data.bookings.find((b) => b.id === l.booking_id);
                  const i =
                    data.invoices.find(
                      (i) =>
                        i.booking_id === l.booking_id && i.status === "issued",
                    ) ||
                    (b
                      ? {
                          number:
                            b.agreement_ref || "Advance / deposit receipt",
                          snapshot: {
                            business: data.business || {
                              name: "Tenuli Auto Care",
                            },
                            customer: data.customers.find(
                              (c) => c.id === b.customer_id,
                            ) || { name: "Rental customer" },
                            vehicle: legacy.vehicles.find(
                              (v) => v.id === b.vehicle_id,
                            ) || { registration_number: "" },
                            booking: b,
                            calculation: { lines: [] },
                          },
                        }
                      : null);
                  return i ? (
                    <button onClick={() => setDoc({ invoice: i, receipt: l })}>
                      Print / PDF
                    </button>
                  ) : null;
                },
              },
            ]}
          />
        </section>
      )}
      {page === "reports" && (
        <section className="card">
          <div className="section-head">
            <div>
              <h2>{t("Rental financial summary", "කුලී ආදායම් වාර්තාව")}</h2>
              <p>
                Invoice values and cash collections are reported separately. All
                dates use Asia/Colombo.
              </p>
            </div>
            <button onClick={() => exportCSV("rental-ledger", data.ledger)}>
              Export ledger
            </button>
          </div>
          <div className="stats">
            <div>
              <small>Issued invoice value</small>
              <h2>
                {money(
                  data.invoices
                    .filter((i) => i.status === "issued")
                    .reduce((s, i) => s + Number(i.total_minor), 0),
                )}
              </h2>
            </div>
            <div>
              <small>Rental cash received, net refunds</small>
              <h2>
                {money(
                  data.ledger.reduce(
                    (s, l) =>
                      s +
                      (["payment", "refund"].includes(l.kind)
                        ? (l.kind === "refund" ? -1 : 1) *
                          Number(l.amount_minor)
                        : 0),
                    0,
                  ),
                )}
              </h2>
            </div>
            <div>
              <small>Outstanding invoice balances</small>
              <h2>
                {money(
                  data.invoices
                    .filter((i) => i.status === "issued")
                    .reduce((s, i) => s + balanceFor(i, data), 0),
                )}
              </h2>
            </div>
            <div>
              <small>Refundable deposits held</small>
              <h2>
                {money(
                  data.bookings.reduce((s, b) => s + depositFor(b.id, data), 0),
                )}
              </h2>
            </div>
          </div>
          <Table
            rows={data.bookings.map((b) => ({
              ...b,
              vehicle: vehicle(b),
              customer: customer(b),
              deposit: depositFor(b.id, data),
            }))}
            columns={[
              { label: "Vehicle", render: (b) => b.vehicle },
              { label: "Customer", render: (b) => b.customer },
              { label: "Status", render: (b) => <Badge value={b.status} /> },
              { label: "Deposit held", render: (b) => money(b.deposit) },
            ]}
          />
        </section>
      )}
      {editor && (
        <Modal title={editor.title} onClose={() => setEditor(null)}>
          {editor.hint && <p className="notice">{editor.hint}</p>}
          <Form
            key={editor.title}
            fields={editor.fields}
            optionalKeys={[
              "agreement_ref",
              "notes",
              "included_km",
              "excess_rate",
              "grace_minutes",
              "driver",
              "delivery",
              "fuel",
              "damage",
              "late return",
            ]}
            initial={editor.initial}
            language={language}
            onSave={editor.save}
            onCancel={() => setEditor(null)}
          />
        </Modal>
      )}
      {quote && (
        <Modal
          title={t("Rental calculation", "කුලී ගණනය")}
          onClose={() => setQuote(null)}
        >
          <p>
            {vehicle(quote.b)} · {customer(quote.b)}
          </p>
          <Table
            search={false}
            rows={quote.q.lines}
            columns={[
              { label: "Charge", render: (l) => l.label },
              { label: "Quantity", render: (l) => l.quantity },
              { label: "Amount", render: (l) => money(l.amount_minor) },
            ]}
          />
          <div className="quote-total">
            <span>Discount −{money(quote.q.discount_minor)}</span>
            <h2>{money(quote.q.total_minor)}</h2>
          </div>
          <p className="muted">{quote.q.policy}</p>
          {quote.b.status !== "completed" && (
            <p className="notice">
              Estimate only. Record vehicle return to issue the final invoice.
            </p>
          )}
          {canBill &&
            quote.b.status === "completed" &&
            !data.invoices.some(
              (i) => i.booking_id === quote.b.id && i.status === "issued",
            ) && (
              <Form
                fields={[
                  {
                    key: "due_date",
                    en: "Payment due date",
                    type: "date",
                    required: true,
                  },
                ]}
                initial={{ due_date: today() }}
                submit="Issue final invoice"
                onCancel={() => setQuote(null)}
                onSave={async (v) => {
                  await run("invoice_issue", {
                    id: quote.b.id,
                    version: quote.b.version,
                    due_date: v.due_date,
                  });
                  setQuote(null);
                }}
              />
            )}
        </Modal>
      )}
      {doc && (
        <Modal wide title={doc.invoice.number} onClose={() => setDoc(null)}>
          <Invoice
            invoice={
              data.invoices.find((i) => i.id === doc.invoice.id) || doc.invoice
            }
            data={data}
            receipt={doc.receipt}
            language={language}
          />
        </Modal>
      )}
      {!["customers", "rentals", "invoices", "payments", "reports"].includes(
        page,
      ) && <Empty>Choose a rental page.</Empty>}
    </>
  );
}
