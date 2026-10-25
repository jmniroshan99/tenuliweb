// Layout helpers only. Financial amounts always come from the issued snapshot.
export const MODERN_LAYOUT = "modern-a4-v1";
export type MeasuredBlock = { height: number; group?: string; start?: number };

export function paginateMeasured(
  blocks: MeasuredBlock[],
  first: number,
  later: number,
): number[][] {
  const pages: number[][] = [[]];
  let used = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    let page = pages[pages.length - 1];
    const previous = page.length ? blocks[page[page.length - 1]] : undefined;
    let extra =
      block.height +
      (block.group && block.group === previous?.group ? 0 : block.start || 0);
    if (page.length && used + extra > (pages.length === 1 ? first : later)) {
      pages.push([]);
      page = pages[pages.length - 1];
      used = 0;
      extra = block.height + (block.start || 0);
    }
    if (extra > (pages.length === 1 ? first : later)) {
      // Do not silently crop a record or shrink the entire document.
      if (!page.length && pages.length === 1 && extra <= later) {
        pages.push([]);
        page = pages[1];
      } else
        throw Error(
          "Document content is too tall for an A4 page. Please shorten the individual field.",
        );
    }
    page.push(i);
    used += extra;
  }
  return pages;
}

// Keep source characters and explicit paragraphs; prefer whole-word boundaries.
export function textChunks(value: string, limit = 480): string[] {
  const chars = [
    ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
      value,
    ),
  ].map((s) => s.segment);
  const chunks: string[] = [];
  for (let i = 0; i < chars.length; ) {
    let end = Math.min(i + limit, chars.length);
    if (end < chars.length)
      for (let k = end - 1; k > i + limit / 2; k--) {
        if (/\s/.test(chars[k])) {
          end = k + 1;
          break;
        }
      }
    chunks.push(chars.slice(i, end).join(""));
    i = end;
  }
  return chunks;
}

export function itemFragments(
  line: Record<string, any>,
): Record<string, any>[] {
  if (
    String(line.description || "").length + String(line.notes || "").length <=
    500
  )
    return [line];
  const parts = [
    ...textChunks(String(line.description || ""), 250).map((description) => ({
      description,
      notes: "",
    })),
    ...textChunks(String(line.notes || ""), 250).map((notes) => ({
      description: "",
      notes,
    })),
  ];
  return parts.map((part, i) => ({
    ...line,
    ...part,
    id: `${line.id}-part-${i}`,
    _continuation: i > 0,
  }));
}
