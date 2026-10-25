// Development/build verification only. Never imported by the production entrypoint.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Modal } from "../src/components/Controls";
import RepairDocument from "../src/features/RepairDocument";
import fixtures from "./fixtures/operations-documents.json";
import "../src/style.css";

const params = new URLSearchParams(location.search);
function Fixture() {
  const [kind, setKind] = useState(params.get("kind") || "receiving"),
    [language, setLanguage] = useState(params.get("language") || "en"),
    [variant, setVariant] = useState(params.get("variant") || "short");
  const doc = structuredClone(
    (fixtures as Record<string, any>)[kind] || fixtures.receiving,
  );
  doc.snapshot.sample_data = true;
  doc.snapshot.prepared_by = "SAMPLE OPERATOR";
  doc.number =
    kind === "receiving"
      ? "SAMPLE-ADVANCE-001"
      : kind === "paid"
        ? "SAMPLE-FINAL-001"
        : `SAMPLE-${kind.toUpperCase()}-001`;
  doc.snapshot.info.customer_name =
    language === "si" ? "පරීක්ෂණ පාරිභෝගිකයා" : "SAMPLE CUSTOMER";
  doc.snapshot.info.phone = "0700000000";
  doc.snapshot.info.make_model = "SAMPLE vehicle";
  doc.snapshot.receiving_content = {
    reported_problem:
      language === "si"
        ? "වාහනයේ බඳ කොටසට හානි සිදුවී ඇත."
        : "Damage to the vehicle body.",
    requested_work:
      language === "si"
        ? "හානි වූ කොටස් අලුත්වැඩියා කර පින්තාරු කරන්න."
        : "Repair and paint damaged body panels.",
  };
  delete doc.snapshot.info.claim_number;
  if (doc.snapshot.completion)
    doc.snapshot.completion.content = {
      work_performed:
        language === "si"
          ? "අලුත්වැඩියා කටයුතු නිම කරන ලදී."
          : "Recorded repairs completed.",
    };
  // A four-category example retains the same LKR 100,000 total in both stages.
  if (
    ["receiving", "invoice", "partial", "paid", "overpaid"].includes(kind) &&
    variant === "short"
  ) {
    doc.snapshot.calculation.lines = doc.snapshot.calculation.lines.slice(0, 4);
    doc.snapshot.calculation.lines[0].unit_minor = 7000000;
    doc.snapshot.calculation.lines[0].net_minor = 7000000;
  }
  doc.snapshot.calculation.lines.forEach((l: any, i: number) => {
    l.description = (
      language === "si"
        ? [
            "ඉදිරිපස බම්පරය",
            "කොටස් ගලවා නැවත සවි කිරීම",
            "බඳ කොටස අලුත්වැඩියා කිරීම",
            "පින්තාරු කිරීම",
            "අනෙකුත් ද්‍රව්‍ය",
            "පිරිසිදු කිරීම",
          ]
        : [
            "Front bumper replacement",
            "Remove and refit body panels",
            "Body panel repair",
            "Prepare and paint repaired panels",
            "Consumable materials",
            "Vehicle cleaning",
          ]
    )[i % 6];
  });
  if (variant === "long") {
    const original = doc.snapshot.calculation.lines;
    doc.snapshot.calculation.lines = Array.from({ length: 48 }, (_, i) => ({
      ...original[i % original.length],
      id: `long-${i}`,
      description:
        language === "si"
          ? "පරීක්ෂා කර අලුත්වැඩියා කළ බඳ කොටස. ".repeat(10)
          : "Inspect and repair the damaged panel; preserve alignment and finish. ".repeat(
              6,
            ),
      row_number: i + 1,
      notes: "",
    }));
    const total = doc.snapshot.calculation.lines.reduce(
      (sum: number, l: any) => sum + Number(l.net_minor || 0),
      0,
    );
    doc.snapshot.calculation.total_minor = total;
    doc.snapshot.settlement.total_minor = total;
    doc.snapshot.settlement.balance_minor =
      total -
      Number(doc.snapshot.settlement.credit_minor || 0) -
      Number(doc.snapshot.settlement.paid_minor || 0);
  }
  if (variant === "maxrow")
    doc.snapshot.calculation.lines[0].description = "W".repeat(300);
  document.documentElement.lang = language;
  return (
    <>
      <div style={{ padding: 20, display: "flex", gap: 12 }}>
        <label>
          Document
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.keys(fixtures).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Language
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option>en</option>
            <option>si</option>
          </select>
        </label>
        <label>
          Content
          <select value={variant} onChange={(e) => setVariant(e.target.value)}>
            <option>short</option>
            <option>sections</option>
            <option>long</option>
            <option>maxrow</option>
          </select>
        </label>
      </div>
      <Modal title="Synthetic A4 verification" wide onClose={() => {}}>
        <RepairDocument
          key={`${kind}-${language}-${variant}`}
          doc={doc}
          language={language}
        />
      </Modal>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
