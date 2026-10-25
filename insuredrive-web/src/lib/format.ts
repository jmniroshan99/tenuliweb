import type { Row, RentalData } from "./types";
export const money = (minor: number | string = 0) =>
  new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" }).format(
    Number(minor) / 100,
  );
export const date = (v: string | undefined) =>
  v
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Colombo",
      }).format(new Date(v))
    : "—";
export const day = (v: string | undefined) =>
  v
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeZone: "Asia/Colombo",
      }).format(new Date(v))
    : "—";
export function localInput(v: string) {
  const d = new Date(new Date(v).getTime() + 330 * 60000);
  return d.toISOString().slice(0, 16);
}
export const colomboISO = (v: string) =>
  new Date(
    v.includes("Z") || /\+\d\d:\d\d$/.test(v) ? v : v + ":00+05:30",
  ).toISOString();
export const today = () =>
  new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
export function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    h.slice(12, 16),
    h.slice(16, 20),
    h.slice(20),
  ].join("-");
}
export function decimalMinor(v: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(v))
    throw Error("Use a non-negative amount with at most 2 decimal places");
  const [w, f = ""] = v.split(".");
  const n = Number(BigInt(w) * 100n + BigInt(f.padEnd(2, "0")));
  if (!Number.isSafeInteger(n)) throw Error("Amount is too large");
  return n;
}
export const paidFor = (i: Row, d: RentalData) =>
  d.allocations
    .filter((a) => a.invoice_id === i.id)
    .reduce((s, a) => s + Number(a.amount_minor), 0);
export const depositFor = (id: string, d: RentalData) =>
  d.ledger
    .filter((a) => a.booking_id === id)
    .reduce(
      (s, a) =>
        s +
        (a.kind === "deposit"
          ? 1
          : ["deposit_refund", "deposit_apply"].includes(a.kind)
            ? -1
            : 0) *
          Number(a.amount_minor),
      0,
    );
export const balanceFor = (i: Row, d: RentalData) =>
  Number(i.total_minor) - paidFor(i, d);
export function paymentState(i: Row, d: RentalData) {
  if (i.status === "void") return "void";
  const p = paidFor(i, d);
  return balanceFor(i, d) === 0 ? "paid" : p > 0 ? "partial" : "unpaid";
}
export function exportCSV(name: string, rows: Row[]) {
  const keys = Object.keys(rows[0] || {});
  const safe = (v: unknown) => {
    const s = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
    return (
      '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replaceAll('"', '""') + '"'
    );
  };
  const blob = new Blob(
    [
      "\uFEFF" +
        [
          keys.map(safe).join(","),
          ...rows.map((r) => keys.map((k) => safe(r[k])).join(",")),
        ].join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  downloadBlob(blob, name + ".csv");
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  // A native modal makes the rest of the document inert. Keep the download
  // anchor inside the active dialog so its click is allowed by the browser.
  (document.querySelector("dialog[open]") || document.body).appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
