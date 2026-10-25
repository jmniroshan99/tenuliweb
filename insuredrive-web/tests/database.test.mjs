import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  await readFile(new URL("./fixtures/database/platform.sql", import.meta.url), "utf8"),
);
await db.exec(
  await readFile(
    new URL("../../supabase/RENTALS_UPGRADE.sql", import.meta.url),
    "utf8",
  ),
);
const admin = "00000000-0000-4000-8000-000000000001",
  owner = "00000000-0000-4000-8000-000000000002",
  other = "00000000-0000-4000-8000-000000000003",
  officer = "00000000-0000-4000-8000-000000000004";
async function as(id) {
  await db.exec(
    `reset role; set request.jwt.claim.sub='${id}'; set role authenticated;`,
  );
}
async function rpc(a, p = {}, key = crypto.randomUUID()) {
  return (
    await db.query(
      "select public.rental_api($1,$2::jsonb,$3::uuid) as result",
      [a, JSON.stringify(p), key],
    )
  ).rows[0].result;
}
let passed = 0;
const check = (label) => {
  passed++;
  console.log("PASS", label);
};
await as(admin);
const c = await rpc("customer_save", {
  name: "පරීක්ෂණ පාරිභෝගිකයා",
  phone: "0770000000",
  address: "Synthetic only",
});
const payload = {
  vehicle_id: "10000000-0000-4000-8000-000000000001",
  customer_id: c.id,
  pickup_at: "2026-10-20T09:00:00+05:30",
  return_at: "2026-10-23T09:00:00+05:30",
  rate_plan: "daily",
  rate_minor: 800000,
  included_km: 100,
  excess_rate_minor: 10000,
  extras: [{ label: "Delivery", amount_minor: 200000 }],
  discount_minor: 100000,
};
const key = crypto.randomUUID();
let b = await rpc("booking_save", payload, key);
assert.deepEqual(await rpc("booking_save", payload, key), b);
await assert.rejects(rpc("booking_save", { ...payload, rate_minor: 1 }, key));
check("idempotent retry and payload mismatch");
let q = await rpc("quote", { id: b.id });
assert.equal(q.units, 3);
check("daily duration");
b = await rpc("confirm", { id: b.id, version: b.version });
let overlap = await rpc("booking_save", payload);
await assert.rejects(
  rpc("confirm", { id: overlap.id, version: overlap.version }),
);
check("overlap rejected");
await assert.rejects(
  rpc("checkout", { id: b.id, version: 1, odometer_out: 1000 }),
);
check("stale version rejected");
b = await rpc("checkout", { id: b.id, version: b.version, odometer_out: 1000 });
await assert.rejects(
  rpc("return", {
    id: b.id,
    version: b.version,
    odometer_in: 999,
    actual_return_at: payload.return_at,
  }),
);
check("invalid odometer rejected");
await rpc("payment", { id: b.id, amount_minor: 1000000, method: "bank" });
await rpc("deposit", { id: b.id, amount_minor: 1500000, method: "cash" });
b = await rpc("return", {
  id: b.id,
  version: b.version,
  odometer_in: 1380,
  actual_return_at: payload.return_at,
});
q = await rpc("quote", { id: b.id });
assert.equal(q.total_minor, 3300000);
assert.equal(q.excess_km, 80);
check("LKR 33000 fixture with excess km");
const inv = await rpc("invoice_issue", {
  id: b.id,
  version: b.version,
  due_date: "2026-10-30",
});
let list = await rpc("list");
assert.equal(
  list.allocations.reduce((s, x) => s + Number(x.amount_minor), 0),
  1000000,
);
assert.equal(inv.total_minor - 1000000, 2300000);
check("advance allocation and deposit separation");
await assert.rejects(
  rpc("invoice_issue", {
    id: b.id,
    version: b.version,
    due_date: "2026-10-30",
  }),
);
await assert.rejects(
  db.query("update public.rental_invoices set total_minor=1 where id=$1", [
    inv.id,
  ]),
);
check("duplicate and client invoice tampering rejected");
await rpc("customer_save", {
  id: c.id,
  version: 1,
  name: "Changed customer",
  phone: "",
});
assert.equal(
  (await rpc("list")).invoices[0].snapshot.customer.name,
  "පරීක්ෂණ පාරිභෝගිකයා",
);
check("invoice snapshot immutable after customer edits");
await rpc("deposit_apply", {
  id: b.id,
  amount_minor: 500000,
  reason: "Customer approved application",
});
await assert.rejects(
  rpc("deposit_refund", {
    id: b.id,
    amount_minor: 1100000,
    method: "cash",
    reason: "Too much",
  }),
);
await rpc("deposit_refund", {
  id: b.id,
  amount_minor: 1000000,
  method: "cash",
  reason: "Return deposit",
});
check("deposit apply/refund balance enforced");
await assert.rejects(
  rpc("payment", { id: b.id, amount_minor: 99999999, method: "cash" }),
);
await assert.rejects(
  rpc("refund", {
    id: b.id,
    amount_minor: 99999999,
    method: "cash",
    reason: "Invalid",
  }),
);
check("overpayment and excess refund rejected");
await as(owner);
list = await rpc("list");
assert.equal(list.owner_only, true);
assert.ok(list.bookings.length > 0);
assert.equal(list.customers.length, 0);
assert.equal(list.invoices.length, 0);
assert.equal(list.bookings[0].customer_id, undefined);
assert.equal(
  (await db.query("select * from public.rental_customers")).rows.length,
  0,
);
await assert.rejects(rpc("quote", { id: b.id }));
await assert.rejects(
  rpc("payment", { id: b.id, amount_minor: 100, method: "cash" }),
);
check("owner data redaction and direct/RPC isolation");
await as(other);
assert.equal((await rpc("list")).bookings.length, 0);
check("other owner isolation");
await as(officer);
await assert.rejects(rpc("list"));
check("officer has no automatic rental permission");
await db.exec(
  `reset role;update public.profiles set account_status='suspended' where id='${admin}'`,
);
await as(admin);
await assert.rejects(rpc("list"));
await assert.rejects(
  rpc("payment", { id: b.id, amount_minor: 100, method: "cash" }),
);
check("suspended account denied");
await db.exec(
  `reset role;update public.profiles set account_status='active' where id='${admin}'`,
);
await as(admin);
await rpc("refund", {
  id: b.id,
  amount_minor: 1500000,
  method: "bank",
  reason: "Refund before correction",
});
await rpc("invoice_void", { invoice_id: inv.id, reason: "Correction" });
const inv2 = await rpc("invoice_issue", {
  id: b.id,
  version: b.version,
  due_date: "2026-10-30",
});
assert.notEqual(inv.number, inv2.number);
check("refund / void / reissue and unique numbering");
await assert.rejects(
  rpc("booking_save", { ...payload, pickup_at: payload.return_at }),
);
check("invalid dates rejected");
const boundary = await rpc("booking_save", {
  ...payload,
  vehicle_id: "10000000-0000-4000-8000-000000000002",
  pickup_at: "2030-01-01T00:00:00Z",
  return_at: "2030-01-02T00:00:00Z",
  rate_minor: 101,
  extras: [],
  discount_minor: 0,
  tax_bps: 500,
});
const qb = await rpc("quote", { id: boundary.id });
assert.equal(qb.units, 1);
assert.equal(qb.tax_minor, 5);
assert.equal(qb.total_minor, 106);
check("period boundary and half-up rounding");
await assert.rejects(rpc("confirm", {id: boundary.id, version: null}));
await assert.rejects(rpc("booking_save", {...payload, extras:[{label:"Missing amount"}]}));
await assert.rejects(rpc("payment", {id:b.id,amount_minor:100,method:"deposit"}));
check("null version, null charge and fake deposit method rejected");
await db.exec("reset role;update public.vehicles set is_active=false where id='10000000-0000-4000-8000-000000000002'");await as(admin);
await assert.rejects(rpc("confirm",{id:boundary.id,version:boundary.version}));
check("deactivated vehicle cannot be confirmed");
await rpc("invoice_void",{invoice_id:inv2.id,reason:"Correct charges"});
b=await rpc("charges_update",{id:b.id,version:b.version,extras:[{label:"Delivery",amount_minor:200000},{label:"Fuel",amount_minor:50000}],discount_minor:100000,tax_bps:0,reason:"Fuel measured at return"});
assert.equal((await rpc("quote",{id:b.id})).total_minor,3350000);
await assert.rejects(rpc("invoice_issue",{id:b.id,version:b.version-1,due_date:"2026-10-30"}));
const corrected=await rpc("invoice_issue",{id:b.id,version:b.version,due_date:"2026-10-30"});
assert.equal(corrected.total_minor,3350000);
check("versioned settlement adjustment and corrected reissue");
await db.exec("reset role;select setval('rental_private.receipt_number',10000000)");await as(admin);
await rpc("payment",{id:b.id,amount_minor:100,method:"cash"});
assert.ok((await rpc("list")).ledger.some(l=>l.receipt_number==='RCT-10000001'));
check("document sequence does not truncate beyond padding width");
console.log(
  `${passed} database checks passed. PGlite is single-session: true multi-session contention requires PostgreSQL integration test.`,
);
await db.close();
