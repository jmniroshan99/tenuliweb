import { useMemo, useState } from "react";
import RepairItemCombobox from "../components/RepairItemCombobox";
import {
  catalogueSuggestions,
  catalogueSelection,
  normalizeCatalogueText,
  type Suggestion,
} from "../lib/repair-catalogue";
import type { CatalogueEntry } from "../lib/repair-catalogue-types";
import {
  categories,
  previewRepair,
  type RepairLine,
} from "../lib/repair-model";
import { sectionSinhala, workSection } from "../lib/grouped-billing";
import { money, decimalMinor, uuid } from "../lib/format";
import type { Row } from "../lib/types";
const blank = (category: string): RepairLine => ({
  id: uuid(),
  category,
  description: "",
  quantity: 1,
  unit: "item",
  unit_minor: null,
  discount_minor: 0,
  tax_bps: 0,
});
export function initialRepairLines(job: Row): RepairLine[] {
  return (
    job.lines?.map((l: RepairLine) => ({
      ...l,
      category: workSection(l.category),
      tax_bps: 0,
    })) || [blank(categories[0])]
  );
}
function ItemRow({
  line,
  index,
  language,
  suggestions,
  onChange,
  onRemove,
  removable,
  onMove,
  first,
  last,
  saveSharedItem,
}: {
  line: RepairLine;
  index: number;
  language: string;
  suggestions: Suggestion[];
  saveSharedItem?: (line: RepairLine) => Promise<unknown>;
  onChange: (p: Partial<RepairLine>) => void;
  onRemove: () => void;
  removable: boolean;
  onMove: (by: number) => void;
  first: boolean;
  last: boolean;
}) {
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [sharing, setSharing] = useState(false),
    [shareMessage, setShareMessage] = useState("");
  const t = (en: string, si: string) => (language === "si" ? si : en);
  let amount: string;
  try {
    amount =
      line.unit_minor == null && line.agreed_minor == null
        ? "M/R"
        : money(previewRepair([{ ...line, excluded: false }]).total_minor);
  } catch {
    amount = t("Check price / discount", "මිල / වට්ටම පරීක්ෂා කරන්න");
  }
  const changeMoney = (key: "unit_minor" | "discount_minor", value: string) => {
    try {
      onChange({
        [key]:
          key === "unit_minor" && value === ""
            ? null
            : decimalMinor(value || "0"),
      });
      setInvalid((v) => ({ ...v, [key]: false }));
    } catch {
      setInvalid((v) => ({ ...v, [key]: true }));
    }
  };
  return (
    <div
      className={
        "tenuli-edit-line grouped-edit-line" +
        (line.excluded ? " excluded-line" : "")
      }
      data-row-id={line.id}
    >
      <div className="grouped-row-heading">
        <b>
          {t("Item", "අයිතමය")} {index + 1}
        </b>
        <label className="tenuli-check">
          <input
            type="checkbox"
            checked={!line.excluded}
            onChange={(e) => onChange({ excluded: !e.target.checked })}
          />
          {t(
            "Include in this estimate/bill",
            "ඇස්තමේන්තුවට / බිල්පතට ඇතුළත් කරන්න",
          )}
        </label>
      </div>
      <label>
        {t("Work section", "වැඩ කොටස")}
        <select
          aria-label={t("Work section", "වැඩ කොටස")}
          value={line.category}
          onChange={(e) => onChange({ category: e.target.value })}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {language === "si" ? sectionSinhala[c] : c}
            </option>
          ))}
        </select>
      </label>
      <div className="grouped-description">
        <RepairItemCombobox
          id={"catalogue-item-" + line.id}
          label={t(
            `Item ${index + 1} description`,
            `අයිතම ${index + 1} විස්තරය`,
          )}
          value={line.description}
          language={language}
          suggestions={suggestions}
          onChange={(description) => onChange({ description })}
          onSelect={(entry) => onChange(catalogueSelection(entry))}
        />
        {saveSharedItem &&
          line.description.trim() &&
          !suggestions.some(
            (s) =>
              s.source !== "history" &&
              [s.description, ...s.aliases].some(
                (d) =>
                  normalizeCatalogueText(d) ===
                  normalizeCatalogueText(line.description),
              ),
          ) && (
            <button
              type="button"
              className="catalogue-share-action"
              disabled={sharing}
              onClick={async () => {
                setSharing(true);
                setShareMessage("");
                try {
                  await saveSharedItem(line);
                  setShareMessage(
                    t(
                      "Saved to the shared catalogue.",
                      "පොදු නාමාවලියට සුරැකිණි.",
                    ),
                  );
                } catch (e) {
                  setShareMessage((e as Error).message);
                } finally {
                  setSharing(false);
                }
              }}
            >
              {sharing
                ? t("Saving…", "සුරකිමින්…")
                : t(
                    "Save as a shared suggestion",
                    "පොදු යෝජනාවක් ලෙස සුරකින්න",
                  )}
            </button>
          )}
        {shareMessage && <small role="status">{shareMessage}</small>}
      </div>
      <label>
        {t("Position (optional)", "ස්ථානය (විකල්ප)")}
        <input
          list={"repair-positions-" + line.id}
          maxLength={60}
          value={line.position || ""}
          onChange={(e) => onChange({ position: e.target.value })}
        />
        <datalist id={"repair-positions-" + line.id}>
          <option>LHS</option>
          <option>RHS</option>
          <option>Front</option>
          <option>Rear</option>
        </datalist>
      </label>
      {line.agreed_minor != null && (
        <p className="tenuli-note">
          {t("Accepted line amount", "පිළිගත් අයිතම මුදල")}:{" "}
          {money(line.agreed_minor)}.{" "}
          {t(
            "Original unit quotation is retained below.",
            "මුල් ඒකක මිල පහත රැකී ඇත.",
          )}{" "}
          <button
            type="button"
            onClick={() =>
              onChange({ agreed_minor: null, price_review_id: null })
            }
          >
            {t(
              "Return to quoted pricing for this revision",
              "මෙම සංශෝධනයට මුල් මිල භාවිත කරන්න",
            )}
          </button>
        </p>
      )}
      <div className="grouped-numbers">
        <label>
          {t("Quantity", "ප්‍රමාණය")}
          <input
            type="number"
            aria-label={t("Quantity", "ප්‍රමාණය")}
            disabled={line.agreed_minor != null}
            required
            min="0.001"
            max="100000"
            step="0.001"
            value={Number.isFinite(line.quantity) ? line.quantity : ""}
            onChange={(e) =>
              onChange({
                quantity: e.target.value === "" ? NaN : Number(e.target.value),
              })
            }
          />
        </label>
        <label>
          {t("Unit price (LKR)", "ඒකක මිල (රු.)")}
          <input
            type="number"
            aria-label={t("Unit price (LKR)", "ඒකක මිල (රු.)")}
            disabled={line.agreed_minor != null}
            min="0"
            step="0.01"
            placeholder="M/R"
            key={String(line.price_review_id || "quote")}
            defaultValue={
              line.unit_minor == null ? "" : (line.unit_minor / 100).toFixed(2)
            }
            onChange={(e) => changeMoney("unit_minor", e.target.value)}
            aria-invalid={invalid.unit_minor || undefined}
          />
        </label>
        <label>
          {t("Discount (LKR)", "වට්ටම (රු.)")}
          <input
            type="number"
            aria-label={t("Discount (LKR)", "වට්ටම (රු.)")}
            disabled={line.agreed_minor != null}
            required
            min="0"
            step="0.01"
            key={String(line.price_review_id || "quote")}
            defaultValue={(line.discount_minor / 100).toFixed(2)}
            onChange={(e) => changeMoney("discount_minor", e.target.value)}
            aria-invalid={invalid.discount_minor || undefined}
          />
        </label>
        <div className="grouped-row-amount">
          <small>{t("Amount", "මුදල")}</small>
          <strong>
            {line.excluded ? t("Not included", "ඇතුළත් කර නැත") : amount}
          </strong>
        </div>
      </div>
      {Object.values(invalid).some(Boolean) && (
        <p role="alert" className="error">
          {t(
            "Enter valid prices with up to two decimal places.",
            "දශම ස්ථාන දෙකක් දක්වා නිවැරදි මුදල් ඇතුළත් කරන්න.",
          )}
        </p>
      )}
      <details className="more-details full">
        <summary>{t("More details", "වැඩි විස්තර")}</summary>
        <div className="form-grid">
          <label>
            {t("Unit", "ඒකකය")}
            <input
              value={line.unit}
              maxLength={30}
              onChange={(e) => onChange({ unit: e.target.value })}
            />
          </label>
          <label>
            {t("Customer-facing item notes", "පාරිභෝගික අයිතම සටහන්")}
            <textarea
              value={line.notes || ""}
              maxLength={500}
              onChange={(e) => onChange({ notes: e.target.value })}
            />
          </label>
          <label>
            {t("Internal note", "අභ්‍යන්තර සටහන")}
            <textarea
              maxLength={1000}
              value={line.internal_note || ""}
              onChange={(e) => onChange({ internal_note: e.target.value })}
            />
          </label>
          <label>
            {t(
              "Unverified reference code / annotation",
              "තහවුරු නොකළ කේතය / සටහන",
            )}
            <textarea
              maxLength={500}
              value={line.unverified_note || ""}
              onChange={(e) => onChange({ unverified_note: e.target.value })}
            />
            <small>
              {t(
                "For example R/C. No meaning or charge is inferred. Confirm any transcription with authorized staff.",
                "උදා: R/C. අර්ථයක් හෝ ගාස්තුවක් අනුමාන නොකරයි. බලය ලත් නිලධාරියෙකු තහවුරු කළ යුතුයි.",
              )}
            </small>
          </label>
        </div>
      </details>
      <div className="grouped-row-actions">
        <button
          type="button"
          disabled={first}
          onClick={() => onMove(-1)}
          aria-label="Move item up"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={last}
          onClick={() => onMove(1)}
          aria-label="Move item down"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={() => {
            const input = document.getElementById(
              "catalogue-item-" + line.id,
            ) as HTMLInputElement | null;
            input?.focus();
            input?.select();
          }}
        >
          {t("Edit", "සංස්කරණය")}
        </button>
        <button type="button" disabled={!removable} onClick={onRemove}>
          {t("Remove", "ඉවත් කරන්න")}
        </button>
      </div>
    </div>
  );
}
export default function GroupedRepairEditor({
  lines,
  setLines,
  jobs,
  language,
  sharedCatalogue = [],
  saveSharedItem,
}: {
  lines: RepairLine[];
  setLines: React.Dispatch<React.SetStateAction<RepairLine[]>>;
  jobs: Row[];
  language: string;
  sharedCatalogue?: CatalogueEntry[];
  saveSharedItem?: (line: RepairLine) => Promise<unknown>;
}) {
  const t = (en: string, si: string) => (language === "si" ? si : en);
  let total: ReturnType<typeof previewRepair> | undefined;
  let error = "";
  try {
    total = previewRepair(lines);
  } catch (e) {
    error = (e as Error).message;
  }
  const suggestionsBySection = useMemo(
    () =>
      Object.fromEntries(
        categories.map((c) => [
          c,
          catalogueSuggestions(c, jobs, sharedCatalogue),
        ]),
      ),
    [jobs, sharedCatalogue],
  );
  const ordered = categories.flatMap((c) =>
    lines.filter((l) => l.category === c),
  );
  return (
    <div className="grouped-editor">
      <p className="tenuli-note">
        {t(
          "Each section includes 100 catalogue suggestions. Search or choose Other / Custom item. Prices are entered separately; M/R means price pending. Add only the work needed and avoid charging again for work already included in a package.",
          "එක් වැඩ කොටසකට නාමාවලි යෝජනා 100ක් ඇත. සොයන්න හෝ වෙනත් / ඔබගේ අයිතමයක් තෝරන්න. මිල වෙනම ඇතුළත් කරන්න; M/R යනු මිල තහවුරු කර නැති බවයි. පැකේජයට ඇතුළත් වැඩ සඳහා නැවත අය නොකරන්න.",
        )}
      </p>
      <label>
        {t("Add work section", "වැඩ කොටසක් එකතු කරන්න")}
        <select
          value=""
          disabled={lines.length >= 200}
          onChange={(e) => {
            if (e.target.value)
              setLines((ls) => [...ls, blank(e.target.value)]);
          }}
        >
          <option value="">{t("Choose a section…", "කොටසක් තෝරන්න…")}</option>
          {categories.map((c) => (
            <option value={c} key={c}>
              {language === "si" ? sectionSinhala[c] : c}
            </option>
          ))}
        </select>
      </label>
      {categories
        .filter((c) => lines.some((l) => l.category === c))
        .map((category) => {
          const items = lines.filter((l) => l.category === category);
          return (
            <section
              className="grouped-editor-section"
              key={category}
              data-section={category}
            >
              <header>
                <div>
                  <h3>
                    {language === "si" ? sectionSinhala[category] : category}
                  </h3>
                  <small>
                    {items.length} {t("item(s)", "අයිතම")}
                  </small>
                </div>
                <button
                  type="button"
                  disabled={lines.length >= 200}
                  onClick={() => setLines((ls) => [...ls, blank(category)])}
                >
                  {t("Add item", "අයිතමයක් එකතු කරන්න")}
                </button>
              </header>
              {!items.length && (
                <p className="muted">
                  {t(
                    "Add an item when this work is needed.",
                    "මෙම වැඩ අවශ්‍ය නම් අයිතමයක් එකතු කරන්න.",
                  )}
                </p>
              )}
              {items.map((line) => (
                <ItemRow
                  key={line.id}
                  line={line}
                  index={ordered.indexOf(line)}
                  language={language}
                  suggestions={suggestionsBySection[category]}
                  saveSharedItem={saveSharedItem}
                  removable={lines.length > 1}
                  first={items[0] === line}
                  last={items.at(-1) === line}
                  onMove={(by) =>
                    setLines((ls) => {
                      const next = [...ls],
                        a = next.findIndex((l) => l.id === line.id),
                        b = next.findIndex(
                          (l) => l.id === items[items.indexOf(line) + by].id,
                        );
                      [next[a], next[b]] = [next[b], next[a]];
                      return next;
                    })
                  }
                  onChange={(p) =>
                    setLines((ls) =>
                      ls.map((l) => (l.id === line.id ? { ...l, ...p } : l)),
                    )
                  }
                  onRemove={() =>
                    setLines((ls) => ls.filter((l) => l.id !== line.id))
                  }
                />
              ))}
            </section>
          );
        })}
      <section className="grouped-live-summary" aria-live="polite">
        <h3>{t("Customer total preview", "පාරිභෝගික මුදල් පෙරදසුන")}</h3>
        {categories.map((c) => {
          const items = lines.filter((l) => l.category === c && !l.excluded);
          if (!items.length) return null;
          let value;
          try {
            value = previewRepair(items);
          } catch {
            return null;
          }
          return (
            <div key={c}>
              <span>
                {language === "si" ? sectionSinhala[c] : c}
                {value.pending > 0
                  ? " · " + t("Prices pending", "මිල තහවුරු කර නැත")
                  : ""}
              </span>
              <b>{money(value.total_minor)}</b>
            </div>
          );
        })}
        {error ? (
          <p className="error">{error}</p>
        ) : (
          <div className="grouped-grand-total">
            <span>
              {total?.pending
                ? t("Known-price subtotal", "තහවුරු කළ මුළු මුදල")
                : t("Total", "මුළු මුදල")}
            </span>
            <strong>{money(total?.total_minor || 0)}</strong>
          </div>
        )}
        {!!total?.pending && (
          <p>
            {t(
              "M/R = price pending. The known total includes priced items only.",
              "M/R = මිල තහවුරු කර නැත. තහවුරු කළ මුළු මුදලට මිල දන්නා අයිතම පමණක් ඇතුළත් වේ.",
            )}
          </p>
        )}
      </section>
    </div>
  );
}
