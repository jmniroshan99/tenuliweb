import { categories, type RepairLine } from "./repair-model.ts";
export const sectionSinhala: Record<string, string> = {
  "Replacement Items": "මාරු කළ යුතු අමතර කොටස්",
  "Removal & Refitting Items": "ගලවා නැවත සවි කරන අයිතම",
  "Repair Items": "අලුත්වැඩියා අයිතම",
  "Miscellaneous Items": "විවිධ අයිතම",
  "Other Charges": "වෙනත් ගාස්තු",
  "Paint Items": "තීන්ත ආලේපන අයිතම",
};
export function workSection(value: string | undefined): string {
  const v = (value || "").trim().toLowerCase();
  if (
    [
      "remove & refit items",
      "remove and refixed items",
      "removal & refitting items",
    ].includes(v)
  )
    return categories[1];
  return categories.find((c) => c.toLowerCase() === v) || categories[2];
}
export function itemSuggestions(
  jobs: { lines?: RepairLine[] }[],
  section: string,
): string[] {
  const found = new Map<string, string>();
  for (const job of jobs)
    for (const line of job.lines || []) {
      if (workSection(line.category) !== section) continue;
      const description = line.description.trim();
      if (description) found.set(description.toLocaleLowerCase(), description);
    }
  return [...found.values()].sort((a, b) => a.localeCompare(b));
}
type Line = Record<string, any>;
export type GroupedSection = {
  category: string;
  lines: Line[];
  total: number;
  pending: number;
};
export function billSections(lines: Line[]): GroupedSection[] {
  let number = 0;
  return categories
    .map((category) => {
      const included = lines.filter(
        (l) => !l.excluded && workSection(l.category) === category,
      );
      return {
        category,
        lines: included.map((l) => ({ ...l, row_number: ++number })),
        total: included.reduce(
          (sum, l) => sum + Number(l.net_minor || 0) + Number(l.tax_minor || 0),
          0,
        ),
        pending: included.filter(
          (l) => l.unit_minor == null && l.agreed_minor == null,
        ).length,
      };
    })
    .filter((section) => section.lines.length);
}
export type SectionFragment = GroupedSection & {
  continued: boolean;
  showSubtotal: boolean;
};
export function groupedBillPages(lines: Line[]): SectionFragment[][] {
  const pages: SectionFragment[][] = [[]];
  let used = 0;
  // Counting code units conservatively reserves room for Sinhala combining glyphs.
  const length = (s: unknown) => String(s || "").length;
  for (const section of billSections(lines)) {
    let fragment: SectionFragment | undefined;
    for (let i = 0; i < section.lines.length; i++) {
      const line = section.lines[i],
        last = i === section.lines.length - 1;
      const weight = Math.max(
        27,
        Math.ceil(
          length(String(line.description || "") + String(line.position || "")) /
            34,
        ) *
          16 +
          Math.ceil(length(line.notes) / 38) * 15 +
          (line.agreed_minor != null ? 18 : 0) +
          8,
      );
      const extra = (fragment ? 0 : 48) + weight + (last ? 27 : 0);
      if (used + extra > 500 && pages[pages.length - 1].length) {
        pages.push([]);
        used = 0;
        fragment = undefined;
      }
      if (!fragment) {
        fragment = {
          ...section,
          lines: [],
          continued: i > 0,
          showSubtotal: false,
        };
        pages[pages.length - 1].push(fragment);
        used += 48;
      }
      fragment.lines.push(line);
      used += weight;
      if (last) {
        fragment.showSubtotal = true;
        used += 27;
      }
    }
  }
  return pages;
}
