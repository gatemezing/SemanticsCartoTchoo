import { useMemo, useState } from "react";
import type { OperationalPointsCollection } from "@carto-rinf/shared-types";

interface Props {
  operationalPoints: OperationalPointsCollection;
  onSelect: (uopid: string, lon: number, lat: number) => void;
}

const MAX_RESULTS = 8;

export function SearchBox({ operationalPoints, onSelect }: Props) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
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

  return (
    <div style={{ position: "absolute", top: 12, left: 12, width: 260, zIndex: 15 }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a station or uopid…"
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 6,
          border: "1px solid #d1d5db",
          fontSize: 13,
          fontFamily: "sans-serif",
          boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
          boxSizing: "border-box",
        }}
      />
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
          {results.map((f) => {
            const [lon, lat] = f.geometry.coordinates;
            const name =
              f.properties.name.status === "value"
                ? f.properties.name.value
                : "(unnamed)";
            return (
              <button
                key={f.properties.uopid}
                onClick={() => {
                  onSelect(f.properties.uopid, lon, lat);
                  setQuery("");
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 10px",
                  border: "none",
                  borderBottom: "1px solid #f3f4f6",
                  background: "white",
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
    </div>
  );
}
