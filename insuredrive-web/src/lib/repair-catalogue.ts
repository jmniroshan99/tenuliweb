import {
  replacementItems,
  removalRefittingItems,
} from "../data/repair-catalogue-parts.ts";
import { repairItems, paintItems } from "../data/repair-catalogue-services.ts";
import {
  miscellaneousItems,
  otherCharges,
} from "../data/repair-catalogue-materials.ts";
import { workSection } from "./grouped-billing.ts";
import type { CatalogueEntry } from "./repair-catalogue-types.ts";

export const BUILT_IN_CATALOGUE: readonly CatalogueEntry[] = [
  ...replacementItems,
  ...removalRefittingItems,
  ...repairItems,
  ...paintItems,
  ...miscellaneousItems,
  ...otherCharges,
];
export type Suggestion = Omit<CatalogueEntry, "active"> & {
  source: "builtin" | "shared" | "history";
  uses: number;
};
type HistoryJob = {
  lines?: { category?: string; description?: string; unit?: string }[];
};
export const normalizeCatalogueText = (text: string) =>
  text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

// The caller supplies only the jobs returned by its already-authorized repair list.
// Copy customer-facing descriptions only; never retain the job or its metadata.
export function catalogueSuggestions(
  category: string,
  jobs: HistoryJob[] = [],
  shared: CatalogueEntry[] = [],
): Suggestion[] {
  const found = new Map<string, Suggestion>();
  const aliases = new Map<string, string>();
  const add = (entry: CatalogueEntry, source: Suggestion["source"]) => {
    if (!entry.active || entry.category !== category) return;
    const key = normalizeCatalogueText(entry.description);
    if (!key || found.has(key)) return;
    const value: Suggestion = {
      id: entry.id,
      category: entry.category,
      description: entry.description,
      descriptionSi: entry.descriptionSi,
      aliases: [...entry.aliases],
      unit: entry.unit,
      source,
      uses: 0,
    };
    found.set(key, value);
    for (const text of [
      entry.description,
      entry.descriptionSi || "",
      ...entry.aliases,
    ]) {
      const alias = normalizeCatalogueText(text);
      if (alias && !aliases.has(alias)) aliases.set(alias, key);
    }
  };
  BUILT_IN_CATALOGUE.forEach((e) => add(e, "builtin"));
  shared.forEach((e) => add(e, "shared"));
  jobs.forEach((job) => {
    const used = new Set<string>();
    for (const line of job.lines || []) {
      if (workSection(line.category) !== category) continue;
      const description = (line.description || "").trim();
      if (!description || description.length > 300) continue;
      const raw = normalizeCatalogueText(description),
        key = aliases.get(raw) || raw;
      if (!found.has(key))
        found.set(key, {
          id: "history:" + category + ":" + raw,
          category,
          description,
          aliases: [],
          unit: line.unit || "item",
          source: "history",
          uses: 0,
        });
      if (!used.has(key)) {
        found.get(key)!.uses++;
        used.add(key);
      }
    }
  });
  return [...found.values()].sort((a, b) => b.uses - a.uses);
}

export function searchCatalogue(
  suggestions: Suggestion[],
  query: string,
): Suggestion[] {
  const q = normalizeCatalogueText(query);
  if (!q) return suggestions;
  const tokens = q.split(" ");
  const score = (entry: Suggestion) => {
    const description = normalizeCatalogueText(entry.description);
    const words = [
      description,
      normalizeCatalogueText(entry.descriptionSi || ""),
      ...entry.aliases.map(normalizeCatalogueText),
    ];
    if (
      !tokens.every((token) =>
        words.some((word) =>
          word
            .split(" ")
            .some(
              (w) =>
                (token === "ac" ? w === "ac" : w.startsWith(token)) ||
                (token.length > 2 && w.includes(token)),
            ),
        ),
      )
    )
      return -1;
    if (description === q) return 1000;
    if (description.startsWith(q)) return 800;
    if (words.includes(q)) return 700;
    return 100;
  };
  return suggestions
    .map((entry, index) => ({ entry, index, score: score(entry) }))
    .filter((x) => x.score >= 0)
    .sort(
      (a, b) =>
        b.score - a.score || b.entry.uses - a.entry.uses || a.index - b.index,
    )
    .map((x) => x.entry);
}

// Selection must never change prices, quantities, discounts or accepted allocations.
export const catalogueSelection = (entry: Suggestion) => ({
  description: entry.description,
});
