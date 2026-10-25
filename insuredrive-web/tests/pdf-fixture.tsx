// Development-only synthetic visual fixture; excluded from the production entry.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Invoice } from "../src/features/Invoice";
import { Modal } from "../src/components/Controls";
import { emptyRental } from "../src/lib/types";
import "../src/style.css";
const lines = Array.from({ length: 27 }, (_, i) => ({
  label: `${i + 1}. පරීක්ෂණ ගාස්තුව / Synthetic charge`,
  quantity: 1,
  rate_minor: 10000,
  amount_minor: 10000,
}));
const invoice = {
  id: "synthetic-invoice",
  number: "SYNTHETIC-PDF-001",
  status: "issued",
  issued_at: "2026-10-24T00:00:00Z",
  due_date: "2026-10-31",
  booking_id: "synthetic-booking",
  total_minor: 270000,
  snapshot: {
    business: {
      name: "InsureDrive · ආදර්ශ ව්‍යාපාරය",
      address: "Synthetic address, Colombo",
      phone: "000 000 0000",
      notes: "පරීක්ෂණය සඳහා පමණි. Synthetic data only.",
    },
    customer: {
      name: "නිමල් පෙරේරා",
      address: "Synthetic address",
      phone: "000 000 0000",
    },
    vehicle: { registration_number: "DEMO-001", make: "Toyota", model: "Aqua" },
    booking: {
      pickup_at: "2026-10-20T00:00:00Z",
      return_at: "2026-10-23T00:00:00Z",
      odometer_out: 1000,
      odometer_in: 1380,
      agreement_ref: "DEMO",
      tax_bps: 0,
    },
    calculation: {
      tax_bps: 0,
      lines,
      included_km: 300,
      subtotal_minor: 270000,
      discount_minor: 0,
      tax_minor: 0,
      total_minor: 270000,
    },
  },
};
const receipt = {
  id: "synthetic-payment",
  booking_id: "synthetic-booking",
  receipt_number: "SYNTHETIC-RECEIPT-001",
  kind: "payment",
  method: "cash",
  amount_minor: 100000,
  created_at: "2026-10-24T00:00:00Z",
  reference: "Synthetic only",
  reason: "",
};
function Test() {
  const [modal, setModal] = useState(false),
    [small, setSmall] = useState(false);
  const content = (
    <Invoice
      invoice={invoice}
      data={emptyRental}
      language="si"
      receipt={small ? receipt : undefined}
    />
  );
  return (
    <main style={{ padding: 20 }}>
      <h1>Synthetic PDF verification</h1>
      <p>27 lines / three pages / Sinhala text. No backend connection.</p>
      <button onClick={() => setModal(true)}>Open modal fixture</button>
      <button onClick={() => setSmall(!small)}>Toggle 80 mm receipt</button>
      {modal ? (
        <Modal title="Synthetic invoice" onClose={() => setModal(false)} wide>
          {content}
        </Modal>
      ) : (
        content
      )}
    </main>
  );
}
if (import.meta.env.DEV)
  createRoot(document.getElementById("root")!).render(<Test />);
