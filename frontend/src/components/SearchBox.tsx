import { useMemo, useState } from "react";
import type { OperationalPointsCollection } from "@carto-rinf/shared-types";

interface Props {
  operationalPoints: OperationalPointsCollection;
  onSelect: (uopid: string, lon: number, lat: number) => void;
}

const MAX_RESULTS = 8;
const MIN_QUERY_LENGTH = 2;

export function SearchBox({ operationalPoints, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < MIN_QUERY_LENGTH) return [];
    return operationalPoints.features
      .filter((f) => {
        const name =
          f.properties.name.status === "value"
            ? f.properties.name.value.toLowerCase()
            : "";
        return name.includes(q) || f.properties.uopid.toLowerCase().includes(q);
      })
      .slice(0, MAX_RESULTS);
  }, [query, operationalPoints]);

  const showNoResults =
    query.trim().length >= MIN_QUERY_LENGTH && results.length === 0;

  function pick(index: number) {
    const f = results[index];
    if (!f) return;
    const [lon, lat] = f.geometry.coordinates;
    onSelect(f.properties.uopid, lon, lat);
    setQuery("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(highlighted);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  }

  return (
    <div style={{ position: "absolute", top: 12, left: 12, width: 260, zIndex: 15 }}>
      <div style={{ position: "relative" }}>
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 14,
            color: "#9ca3af",
            pointerEvents: "none",
          }}
        >
          🔍
        </span>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search a station or uopid…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "8px 10px 8px 30px",
            borderRadius: 6,
            border: "1px solid #d1d5db",
            fontSize: 13,
            fontFamily: "sans-serif",
            boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
          }}
        />
      </div>

      {results.length > 0 && (
        <div
          style={{
            marginTop: 4,
            background: "white",
            borderRadius: 6,
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            overflow: "hidden",
            fontFamily: "sans-serif",
            fontSize: 13,
          }}
        >
          {results.map((f, i) => {
            const name =
              f.properties.name.status === "value"
                ? f.properties.name.value
                : "(unnamed)";
            return (
              <button
                key={f.properties.uopid}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 10px",
                  border: "none",
                  borderBottom: "1px solid #f3f4f6",
                  background: i === highlighted ? "#eff6ff" : "white",
                  cursor: "pointer",
                }}
              >
                <div>{name}</div>
                <div style={{ color: "#6b7280", fontSize: 11 }}>
                  {f.properties.uopid}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showNoResults && (
        <div
          style={{
            marginTop: 4,
            background: "white",
            borderRadius: 6,
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            fontFamily: "sans-serif",
            fontSize: 12,
            color: "#6b7280",
            padding: "8px 10px",
          }}
        >
          No station or uopid matches "{query.trim()}" in this country.
        </div>
      )}
    </div>
  );
}
