import { useMemo, useState } from "react";
import {
  INFRASTRUCTURE_KINDS,
  type InfrastructureCollection,
  type InfrastructureKind,
  type OperationalPointsCollection,
  PrimaryLocationsCollection,
  SectionOfLineCollection,
  TunnelsCollection,
  type OperationalPointWikidataMap,
  type WifiCounts,
} from "@carto-rinf/shared-types";
import {
  LEGEND_ENTRIES,
  OTHER_COLOR,
  OTHER_LABEL,
  presentOpTypeKeys,
} from "../map/opTypeColors";
import { INFRA_LABELS, INFRA_SHAPES, SHAPE_PATHS } from "../map/infrastructureMarkers";
import { tallyWifi, WIFI_KEYS, WIFI_LABELS, type WifiKey } from "../map/wifi";

/** The marker shape of an infrastructure layer, as drawn on the map. */
export function InfraShape({ kind, size = 12 }: { kind: InfrastructureKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={SHAPE_PATHS[INFRA_SHAPES[kind]]} fill="var(--infra-ink)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}

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
  /** Opt-in infrastructure layers that are on (and loaded). */
  infrastructure: Partial<Record<InfrastructureKind, InfrastructureCollection>>;
  /** Sections are explained by the colour legend instead while coloured. */
  sectionsColoured: boolean;
  wifi: WifiLegendProps;
}

export interface WifiLegendProps {
  stations: OperationalPointWikidataMap | undefined;
  status: "loading" | "error" | "ready";
  filter: WifiKey | null;
  onFilter: (filter: WifiKey | null) => void;
  /** This country's RINF stations by Wi-Fi, from the Europe-wide count. */
  countryStations: WifiCounts | undefined;
  europeFree: number | undefined;
  countryLabel: string;
  onOpenEurope: () => void;
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
  infrastructure,
  sectionsColoured,
  wifi,
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
  const hasRealSections =
    !sectionsColoured && sectionsOfLine.features.some((f) => !f.properties.geometryIsApproximate);
  const hasApproxSections =
    !sectionsColoured && sectionsOfLine.features.some((f) => f.properties.geometryIsApproximate);
  const hasSectionsOfLine = hasRealSections || hasApproxSections;
  const infraShown = INFRASTRUCTURE_KINDS.filter((k) => infrastructure[k]);
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
        background: "var(--surface-translucent)",
        borderRadius: 6,
        fontSize: 12,
        fontFamily: "sans-serif",
        color: "var(--text)",
        boxShadow: "var(--shadow-md)",
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
        <span style={{ color: "var(--text-subtle)" }}>{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && (
        <div style={{ padding: "0 10px 10px" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            Operational point type
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-subtle)", marginBottom: 4 }}>
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
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--divider)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: entry.color,
                    border: "1px solid var(--surface)",
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
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--divider)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: OTHER_COLOR,
                  border: "1px solid var(--surface)",
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

          <WifiSection points={operationalPoints} {...wifi} />

          {(hasSectionsOfLine || hasTunnels || hasPrimaryLocations || infraShown.length > 0) && (
            <div style={{ fontWeight: 700, marginTop: 8, marginBottom: 4 }}>
              Lines &amp; markers
            </div>
          )}
          {hasRealSections && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 16,
                  height: 0,
                  borderTop: "2px solid var(--map-section)",
                  flexShrink: 0,
                }}
              />
              <span>Section of line</span>
            </div>
          )}
          {hasApproxSections && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 16,
                  height: 0,
                  borderTop: "2px dashed var(--map-section)",
                  flexShrink: 0,
                }}
              />
              <span>Section of line (straight line: no real alignment in RINF)</span>
            </div>
          )}
          {hasTunnels && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 16,
                  height: 0,
                  borderTop: "3px solid var(--map-tunnel)",
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
              <span>...matched to a Wikidata station</span>
            </div>
          )}
          {infraShown.map((kind) => (
            <div key={kind} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <InfraShape kind={kind} />
              <span>
                {INFRA_LABELS[kind]}{" "}
                <span style={{ color: "var(--text-muted)" }}>
                  ({infrastructure[kind]!.features.length.toLocaleString()})
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The Wi-Fi filter: one row per Wi-Fi access recorded in Wikidata, with the
 *  number of this country's operational points; clicking a row shows only
 *  those points, clicking it again shows all. Below, the station count
 *  answers "how many stations have free Wi-Fi", here and Europe-wide. */
function WifiSection({
  points,
  stations,
  status,
  filter,
  onFilter,
  countryStations,
  europeFree,
  countryLabel,
  onOpenEurope,
}: WifiLegendProps & { points: OperationalPointsCollection }) {
  const tally = useMemo(() => tallyWifi(points, stations), [points, stations]);
  // Free Wi-Fi is always listed (a zero is an answer); other rows only
  // when some point has them, and the active filter always.
  const keys = WIFI_KEYS.filter((k) => k === "free" || k === filter || tally.counts[k] > 0);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>Wi-Fi in Wikidata</div>
      {status === "loading" && (
        <div style={{ fontSize: 10.5, color: "var(--text-subtle)" }}>Matching Wikidata stations…</div>
      )}
      {status === "error" && (
        <div style={{ fontSize: 10.5, color: "var(--text-subtle)" }}>Wikidata unavailable: no Wi-Fi filter.</div>
      )}
      {status === "ready" && (
        <>
          <div style={{ fontSize: 10.5, color: "var(--text-subtle)", marginBottom: 4 }}>
            Points matched to Wikidata: {tally.matched.toLocaleString()} of {tally.total.toLocaleString()}. Click
            a row to show only those.
          </div>
          {keys.map((key) => {
            const active = filter === key;
            return (
              <button
                key={key}
                aria-pressed={active}
                onClick={() => onFilter(active ? null : key)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 6,
                  marginTop: 2,
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "2px 4px",
                  border: "none",
                  background: active ? "var(--divider)" : "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "inherit",
                  color: "inherit",
                  fontWeight: active ? 700 : 400,
                  textAlign: "left",
                  opacity: filter && !active ? 0.55 : 1,
                }}
              >
                <span>{WIFI_LABELS[key]}</span>
                <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                  {tally.counts[key].toLocaleString()}
                </span>
              </button>
            );
          })}
          {filter && (
            <button
              onClick={() => onFilter(null)}
              style={{
                marginTop: 2,
                padding: "2px 4px",
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: 11,
                fontFamily: "inherit",
                color: "var(--link)",
              }}
            >
              Show all points
            </button>
          )}
        </>
      )}
      <div style={{ fontSize: 11, marginTop: 4 }}>
        Stations with free Wi-Fi:{" "}
        {countryStations ? (
          <strong>
            {countryStations.free.toLocaleString()} in {countryLabel}
          </strong>
        ) : (
          "…"
        )}
        {" · "}
        <button
          onClick={onOpenEurope}
          style={{
            padding: 0,
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: 11,
            fontFamily: "inherit",
            color: "var(--link)",
          }}
        >
          {europeFree !== undefined ? `${europeFree.toLocaleString()} in Europe ›` : "Europe ›"}
        </button>
      </div>
    </div>
  );
}
