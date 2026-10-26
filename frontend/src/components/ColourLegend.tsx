import type { TrackParameterId } from "@carto-rinf/shared-types";
import { type LegendEntry, PARAMETER_LABELS } from "../map/dataColors";

interface Props {
  param: TrackParameterId;
  /** Entries with the number of sections currently on the map for each. */
  entries: (LegendEntry & { count: number })[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}

const NOTES: Record<TrackParameterId, string> = {
  maxSpeed: "Highest permitted speed on the section's running tracks.",
  electrification: "Energy supply of the section's running tracks.",
  gauge: "Nominal track gauge of the section's running tracks.",
  etcsLevel: "ETCS level of the section's running tracks.",
};

/** The key for "colour sections by". Colour never carries a value alone:
 *  every entry has its label and count here, and hovering a section shows
 *  its own value. */
export function ColourLegend({ param, entries, loading, error, onRetry, onClose }: Props) {
  return (
    <div
      role="region"
      aria-label={`Sections coloured by ${PARAMETER_LABELS[param]}`}
      style={{
        background: "var(--surface-translucent)",
        color: "var(--text)",
        borderRadius: 6,
        boxShadow: "var(--shadow-md)",
        padding: "8px 10px",
        fontSize: 12,
        width: 230,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <strong>Sections by {PARAMETER_LABELS[param].toLowerCase()}</strong>
        <button
          onClick={onClose}
          aria-label="Stop colouring sections"
          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14 }}
        >
          ×
        </button>
      </div>
      <div style={{ color: "var(--text-muted)", fontSize: 11, margin: "2px 0 6px" }}>{NOTES[param]}</div>
      {loading && (
        <div style={{ color: "var(--text-muted)" }}>
          Rolling up track data from RINF… (up to ~20 s the first time)
        </div>
      )}
      {error && (
        <div style={{ color: "var(--danger-text)" }}>
          Couldn't load this parameter: {error}{" "}
          <button onClick={onRetry} style={{ font: "inherit", cursor: "pointer" }}>
            Retry
          </button>
        </div>
      )}
      {entries?.map((e) => (
        <div
          key={e.key}
          style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, opacity: e.count === 0 ? 0.5 : 1 }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 18,
              height: 0,
              borderTop: `${e.style === "dashed" ? 2 : 4}px ${e.style} ${e.color}`,
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1 }}>{e.label}</span>
          <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
            {e.count.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
