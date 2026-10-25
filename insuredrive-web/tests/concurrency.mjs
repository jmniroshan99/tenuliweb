// Run only against a new, disposable PostgreSQL database (NOT a live Supabase project).
// TEST_DATABASE_URL=... INSUREDRIVE_ALLOW_TEST_DB=1 node tests/concurrency.mjs
import pg from "pg";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
if (
  process.env.INSUREDRIVE_ALLOW_TEST_DB !== "1" ||
  !process.env.TEST_DATABASE_URL
)
  throw Error("Explicit disposable test database opt-in required");
const config = { connectionString: process.env.TEST_DATABASE_URL },
  setup = new pg.Client(config);
await setup.connect();
const existing = await setup.query(
  "select to_regclass('public.profiles') as p,to_regnamespace('auth') as a",
);
if (existing.rows[0].p || existing.rows[0].a)
  throw Error("Refusing to initialize a non-empty platform database");
await setup.query(
  await readFile(new URL("./fixtures/database/platform.sql", import.meta.url), "utf8"),
);
await setup.query(
  await readFile(
    new URL("../../supabase/RENTALS_UPGRADE.sql", import.meta.url),
    "utf8",
  ),
);
const sessions = [new pg.Client(config), new pg.Client(config)];
await Promise.all(
  sessions.map(async (c) => {
    await c.connect();
    await c.query(
      "set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';set role authenticated",
    );
  }),
);
const rpc = async (c, a, p, key = crypto.randomUUID()) =>
  (
    await c.query("select public.rental_api($1,$2::jsonb,$3::uuid) as r", [
      a,
      JSON.stringify(p),
      key,
    ])
  ).rows[0].r;
try {
  const customer = await rpc(sessions[0], "customer_save", {
    name: "Concurrent test",
    phone: "synthetic",
  });
  const p = {
    vehicle_id: "10000000-0000-4000-8000-000000000001",
    customer_id: customer.id,
    pickup_at: "2031-01-01T00:00:00Z",
    return_at: "2031-01-02T00:00:00Z",
    rate_minor: 100000,
  };
  const bookings = await Promise.all(
    sessions.map((c) => rpc(c, "booking_save", p)),
  );
  const confirmations = await Promise.allSettled(
    sessions.map((c, i) =>
      rpc(c, "confirm", { id: bookings[i].id, version: bookings[i].version }),
    ),
  );
  assert.equal(confirmations.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(confirmations.filter((x) => x.status === "rejected").length, 1);
  console.log("PASS simultaneous overlap confirmation: exactly one success");
  const distinct = await Promise.all(
    sessions.map(async (c, i) => {
      const terms = {
        ...p,
        vehicle_id: `10000000-0000-4000-8000-00000000000${i + 2}`,
        pickup_at: "2031-02-01T00:00:00Z",
        return_at: "2031-02-02T00:00:00Z",
      };
      let next = await rpc(c, "booking_save", terms);
      next = await rpc(c, "confirm", { id: next.id, version: next.version });
      next = await rpc(c, "checkout", {
        id: next.id,
        version: next.version,
        odometer_out: 10,
      });
      next = await rpc(c, "return", {
        id: next.id,
        version: next.version,
        odometer_in: 20,
        actual_return_at: terms.return_at,
      });
      return next;
    }),
  );
  const numbered = await Promise.all(
    sessions.map((c, i) =>
      rpc(c, "invoice_issue", {
        id: distinct[i].id,
        version: distinct[i].version,
        due_date: "2031-02-10",
      }),
    ),
  );
  assert.notEqual(numbered[0].number, numbered[1].number);
  console.log("PASS independent concurrent invoices have unique numbers");

  const winning = confirmations.find((x) => x.status === "fulfilled").value;
  let b = await rpc(sessions[0], "checkout", {
    id: winning.id,
    version: winning.version,
    odometer_out: 10,
  });
  b = await rpc(sessions[0], "return", {
    id: b.id,
    version: b.version,
    odometer_in: 20,
    actual_return_at: p.return_at,
  });
  const issue = await Promise.allSettled(
    sessions.map((c) =>
      rpc(c, "invoice_issue", {
        id: b.id,
        version: b.version,
        due_date: "2031-01-10",
      }),
    ),
  );
  assert.equal(issue.filter((x) => x.status === "fulfilled").length, 1);
  console.log("PASS simultaneous invoice issuance: exactly one invoice");
  const key = crypto.randomUUID(),
    pay = { id: b.id, amount_minor: 10000, method: "cash" };
  const payments = await Promise.all(
    sessions.map((c) => rpc(c, "payment", pay, key)),
  );
  assert.equal(payments[0].id, payments[1].id);
  console.log("PASS simultaneous idempotent payment: same ledger entry");
  const remaining = await Promise.allSettled(
    sessions.map((c) => rpc(c, "payment", { ...pay, amount_minor: 80000 })),
  );
  assert.equal(remaining.filter((x) => x.status === "fulfilled").length, 1);
  console.log("PASS concurrent payments cannot overpay");
} finally {
  await Promise.all(sessions.map((c) => c.end()));
  await setup.end();
}
