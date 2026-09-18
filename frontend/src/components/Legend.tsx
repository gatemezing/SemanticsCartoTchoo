import { useState } from "react";
import type {
  OperationalPointsCollection,
  PrimaryLocationsCollection,
  SectionOfLineCollection,
  TunnelsCollection,
} from "@carto-rinf/shared-types";
import {
  LEGEND_ENTRIES,
  OTHER_COLOR,
  OTHER_LABEL,
  presentOpTypeKeys,
} from "../map/opTypeColors";

const LEGEND_COLLAPSED_KEY = "cartoRinf.legendCollapsed";

function readCollapsedPreference(): boolean {
  try {
    return localStorage.getItem(LEGEND_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

interface Props {
  operationalPoints: OperationalPointsCollection;
  sectionsOfLine: SectionOfLineCollection;
  tunnels: TunnelsCollection;
  primaryLocations: PrimaryLocationsCollection;
  hiddenOpTypeKeys: Set<string>;
  onToggleOpTypeKeys: (keys: string[]) => void;
}

/** Every color here is always paired with this visible text label — colors
 *  from the dataviz skill's categorical palette are only fully separable
 *  pairwise up to a handful of simultaneous series, so the label (not the
 *  hue) is the authoritative way to identify a type. Rows are collapsible
 *  (it was eating a large chunk of map real estate at full size), only
 *  list categories that actually occur in the loaded country's data, and
 *  double as a filter: click a row to hide/show that type on the map. */
export function Legend({
  operationalPoints,
  sectionsOfLine,
  tunnels,
  primaryLocations,
  hiddenOpTypeKeys,
  onToggleOpTypeKeys,
}: Props) {
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LEGEND_COLLAPSED_KEY, String(next));
      } catch {
        // per-viewer convenience only — fine if it doesn't persist
      }
      return next;
    });
  };

  const present = presentOpTypeKeys(operationalPoints);
  const pointEntries = LEGEND_ENTRIES.filter((e) =>
    e.keys.some((k) => present.has(k)),
  );
  const hasOther = present.has(OTHER_LABEL);
  const hasSectionsOfLine = sectionsOfLine.features.length > 0;
  const hasTunnels = tunnels.features.length > 0;
  const hasPrimaryLocations = primaryLocations.features.length > 0;
  const hasWikidataEnrichment = primaryLocations.features.some(
    (f) => f.properties.wikidata,
  );

  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        left: 12,
        background: "rgba(255,255,255,0.95)",
        borderRadius: 6,
        fontSize: 12,
        fontFamily: "sans-serif",
        color: "#1f2937",
        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        maxWidth: 220,
        overflow: "hidden",
      }}
    >
      <button
        onClick={toggleCollapsed}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          boxSizing: "border-box",
          padding: "8px 10px",
          border: "none",
          background: "none",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: 12,
          color: "inherit",
          fontFamily: "inherit",
        }}
      >
        <span>Legend</span>
        <span style={{ color: "#9ca3af" }}>{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && (
        <div style={{ padding: "0 10px 10px" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Operational point type
          </div>
          <div style={{ fontSize: 10.5, color: "#9ca3af", marginBottom: 4 }}>
            Click a row to hide/show it on the map
          </div>
          {pointEntries.map((entry) => {
            const hidden = entry.keys.some((k) => hiddenOpTypeKeys.has(k));
            return (
              <button
                key={entry.label}
                onClick={() => onToggleOpTypeKeys(entry.keys)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 2,
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "2px 4px",
                  border: "none",
                  background: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "inherit",
                  color: "inherit",
                  textAlign: "left",
                  opacity: hidden ? 0.4 : 1,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: entry.color,
                    border: "1px solid white",
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ textDecoration: hidden ? "line-through" : "none" }}>
                  {entry.label}
                </span>
              </button>
            );
          })}
          {hasOther && (
            <button
              onClick={() => onToggleOpTypeKeys([OTHER_LABEL])}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 2,
                width: "100%",
                boxSizing: "border-box",
                padding: "2px 4px",
                border: "none",
                background: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
                fontFamily: "inherit",
                color: "inherit",
                textAlign: "left",
                opacity: hiddenOpTypeKeys.has(OTHER_LABEL) ? 0.4 : 1,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: OTHER_COLOR,
                  border: "1px solid white",
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  textDecoration: hiddenOpTypeKeys.has(OTHER_LABEL)
                    ? "line-through"
                    : "none",
                }}
              >
                {OTHER_LABEL}
              </span>
            </button>
          )}

          {(hasSectionsOfLine || hasTunnels || hasPrimaryLocations) && (
            <div style={{ fontWeight: 700, marginTop: 8, marginBottom: 4 }}>
              Lines &amp; markers
            </div>
          )}
          {hasSectionsOfLine && (
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
          )}
          {hasTunnels && (
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
          )}
          {hasPrimaryLocations && (
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
          )}
          {hasWikidataEnrichment && (
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
          )}
        </div>
      )}
    </div>
  );
}
