import { billSections } from "./grouped-billing.ts";
import { textChunks } from "./modern-document.ts";

export const OPERATIONS_LAYOUT = "operations-a4-v2";
type Data = Record<string, any>;

// Layout-only projection of an immutable server snapshot. No current job/ledger fetches.
export function operationsItems(snapshot: Data): Data[] {
  return billSections(snapshot.calculation?.lines || []).flatMap((section) =>
    section.lines.flatMap((line, index) => {
      // Only explicitly customer-facing text is permitted in a PDF.
      const description = textChunks(String(line.description || ""), 150);
      const notes = textChunks(String(line.notes || ""), 150);
      const fragments = [
        ...description.map((text) => ({ description: text, notes: "" })),
        ...notes.map((text) => ({ description: "", notes: text })),
      ];
      return (
        fragments.length ? fragments : [{ description: "", notes: "" }]
      ).map((part, i) => ({
        ...line,
        ...part,
        category: section.category,
        sectionStart: index === 0 && i === 0,
        continuation: i > 0,
        fragmentKey: `${line.id}-${i}`,
      }));
    }),
  );
}

export function operationsSummary(snapshot: Data, receiving: boolean) {
  const settlement = snapshot.settlement || {};
  const pending = Number(snapshot.calculation?.pending || 0) > 0;
  const balance = Number(settlement.balance_minor || 0);
  const paid = Number(settlement.paid_minor || 0);
  return {
    ...settlement,
    pending,
    balance,
    paid,
    // A deposit acknowledgement is never labelled as a settled final invoice.
    state: receiving
      ? "estimate"
      : balance < 0
        ? "overpaid"
        : balance === 0
          ? "paid"
          : paid > 0
            ? "partial"
            : "unpaid",
  };
}
