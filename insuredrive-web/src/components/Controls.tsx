import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import type { Field, Row } from "../lib/types";
export function Badge({ value }: { value: string }) {
  return <span className={"badge " + value}>{value.replaceAll("_", " ")}</span>;
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Table({
  rows,
  columns,
  search = true,
}: {
  rows: Row[];
  columns: { label: string; render: (r: Row) => ReactNode }[];
  search?: boolean;
}) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(0);
  const filtered = rows.filter((r) =>
    JSON.stringify(r).toLowerCase().includes(q.toLowerCase()),
  );
  const max = Math.max(0, Math.ceil(filtered.length / 8) - 1),
    current = Math.min(page, max);
  return (
    <>
      <div className="table-tools">
        {search && (
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Search records"
              placeholder="Search / සොයන්න"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </label>
        )}
        <span className="muted">{filtered.length} records</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(current * 8, current * 8 + 8).map((r, i) => (
              <tr key={r.id || i}>
                {columns.map((c, j) => (
                  <td key={j}>{c.render(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <Empty>No records / වාර්තා නැත</Empty>}
      </div>
      <div className="pagination">
        <span>
          {current + 1} / {max + 1}
        </span>
        <button
          aria-label="Previous page"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          aria-label="Next page"
          disabled={current === max}
          onClick={() => setPage(current + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      d?.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <div className="modal-content">{children}</div>
    </dialog>
  );
}
export function Form({
  fields,
  initial = {},
  onSave,
  onCancel,
  language = "en",
  submit = "Save / සුරකින්න",
  optionalKeys = [],
  fieldGroups = [],
  children,
}: {
  fields: Field[];
  initial?: Row;
  onSave: (v: Row) => Promise<void>;
  onCancel: () => void;
  language?: string;
  submit?: string;
  optionalKeys?: string[];
  fieldGroups?: { title: string; keys: string[] }[];
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submitting = useRef(false);
  const renderFields = (items: Field[]) => (
    <div className="form-grid">
      {items.map((f) => (
        <label key={f.key} className={f.wide ? "full" : ""}>
          <span>
            {language === "si" && f.si ? f.si : f.en}
            {f.required && " *"}
          </span>
          {f.options ? (
            <select
              name={f.key}
              defaultValue={initial[f.key] ?? ""}
              required={f.required}
            >
              <option value="">Select / තෝරන්න</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              name={f.key}
              defaultValue={initial[f.key] ?? ""}
              required={f.required}
              rows={3}
              maxLength={f.maxLength}
            />
          ) : (
            <input
              type={f.type || "text"}
              required={f.required}
              min={f.min}
              maxLength={f.maxLength}
              step={f.step || "any"}
              name={f.key}
              defaultValue={initial[f.key] ?? ""}
            />
          )}
          {f.hint && <small>{f.hint}</small>}
        </label>
      ))}
    </div>
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (submitting.current) return;
        submitting.current = true;
        setBusy(true);
        setError("");
        try {
          const values = Object.fromEntries(new FormData(e.currentTarget));
          await onSave({ ...initial, ...values });
        } catch (e) {
          setError((e as Error).message);
        } finally {
          submitting.current = false;
          setBusy(false);
        }
      }}
    >
      {fieldGroups.map((g) => (
        <section className="estimate-info-group" key={g.keys.join(":")}>
          <h3>{g.title}</h3>
          {renderFields(fields.filter((f) => g.keys.includes(f.key)))}
        </section>
      ))}
      {renderFields(
        fields.filter(
          (f) =>
            !optionalKeys.includes(f.key) &&
            !fieldGroups.some((g) => g.keys.includes(f.key)),
        ),
      )}
      {fields.some((f) => optionalKeys.includes(f.key)) && (
        <details
          className="more-details"
          onInvalidCapture={(e) => {
            e.currentTarget.open = true;
          }}
        >
          <summary>
            {language === "si" ? "වැඩි විස්තර" : "More details"}
          </summary>
          {renderFields(fields.filter((f) => optionalKeys.includes(f.key)))}
        </details>
      )}
      {children}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <footer className="form-actions">
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel / අවලංගු
        </button>
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : submit}
        </button>
      </footer>
    </form>
  );
}
