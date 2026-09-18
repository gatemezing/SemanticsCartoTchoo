import type { CountryInfo } from "@carto-rinf/shared-types";

interface Props {
  countries: CountryInfo[];
  value: string;
  onChange: (code: string) => void;
}

export function CountrySelector({ countries, value, onChange }: Props) {
  const sorted = [...countries].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        // Below MapLibre's own zoom control, which anchors top-right too.
        position: "absolute",
        top: 100,
        right: 12,
        zIndex: 15,
        padding: "8px 10px",
        borderRadius: 6,
        border: "1px solid #d1d5db",
        fontSize: 13,
        fontFamily: "sans-serif",
        background: "white",
        boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
      }}
    >
      {sorted.map((c) => (
        <option key={c.code} value={c.code}>
          {c.label}
        </option>
      ))}
    </select>
  );
}
