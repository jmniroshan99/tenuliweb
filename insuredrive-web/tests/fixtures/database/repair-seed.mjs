import { randomUUID as uuid } from "node:crypto";
const today = () => new Date().toISOString().slice(0, 10);
export async function seedRepairs(rpc) {
    const call = (a, p = {}) => rpc(a, p, uuid());
    const line = (description, category, price) => ({
        id: uuid(),
        description,
        category,
        quantity: 1,
        unit: "item",
        unit_minor: price,
        discount_minor: 0,
        tax_bps: 0,
        excluded: false,
        notes: "",
    });
    const info = {
        customer_name: "Synthetic workshop customer",
        phone: "0770000000",
        address: "Demo only · Yakkala",
        registration: "DEMO-REPAIR-01",
        make_model: "Bajaj Threewheel",
        insurance: "Sample insurer",
        advisor: "Demo service advisor",
        expected_customer_minor: 0,
        expected_insurer_minor: 0,
    };
    await call("save", {
        info,
        lines: [
            line("Hood upholstery (tent)", "Replacement Items", null),
            line("Rear RHS mud guard", "Remove & Refit Items", 60000),
            line("Petrol tank", "Remove & Refit Items", 80000),
            line("RHS signal lamp", "Remove & Refit Items", 40000),
            line("Hood upholstery (tent)", "Remove & Refit Items", 750000),
            line("Rear body panel", "Repair Items", 250000),
            line("Rear body panel", "Paint Items", 800000),
        ],
    });
    let j = await call("save", {
        info: {
            ...info,
            customer_name: "Demo completed repair",
            registration: "DEMO-REPAIR-02",
        },
        lines: [line("Panel repair and painting", "Repair Items", 3000000)],
    });
    for (const action of ["approve", "start", "complete"])
        j = await call(action, {
            job_id: j.id,
            version: j.version,
            reason: "Synthetic demonstration",
        });
    await call("invoice_issue", {
        job_id: j.id,
        version: j.version,
        due_date: today(),
    });
    await call("payment", {
        job_id: j.id,
        amount_minor: 1000000,
        payer: "customer",
        method: "cash",
        reason: "Demo partial payment",
    });
    const supplier = await call("supplier_save", {
        name: "Demo External Workshop",
        phone: "0700000000",
        address: "Synthetic supplier",
    });
    for (const [description, category, net, supplier_id] of [
        ["External repair and parts", "Outsourced work", 1800000, supplier.id],
        ["Direct labour", "Internal labour", 250000, ""],
        ["Transport", "Transport", 50000, ""],
    ]) {
        const bill = await call("bill_save", {
            supplier_id,
            description,
            category,
            quantity: 1,
            unit: "job",
            estimated_minor: net,
            actual_minor: net,
            tax_minor: 0,
            purchase_date: today(),
        });
        await call("allocation", { bill_id: bill.id, job_id: j.id, quantity: 1 });
    }
    await call("costs_complete", {
        job_id: j.id,
        reason: "All demo direct costs verified",
    });
}
