export type NoteSection = { label: string; text: string };
// Explicit short lines make pagination deterministic for both Latin and Sinhala.
// Grapheme boundaries keep Sinhala combining marks attached to their base letter.
export function notePages(
  sections: NoteSection[],
  maxUnits = 20,
  flowText = false,
): NoteSection[][] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const pages: NoteSection[][] = [[]];
  let used = 0;
  for (const section of sections) {
    if (!section.text) continue;
    const lines = section.text.split("\n").flatMap((line) => {
      const chars = [...segmenter.segment(line)].map((v) => v.segment),
        rows: string[] = [];
      for (let i = 0; i < chars.length; ) {
        let end = Math.min(i + 48, chars.length);
        if (flowText && end < chars.length) {
          for (let k = end - 1; k > i + 20; k--) {
            if (/\s/.test(chars[k])) {
              end = k + 1;
              break;
            }
          }
        }
        rows.push(chars.slice(i, end).join(""));
        i = end;
      }
      return rows.length ? rows : [""];
    });
    for (let i = 0; i < lines.length; i += 3) {
      const slice = lines.slice(i, i + 3),
        units = slice.length + 2;
      if (used + units > maxUnits) {
        pages.push([]);
        used = 0;
      }
      const page = pages[pages.length - 1],
        previous = page[page.length - 1];
      if (flowText && previous?.label === section.label)
        previous.text += "\n" + slice.join("\n");
      else page.push({ label: section.label, text: slice.join("\n") });
      used += units;
    }
  }
  return pages;
}
