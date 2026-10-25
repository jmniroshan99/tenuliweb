export type RepairLine = {
  id: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unit_minor: number | null;
  discount_minor: number;
  tax_bps: number;
  excluded?: boolean;
  notes?: string;
  position?: string;
  internal_note?: string;
  unverified_note?: string;
  agreed_minor?: number | null;
  price_review_id?: string | null;
};
export const categories = [
  "Replacement Items",
  "Removal & Refitting Items",
  "Repair Items",
  "Paint Items",
  "Miscellaneous Items",
  "Other Charges",
];
export function previewRepair(lines: RepairLine[]) {
  let net = 0n,
    tax = 0n,
    pending = 0;
  for (const l of lines) {
    if (l.excluded) continue;
    if (l.unit_minor == null && l.agreed_minor == null) {
      pending++;
      continue;
    }
    const qty = BigInt(Math.round(l.quantity * 1000));
    const subtotal =
      l.agreed_minor != null
        ? BigInt(l.agreed_minor)
        : (qty * BigInt(l.unit_minor!) + 500n) / 1000n -
          BigInt(l.discount_minor);
    if (subtotal < 0n) throw Error("Discount exceeds line total");
    net += subtotal;
    tax += (subtotal * BigInt(l.tax_bps) + 5000n) / 10000n;
  }
  return {
    net_minor: Number(net),
    tax_minor: Number(tax),
    total_minor: Number(net + tax),
    pending,
  };
}
export function documentGroups(lines: Record<string, any>[]) {
  const groups: Record<string, any>[][] = [];
  let group: Record<string, any>[] = [],
    weight = 0;
  for (const line of lines) {
    const w =
      2 +
      Math.ceil(String(line.description || "").length / 55) +
      Math.ceil(String(line.notes || "").length / 55);
    if (group.length && (weight + w > 24 || group.length >= 8)) {
      groups.push(group);
      group = [];
      weight = 0;
    }
    group.push(line);
    weight += w;
  }
  if (group.length || !groups.length) groups.push(group);
  return groups;
}
