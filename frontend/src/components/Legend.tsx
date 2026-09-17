import { LEGEND_ENTRIES, OTHER_COLOR, OTHER_LABEL } from "../map/opTypeColors";

const pointEntries = [...LEGEND_ENTRIES, [OTHER_LABEL, OTHER_COLOR] as const];

/** Every color here is always paired with this visible text label — colors
 *  from the dataviz skill's categorical palette are only fully separable
 *  pairwise up to a handful of simultaneous series, so the label (not the
 *  hue) is the authoritative way to identify a type. */
export function Legend() {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        left: 12,
        background: "rgba(255,255,255,0.92)",
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 12,
        fontFamily: "sans-serif",
        color: "#1f2937",
        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        maxWidth: 220,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Operational point type</div>
      {pointEntries.map(([label, color]) => (
        <div
          key={label}
          style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}
        >
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: color,
              border: "1px solid white",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
              flexShrink: 0,
            }}
          />
          <span>{label}</span>
        </div>
      ))}

      <div style={{ fontWeight: 700, marginTop: 8, marginBottom: 4 }}>Lines &amp; markers</div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
        <span
          style={{
            display: "inline-block",
            width: 16,
            height: 0,
            borderTop: "2px dashed #0f766e",
            flexShrink: 0,
          }}
        />
        <span>Section of line (approximate)</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        <span
          style={{
            display: "inline-block",
            width: 16,
            height: 0,
            borderTop: "3px solid #78350f",
            flexShrink: 0,
          }}
        />
        <span>Tunnel</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        <span
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            borderRadius: "50%",
            border: "1.5px solid #7c3aed",
            flexShrink: 0,
          }}
        />
        <span>Primary location (ring around a point)</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        <span
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            borderRadius: "50%",
            border: "2.5px solid #d97706",
            flexShrink: 0,
          }}
        />
        <span>...with Wikidata accessibility info</span>
      </div>
    </div>
  );
}
