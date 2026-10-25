import { previewRepair, type RepairLine } from "./repair-model.ts";
function compareIDs(a: string, b: string) {
  const x = new TextEncoder().encode(a),
    y = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i] - y[i];
  }
  return x.length - y.length;
}
export function packageAllocations(lines: RepairLine[], total: number) {
  if (!Number.isSafeInteger(total) || total < 0 || total > 1e12)
    throw Error("Enter a valid package amount.");
  if (
    lines.length < 2 ||
    new Set(lines.map((l) => l.id)).size !== lines.length ||
    lines.some(
      (l) => l.excluded || (l.unit_minor == null && l.agreed_minor == null),
    )
  )
    throw Error(
      "Select at least two distinct included rows with confirmed prices. M/R prices must be resolved first.",
    );
  const weighted = lines.map((l) => ({
      id: l.id,
      weight: BigInt(previewRepair([{ ...l, tax_bps: 0 }]).net_minor),
    })),
    sum = weighted.reduce((n, l) => n + l.weight, 0n);
  if (sum <= 0n) throw Error("Selected quotations must have a positive total.");
  const parts = weighted.map((l) => ({
    id: l.id,
    amount_minor: Number((l.weight * BigInt(total)) / sum),
    remainder: (l.weight * BigInt(total)) % sum,
  }));
  let left = total - parts.reduce((n, p) => n + p.amount_minor, 0);
  for (const p of [...parts].sort((a, b) =>
    a.remainder === b.remainder
      ? compareIDs(a.id, b.id)
      : a.remainder > b.remainder
        ? -1
        : 1,
  ))
    if (left-- > 0) p.amount_minor++;
  return parts
    .sort((a, b) => compareIDs(a.id, b.id))
    .map(({ id, amount_minor }) => ({ id, amount_minor }));
}
