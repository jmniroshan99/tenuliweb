import { readFile } from "node:fs/promises";
import { randomUUID as uuid } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const platform = await readFile(new URL("./platform.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("./rental.sql", import.meta.url), "utf8");
const repairs = await readFile(new URL("./repairs.sql", import.meta.url), "utf8");
const twoDocuments = await readFile(new URL("./two-documents.sql", import.meta.url), "utf8");
const modernPDFs = await readFile(new URL("./modern-pdfs.sql", import.meta.url), "utf8");
const groupedBilling = await readFile(new URL("./grouped-billing.sql", import.meta.url), "utf8");
const serviceDocuments = await readFile(new URL("./service-documents.sql", import.meta.url), "utf8");
const simpleBilling = await readFile(new URL("./simple-billing.sql", import.meta.url), "utf8");
import { seedRepairs } from "./repair-seed.mjs";
import { emptyLegacy } from "../../../src/lib/types.ts";
let db;
let initializing;
export async function rpc(action, payload = {}, key) {
    const r = await db.query("select public.rental_api($1,$2::jsonb,$3::uuid) as result", [action, JSON.stringify(payload), key ?? null]);
    return r.rows[0].result;
}
export async function init() {
    if (!initializing)
        initializing = initialize().catch(async (error) => {
            await db?.close();
            initializing = undefined;
            throw error;
        });
    return initializing;
}
async function initialize() {
    db = new PGlite();
    await db.exec(platform);
    await db.exec(migration);
    await db.exec(repairs);
    await db.exec(simpleBilling);
    await db.exec(serviceDocuments);
    await db.exec(groupedBilling);
    await db.exec(twoDocuments);
    await db.exec(modernPDFs);
    await db.exec(await readFile(new URL('./pricing-photos.sql',import.meta.url),'utf8'));
    await db.exec("set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001'; set role authenticated;");
    await seedRepairs(repairRPC);
    const c = await rpc("customer_save", {
        name: "නිමල් පෙරේරා",
        phone: "077 000 0000",
        address: "Synthetic customer · Colombo",
    }, uuid());
    const day = 86400000, now = Date.now(), past = new Date(now - 4 * day).toISOString(), end = new Date(now - day).toISOString();
    let b = await rpc("booking_save", {
        vehicle_id: "10000000-0000-4000-8000-000000000001",
        customer_id: c.id,
        pickup_at: past,
        return_at: end,
        rate_plan: "daily",
        rate_minor: 800000,
        included_km: 100,
        excess_rate_minor: 10000,
        extras: [{ label: "Delivery", amount_minor: 200000 }],
        discount_minor: 100000,
        agreement_ref: "DEMO-RENT-001",
    }, uuid());
    b = await rpc("confirm", { id: b.id, version: b.version }, uuid());
    b = await rpc("checkout", { id: b.id, version: b.version, odometer_out: 1000 }, uuid());
    await rpc("payment", {
        id: b.id,
        amount_minor: 1000000,
        method: "bank",
        reference: "DEMO-ADVANCE",
    }, uuid());
    await rpc("deposit", { id: b.id, amount_minor: 1500000, method: "cash" }, uuid());
    b = await rpc("return", { id: b.id, version: b.version, odometer_in: 1380, actual_return_at: end }, uuid());
    await rpc("invoice_issue", {
        id: b.id,
        version: b.version,
        due_date: new Date(now + 7 * day).toISOString().slice(0, 10),
    }, uuid());
    let next = await rpc("booking_save", {
        vehicle_id: "10000000-0000-4000-8000-000000000002",
        customer_id: c.id,
        pickup_at: new Date(now + day).toISOString(),
        return_at: new Date(now + 3 * day).toISOString(),
        rate_minor: 650000,
        included_km: 100,
        excess_rate_minor: 8000,
        agreement_ref: "DEMO-RENT-002",
    }, uuid());
    await rpc("confirm", { id: next.id, version: next.version }, uuid());
}
export async function legacy() {
    return {
        ...emptyLegacy,
        errors: {},
        vehicles: (await db.query("select * from public.vehicles")).rows,
        profiles: (await db.query("select * from public.profiles")).rows,
        policies: [
            {
                id: "demo-policy",
                vehicle_id: "10000000-0000-4000-8000-000000000001",
                provider: "Sample insurer",
                policy_number: "SYNTHETIC-001",
                insurance_type: "Comprehensive",
                start_date: "2026-01-01",
                expiry_date: "2027-01-01",
                premium: 65000,
                policy_state: "active",
            },
        ],
        locations: [],
        trips: [],
    };
}
export async function repairRPC(action, payload = {}, key) {
    const r = await db.query("select public.repair_api($1,$2::jsonb,$3::uuid) as result", [action, JSON.stringify(payload), key ?? null]);
    return r.rows[0].result;
}
export async function permissions() { return (await db.query("select * from public.get_effective_permissions()")).rows; }
export async function close() { await db?.close(); }
