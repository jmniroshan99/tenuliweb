import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { searchCatalogue, type Suggestion } from "../lib/repair-catalogue";
import "../repair-catalogue.css";

type Props = {
  id: string;
  label: string;
  value: string;
  language: string;
  suggestions: Suggestion[];
  onChange: (description: string) => void;
  onSelect: (entry: Suggestion) => void;
};

const PAGE_SIZE = 20;

/** Free text remains the stored value; catalogue selection never sets a price. */
export default function RepairItemCombobox({
  id,
  label,
  value,
  language,
  suggestions,
  onChange,
  onSelect,
}: Props) {
  const t = (en: string, si: string) => (language === "si" ? si : en);
  const input = useRef<HTMLInputElement>(null);
  const skipFocusOpen = useRef(false);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [active, setActive] = useState(-1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const matches = useMemo(
    () => searchCatalogue(suggestions, value),
    [suggestions, value],
  );
  const visible = matches.slice(0, limit);
  const listId = `${id}-options`;
  const helpId = `${id}-help`;
  const activeIndex =
    open && active >= 0 && active < visible.length ? active : -1;

  useEffect(() => {
    if (open && activeIndex >= 0)
      optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function focusInput(keepClosed = false) {
    if (input.current && document.activeElement !== input.current) {
      skipFocusOpen.current = keepClosed;
      input.current.focus();
    }
  }

  function choose(entry: Suggestion) {
    onSelect(entry);
    setOpen(false);
    setCustom(false);
    setActive(-1);
    focusInput(true);
  }

  function browse() {
    setCustom(false);
    setOpen(true);
    setLimit(PAGE_SIZE);
    setActive(-1);
    focusInput();
  }

  function move(index: number) {
    const next = Math.max(0, Math.min(index, matches.length - 1));
    setActive(matches.length ? next : -1);
    setLimit((current) =>
      Math.max(current, PAGE_SIZE * (1 + Math.floor(next / PAGE_SIZE))),
    );
  }

  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setActive(-1);
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setCustom(false);
      setOpen(true);
      move(
        !open || activeIndex < 0
          ? e.key === "ArrowDown"
            ? 0
            : matches.length - 1
          : activeIndex + (e.key === "ArrowDown" ? 1 : -1),
      );
      return;
    }
    if (!open) return;
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      move(e.key === "Home" ? 0 : matches.length - 1);
    } else if (e.key === "Enter") {
      // Selecting or dismissing a result must never submit the estimate form.
      e.preventDefault();
      if (activeIndex >= 0) choose(visible[activeIndex]);
      else setOpen(false);
    }
  }

  return (
    <div
      className="grouped-description repair-item-combobox"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      <label htmlFor={id}>
        {t(
          "Service / part — search or enter your own",
          "සේවාව / කොටස — සොයන්න හෝ ඇතුළත් කරන්න",
        )}
      </label>
      <div className="repair-catalogue-input">
        <Search size={17} aria-hidden="true" />
        <input
          id={id}
          ref={input}
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
          }
          aria-describedby={helpId}
          autoComplete="off"
          required
          maxLength={300}
          value={value}
          placeholder={t("Search parts and services…", "කොටස් සහ සේවා සොයන්න…")}
          onFocus={() => {
            if (skipFocusOpen.current) {
              skipFocusOpen.current = false;
              return;
            }
            if (!custom) setOpen(true);
          }}
          onChange={(e) => {
            onChange(e.target.value);
            setLimit(PAGE_SIZE);
            setActive(-1);
            if (!custom) setOpen(true);
          }}
          onKeyDown={keyDown}
        />
        {value && (
          <button
            type="button"
            className="repair-catalogue-icon"
            aria-label={t("Clear item description", "අයිතම විස්තරය හිස් කරන්න")}
            onClick={() => {
              onChange("");
              setActive(-1);
              setLimit(PAGE_SIZE);
              setOpen(!custom);
              focusInput(custom);
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="repair-catalogue-icon"
          aria-label={t("Browse item suggestions", "අයිතම යෝජනා බලන්න")}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => {
            if (open) {
              setOpen(false);
              setActive(-1);
            } else browse();
          }}
        >
          <ChevronDown size={17} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div className="repair-catalogue-panel">
          <div
            className="repair-catalogue-results"
            role="status"
            aria-live="polite"
          >
            {matches.length
              ? `${matches.length} ${t("matching suggestions", "ගැළපෙන යෝජනා")}`
              : t(
                  "No matching suggestions. Use Other / Custom item or type your own description.",
                  "ගැළපෙන යෝජනා නොමැත. ඔබගේ විස්තරය ඇතුළත් කරන්න.",
                )}
          </div>
          <ul
            id={listId}
            role="listbox"
            aria-label={t(
              "Service and part suggestions",
              "සේවා සහ කොටස් යෝජනා",
            )}
          >
            {visible.map((entry, index) => (
              <li
                key={entry.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={activeIndex === index}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                className={activeIndex === index ? "active" : ""}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(entry)}
              >
                <span>
                  {language === "si" && entry.descriptionSi
                    ? entry.descriptionSi
                    : entry.description}
                </span>
                {language === "si" && entry.descriptionSi && (
                  <small>{entry.description}</small>
                )}
              </li>
            ))}
          </ul>
          {visible.length < matches.length && (
            <button
              type="button"
              className="repair-catalogue-more"
              onClick={() => setLimit((current) => current + PAGE_SIZE)}
            >
              {t("Show more", "තවත් බලන්න")} ({visible.length} /{" "}
              {matches.length})
            </button>
          )}
        </div>
      )}
      <div className="repair-catalogue-custom">
        <button
          type="button"
          className={custom ? "is-custom" : ""}
          aria-pressed={custom}
          onClick={() => {
            setCustom(true);
            setOpen(false);
            setActive(-1);
            focusInput(true);
          }}
        >
          {t("Other / Custom item…", "වෙනත් / ඔබගේ අයිතමය…")}
        </button>
        {custom && (
          <button type="button" onClick={browse}>
            {t("Search catalogue", "නාමාවලිය සොයන්න")}
          </button>
        )}
      </div>
      <small id={helpId} className="repair-catalogue-help">
        {custom
          ? t(
              "Enter your own description above. It stays in this work section; enter the price separately.",
              "ඉහත ඔබගේ විස්තරය ඇතුළත් කරන්න. එය මෙම වැඩ කොටසේම පවතී; මිල වෙනම ඇතුළත් කරන්න.",
            )
          : t(
              "Search the catalogue or type your own. Prices are entered separately.",
              "නාමාවලිය සොයන්න හෝ ඔබගේ විස්තරය ඇතුළත් කරන්න. මිල වෙනම ඇතුළත් කරන්න.",
            )}
      </small>
    </div>
  );
}
