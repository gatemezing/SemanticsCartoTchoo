import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LineProfile, TrackParameterId } from "@carto-rinf/shared-types";
import { fetchLineProfile, fetchNationalLines } from "../api/client";
import { downloadText } from "../export/download";
import {
  layoutProfile,
  lineCategories,
  parameterCell,
  type PlacedSegment,
  profileCsv,
  type ProfileLayout,
  speedAxisMax,
  stationLabels,
} from "../lineProfile/layout";
import {
  CASING_COLOR,
  CATEGORY_SLOTS,
  categoricalScale,
  type ColourScale,
  NO_DATA_COLOR,
  PARAMETER_LABELS,
} from "../map/dataColors";
import type { ResolvedTheme } from "../theme/theme";
import { fieldValueLabel } from "./fieldValueText";

interface Props {
  country: string;
  lineIri: string | null;
  onChangeLine: (iri: string | null) => void;
  onClose: () => void;
  theme: ResolvedTheme;
  /** Space kept free on the right (the detail panel, when open). */
  rightInset: number;
  onHoverSection: (iri: string | null) => void;
  onSelectSection: (iri: string) => void;
  /** The loaded profile (for the map highlight and framing). */
  onProfile: (profile: LineProfile | null) => void;
}

const CATEGORY_ROWS: TrackParameterId[] = ["electrification", "gauge", "etcsLevel"];

// Chart geometry (px).
const LEFT = 112;
const RIGHT = 14;
const TOP = 30;
const SPEED_H = 64;
const BAND_H = 18;
const ROW_GAP = 8;
const AXIS_H = 26;
const CHART_H = TOP + SPEED_H + CATEGORY_ROWS.length * (BAND_H + ROW_GAP) + AXIS_H;

/** A bar with its data end rounded and its baseline end square. */
function barPath(x: number, y: number, w: number, base: number): string {
  const r = Math.min(4, w / 2, (base - y) / 2);
  return `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${base} Z`;
}

/** Tick step in km so labels sit ≥ 70 px apart. */
function kmStep(pxPerKm: number): number {
  return [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => s * pxPerKm >= 70) ?? 1000;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function ProfileChart({
  profile,
  layout,
  theme,
  scales,
  onHover,
  onSelect,
}: {
  profile: LineProfile;
  layout: ProfileLayout;
  theme: ResolvedTheme;
  scales: Record<TrackParameterId, ColourScale | undefined>;
  onHover: (iri: string | null) => void;
  onSelect: (iri: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<{ placed: PlacedSegment; x: number } | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const plotW = width - LEFT - RIGHT;
  const pxPerKm = plotW / Math.max(layout.totalKm, 0.001);
  const xOf = (km: number) => LEFT + km * pxPerKm;
  const speedMax = speedAxisMax(layout);
  const speedBase = TOP + SPEED_H;
  const ySpeed = (v: number) => speedBase - (v / speedMax) * (SPEED_H - 4);
  const bandTop = (i: number) => speedBase + ROW_GAP + i * (BAND_H + ROW_GAP);
  const axisY = bandTop(CATEGORY_ROWS.length) - ROW_GAP + 4;
  const stations = stationLabels(layout, pxPerKm);
  const speedColor = CATEGORY_SLOTS[theme][0];
  const surface = CASING_COLOR[theme];
  const labels = profile.categoryLabels;

  // Ticks restart at 0 for each run: km along that run, not the axis.
  const step = kmStep(pxPerKm);
  const ticks: { x: number; label: string }[] = [];
  const runStarts = new Map<number, number>();
  for (const p of layout.segments) if (!runStarts.has(p.run)) runStarts.set(p.run, p.x0 - p.segment.startKm);
  profile.runs.forEach((run, r) => {
    const start = runStarts.get(r) ?? 0;
    const length = run.at(-1)?.endKm ?? 0;
    for (let km = 0; km <= length + 1e-9; km += step) {
      ticks.push({ x: xOf(start + km), label: `${Number(km.toFixed(1))}` });
    }
  });

  const locate = (clientX: number): { placed: PlacedSegment; x: number } | null => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = clientX - rect.left;
    const km = (x - LEFT) / pxPerKm;
    const placed = layout.segments.find((p) => km >= p.x0 && km <= p.x1);
    return placed ? { placed, x } : null;
  };

  const tooltip = hover?.placed.segment;

  return (
    <div ref={boxRef} style={{ position: "relative", width: "100%" }}>
      <svg
        width={width}
        height={CHART_H}
        role="img"
        aria-label={`Profile of line ${profile.line.label}: maximum speed and track parameters along ${layout.lineKm.toFixed(1)} km`}
        style={{ display: "block", cursor: "crosshair" }}
        onMouseMove={(e) => {
          const hit = locate(e.clientX);
          setHover(hit);
          onHover(hit?.placed.segment.rinfUri ?? null);
        }}
        onMouseLeave={() => {
          setHover(null);
          onHover(null);
        }}
        onClick={(e) => {
          const hit = locate(e.clientX);
          if (hit) onSelect(hit.placed.segment.rinfUri);
        }}
      >
        <defs>
          {/* 45° texture: the accessibility channel for "length unknown". */}
          <pattern id="lp-unknown" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={NO_DATA_COLOR} strokeWidth="2" />
          </pattern>
        </defs>

        {/* Station names and their hairlines through every row. */}
        {stations.map((s) => (
          <g key={`${s.uopid}-${s.x}`}>
            <line x1={xOf(s.x)} x2={xOf(s.x)} y1={TOP - 4} y2={axisY} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={xOf(s.x)} y={TOP - 8} textAnchor="middle" fontSize={10.5} fill="var(--text-secondary)">
              <title>{`${s.name} (${s.uopid})`}</title>
              {truncate(s.name, 14)}
            </text>
          </g>
        ))}

        {/* Speed row: one series, bars to the highest permitted speed. */}
        <text x={LEFT - 8} y={TOP + 10} textAnchor="end" fontSize={11} fill="var(--text)">Max speed</text>
        <text x={LEFT - 8} y={TOP + 23} textAnchor="end" fontSize={10} fill="var(--text-muted)">km/h</text>
        {[speedMax / 2, speedMax].map((v) => (
          <g key={v}>
            <line x1={LEFT} x2={LEFT + plotW} y1={ySpeed(v)} y2={ySpeed(v)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={LEFT + plotW} y={ySpeed(v) - 2} textAnchor="end" fontSize={9.5} fill="var(--text-muted)">{v}</text>
          </g>
        ))}
        <line x1={LEFT} x2={LEFT + plotW} y1={speedBase} y2={speedBase} stroke="var(--chart-axis)" strokeWidth={1} />
        {layout.segments.map((p) => {
          const x = xOf(p.x0) + 1;
          const w = Math.max(1, xOf(p.x1) - xOf(p.x0) - 2); // 2px surface gap
          const speed = p.segment.parameters.maxSpeed;
          if (speed?.kind !== "numeric") {
            return (
              <line key={p.segment.rinfUri} x1={x} x2={x + w} y1={speedBase - 1} y2={speedBase - 1}
                stroke={NO_DATA_COLOR} strokeWidth={2} strokeDasharray="3 2" />
            );
          }
          return (
            <g key={p.segment.rinfUri}>
              <path d={barPath(x, ySpeed(speed.max), w, speedBase)} fill={speedColor} />
              {speed.min < speed.max && w > 3 && (
                <line x1={x} x2={x + w} y1={ySpeed(speed.min)} y2={ySpeed(speed.min)} stroke={surface} strokeWidth={1.5} />
              )}
            </g>
          );
        })}

        {/* Categorical rows: one band per section. */}
        {CATEGORY_ROWS.map((param, i) => {
          const scale = scales[param];
          const y = bandTop(i);
          return (
            <g key={param}>
              <text x={LEFT - 8} y={y + 13} textAnchor="end" fontSize={11} fill="var(--text)">
                {PARAMETER_LABELS[param]}
              </text>
              {layout.segments.map((p) => {
                const x = xOf(p.x0) + 1;
                const w = Math.max(1, xOf(p.x1) - xOf(p.x0) - 2);
                const entry = scale?.colourOf(p.segment.parameters[param]);
                if (!entry || entry.key === "__nodata__") {
                  return (
                    <rect key={p.segment.rinfUri} x={x + 0.5} y={y + 0.5} width={Math.max(0, w - 1)} height={BAND_H - 1}
                      fill="none" stroke={NO_DATA_COLOR} strokeDasharray="3 2" rx={2} />
                  );
                }
                const text = entry.key === "__other__" ? "mixed/other" : entry.label;
                return (
                  <g key={p.segment.rinfUri}>
                    <rect x={x} y={y} width={w} height={BAND_H} fill={entry.color} rx={2} />
                    {w > text.length * 6 + 10 && (
                      <text x={x + w / 2} y={y + 12.5} textAnchor="middle" fontSize={10} fill="#ffffff">
                        {text}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Sections whose length RINF doesn't give: drawn at a nominal
            length, marked with the 45° texture under the axis. */}
        {layout.segments
          .filter((p) => !p.segment.lengthKnown)
          .map((p) => (
            <rect key={`u-${p.segment.rinfUri}`} x={xOf(p.x0)} y={axisY} width={xOf(p.x1) - xOf(p.x0)} height={5}
              fill="url(#lp-unknown)">
              <title>Length not in RINF: drawn at the line's median section length</title>
            </rect>
          ))}

        {/* Breaks between runs that RINF doesn't connect. */}
        {layout.gaps.map((g) => (
          <g key={g.x0}>
            <rect x={xOf(g.x0)} y={TOP} width={xOf(g.x1) - xOf(g.x0)} height={axisY - TOP} fill="var(--surface-hover)" />
            <text x={(xOf(g.x0) + xOf(g.x1)) / 2} y={TOP + SPEED_H / 2} textAnchor="middle" fontSize={12} fill="var(--text-muted)">
              ≈
              <title>Not connected in RINF: the next part of the line continues elsewhere</title>
            </text>
          </g>
        ))}

        {/* km axis (per run). */}
        {ticks.map((t, i) => (
          <text key={i} x={t.x} y={axisY + 17} textAnchor="middle" fontSize={9.5} fill="var(--text-muted)"
            style={{ fontVariantNumeric: "tabular-nums" }}>
            {t.label}
          </text>
        ))}
        <text x={LEFT - 8} y={axisY + 17} textAnchor="end" fontSize={10} fill="var(--text-muted)">km</text>

        {hover && (
          <line x1={hover.x} x2={hover.x} y1={TOP - 4} y2={axisY} stroke="var(--text)" strokeWidth={1} opacity={0.6} />
        )}
      </svg>

      {tooltip && hover && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            top: TOP,
            left: Math.min(hover.x + 12, width - 260),
            width: 240,
            pointerEvents: "none",
            background: "var(--surface-raised)",
            color: "var(--text)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            boxShadow: "var(--shadow-md)",
            padding: "6px 8px",
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 700 }}>
            {fieldValueLabel(tooltip.from.name)} → {fieldValueLabel(tooltip.to.name)}
          </div>
          <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>
            km {tooltip.startKm.toFixed(1)}–{tooltip.endKm.toFixed(1)}
            {!tooltip.lengthKnown && " (length not in RINF)"}
          </div>
          {(["maxSpeed", ...CATEGORY_ROWS] as TrackParameterId[]).map((param) => (
            <div key={param}>
              <span style={{ color: "var(--text-secondary)" }}>{PARAMETER_LABELS[param]}: </span>
              {parameterCell(tooltip, param, labels).replace(/;/g, ",") || (
                <span style={{ color: "var(--text-subtle)", fontStyle: "italic" }}>Not available in RINF</span>
              )}
              {param === "maxSpeed" && tooltip.parameters.maxSpeed ? " km/h" : ""}
            </div>
          ))}
          <div style={{ color: "var(--text-muted)", marginTop: 4 }}>Click to open this section</div>
        </div>
      )}
    </div>
  );
}

function RowLegends({
  scales,
  layout,
}: {
  scales: Record<TrackParameterId, ColourScale | undefined>;
  layout: ProfileLayout;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px", fontSize: 11.5, padding: "4px 0 0 4px" }}>
      {CATEGORY_ROWS.map((param) => {
        const scale = scales[param];
        if (!scale) return null;
        // Only what this line actually shows.
        const used = new Set(layout.segments.map((p) => scale.colourOf(p.segment.parameters[param]).key));
        const entries = scale.entries.filter((e) => used.has(e.key));
        return (
          <div key={param} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 8px" }}>
            <strong style={{ fontWeight: 600 }}>{PARAMETER_LABELS[param]}:</strong>
            {entries.map((e) => (
              <span key={e.key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 12,
                    height: 10,
                    borderRadius: 2,
                    background: e.style === "dashed" ? "transparent" : e.color,
                    border: e.style === "dashed" ? `1px dashed ${e.color}` : "none",
                    boxSizing: "border-box",
                  }}
                />
                {e.label}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ProfileTable({ profile, layout }: { profile: LineProfile; layout: ProfileLayout }) {
  const labels = profile.categoryLabels;
  const cell = { padding: "3px 8px", borderBottom: "1px solid var(--divider)", textAlign: "left" as const };
  return (
    <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
      <thead>
        <tr style={{ color: "var(--text-muted)" }}>
          <th style={cell}>km</th>
          <th style={cell}>From → to</th>
          {(["maxSpeed", ...CATEGORY_ROWS] as TrackParameterId[]).map((p) => (
            <th key={p} style={cell}>{PARAMETER_LABELS[p]}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {layout.segments.map(({ segment: s, run }) => (
          <tr key={s.rinfUri}>
            <td style={{ ...cell, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
              {profile.runs.length > 1 && `${run + 1}: `}
              {s.startKm.toFixed(1)}–{s.endKm.toFixed(1)}
              {!s.lengthKnown && "*"}
            </td>
            <td style={cell}>
              {fieldValueLabel(s.from.name)} → {fieldValueLabel(s.to.name)}
            </td>
            {(["maxSpeed", ...CATEGORY_ROWS] as TrackParameterId[]).map((p) => (
              <td key={p} style={cell}>
                {parameterCell(s, p, labels).replace(/;/g, ",") || (
                  <span style={{ color: "var(--text-subtle)", fontStyle: "italic" }}>n/a</span>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A national line laid out as a strip along its length, one row per
 *  track parameter, linked to the map both ways. */
export function LineProfilePanel({
  country,
  lineIri,
  onChangeLine,
  onClose,
  theme,
  rightInset,
  onHoverSection,
  onSelectSection,
  onProfile,
}: Props) {
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<"chart" | "table">("chart");
  const lines = useQuery({
    queryKey: ["national-lines", country],
    queryFn: () => fetchNationalLines(country),
    retry: false,
  });
  const profile = useQuery({
    queryKey: ["line-profile", country, lineIri],
    queryFn: () => fetchLineProfile(country, lineIri!),
    enabled: lineIri !== null,
    retry: false,
  });

  const onProfileRef = useRef(onProfile);
  onProfileRef.current = onProfile;
  useEffect(() => {
    onProfileRef.current(lineIri && profile.data ? profile.data : null);
  }, [profile.data, lineIri]);

  const layout = useMemo(() => (profile.data ? layoutProfile(profile.data) : null), [profile.data]);
  const scales = useMemo(() => {
    const result = {} as Record<TrackParameterId, ColourScale | undefined>;
    if (profile.data && layout) {
      for (const param of CATEGORY_ROWS) {
        result[param] = categoricalScale(lineCategories(layout, param, profile.data.categoryLabels), theme);
      }
    }
    return result;
  }, [profile.data, layout, theme]);

  const options = (lines.data ?? []).filter((l) =>
    l.label.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const unknownLengths = layout?.segments.filter((p) => !p.segment.lengthKnown).length ?? 0;

  const control = {
    padding: "4px 8px",
    fontSize: 12,
    border: "1px solid var(--border)",
    borderRadius: 4,
    background: "var(--surface)",
    color: "var(--text)",
  };

  return (
    <section
      className="line-profile-panel"
      aria-label="Line profile"
      style={{
        position: "absolute",
        left: 0,
        right: rightInset,
        bottom: 0,
        maxHeight: "48vh",
        overflowY: "auto",
        background: "var(--surface)",
        color: "var(--text)",
        boxShadow: "var(--shadow-lg)",
        borderRadius: "10px 10px 0 0",
        padding: "10px 14px 12px",
        zIndex: 18,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <strong style={{ fontSize: 14 }}>Line profile</strong>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter lines…"
          aria-label="Filter national lines"
          style={{ ...control, width: 130 }}
        />
        <select
          value={lineIri ?? ""}
          onChange={(e) => onChangeLine(e.target.value || null)}
          aria-label="National line"
          style={{ ...control, maxWidth: 320 }}
        >
          <option value="">{lines.isLoading ? "Loading lines…" : `Choose a line (${options.length})`}</option>
          {options.map((l) => (
            <option key={l.iri} value={l.iri}>
              {l.label} — {l.sections} sections, {l.lengthKm} km
            </option>
          ))}
          {lineIri && !options.some((l) => l.iri === lineIri) && (
            <option value={lineIri}>{profile.data?.line.label ?? lineIri}</option>
          )}
        </select>
        {profile.data && layout && (
          <>
            <button style={{ ...control, cursor: "pointer" }} onClick={() => setView(view === "chart" ? "table" : "chart")}>
              {view === "chart" ? "Table" : "Chart"}
            </button>
            <button
              style={{ ...control, cursor: "pointer" }}
              onClick={() =>
                downloadText(
                  `rinf-line-${profile.data!.line.label.replace(/[^A-Za-z0-9._-]+/g, "_")}.csv`,
                  "text/csv",
                  profileCsv(profile.data!, layout),
                )
              }
            >
              CSV
            </button>
          </>
        )}
        <button
          onClick={onClose}
          aria-label="Close line profile"
          style={{ marginLeft: "auto", border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "var(--text-muted)" }}
        >
          ×
        </button>
      </div>

      {lines.error && (
        <div style={{ color: "var(--danger-text)", fontSize: 12 }}>
          Couldn't load national lines: {(lines.error as Error).message}
        </div>
      )}
      {!lineIri && !lines.error && (
        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
          Pick a national line to lay its sections out along its length, or open one from a
          section of line's panel.
        </div>
      )}
      {profile.isLoading && <div style={{ fontSize: 12 }}>Chaining the line's sections from RINF…</div>}
      {profile.error && (
        <div style={{ color: "var(--danger-text)", fontSize: 12 }}>
          Couldn't build this profile: {(profile.error as Error).message}
        </div>
      )}

      {profile.data && layout && (
        <>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
            {profile.data.line.label}: {layout.segments.length} sections, {layout.lineKm.toFixed(1)} km
            {profile.data.runs.length > 1 &&
              ` · ${profile.data.runs.length} parts not connected in RINF (≈ marks each break)`}
            {unknownLengths > 0 && ` · ${unknownLengths} without a length in RINF (hatched, drawn at median length)`}
          </div>
          {view === "chart" ? (
            <>
              <ProfileChart
                profile={profile.data}
                layout={layout}
                theme={theme}
                scales={scales}
                onHover={onHoverSection}
                onSelect={onSelectSection}
              />
              <RowLegends scales={scales} layout={layout} />
            </>
          ) : (
            <ProfileTable profile={profile.data} layout={layout} />
          )}
        </>
      )}
    </section>
  );
}
