import { useEffect, useRef, useState } from "react";
import type { CountryInfo } from "@carto-rinf/shared-types";
import { countryFlagEmoji } from "./countryFlag";

interface Props {
  countries: CountryInfo[];
  value: string;
  onChange: (code: string) => void;
}

/** A native <select> doesn't scale to 28 countries — finding one means
 *  scrolling an alphabetical list. This is a searchable combobox instead:
 *  click to open, type to filter, arrow keys + Enter to pick. Flags (built
 *  from the ISO2 code, no image assets) make the closed/list rows scannable
 *  at a glance rather than reading full country names. */
export function CountrySelector({ countries, value, onChange }: Props) {
  const sorted = [...countries].sort((a, b) => a.label.localeCompare(b.label));
  const current = sorted.find((c) => c.code === value);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = query.trim()
    ? sorted.filter((c) =>
        c.label.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : sorted;

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function openDropdown() {
    setOpen(true);
    setQuery("");
    setHighlighted(0);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function select(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) select(filtered[highlighted].code);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div
      ref={containerRef}
      style={{
        // Below MapLibre's own zoom control, which anchors top-right too.
        position: "absolute",
        top: 100,
        right: 12,
        zIndex: 15,
        width: 220,
        fontFamily: "sans-serif",
      }}
    >
      {open ? (
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search a country…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #2563eb",
            fontSize: 13,
            boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
          }}
        />
      ) : (
        <button
          onClick={openDropdown}
          style={{
            width: "100%",
            boxSizing: "border-box",
            textAlign: "left",
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            fontSize: 13,
            background: "white",
            cursor: "pointer",
            boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>
            {current
              ? `${countryFlagEmoji(current.code)} ${current.label}`
              : "Select a country"}
          </span>
          <span style={{ color: "#9ca3af" }}>▾</span>
        </button>
      )}

      {open && (
        <div
          style={{
            marginTop: 4,
            maxHeight: 260,
            overflowY: "auto",
            background: "white",
            borderRadius: 6,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          {filtered.length === 0 && (
            <div style={{ padding: "8px 10px", fontSize: 12, color: "#6b7280" }}>
              No country matches "{query}"
            </div>
          )}
          {filtered.map((c, i) => (
            <button
              key={c.code}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(c.code)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                border: "none",
                borderBottom: "1px solid #f3f4f6",
                background:
                  i === highlighted
                    ? "#eff6ff"
                    : c.code === value
                      ? "#f9fafb"
                      : "white",
                fontWeight: c.code === value ? 700 : 400,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {countryFlagEmoji(c.code)} {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
