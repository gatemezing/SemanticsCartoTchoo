interface Props {
  label: string;
  value: string;
  muted?: boolean;
}

/** One label/value line in a detail panel. `muted` renders the value in the
 *  same subdued italic style used everywhere for "Not available in RINF" /
 *  "Not applicable" — a real, visible state rather than a blank field. */
export function FieldRow({ label, value, muted = false }: Props) {
  return (
    <div style={{ marginBottom: 8, fontSize: 13 }}>
      <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}>
        {label}
      </div>
      <div style={muted ? { color: "#9ca3af", fontStyle: "italic" } : undefined}>
        {value}
      </div>
    </div>
  );
}
