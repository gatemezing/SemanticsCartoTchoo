import type {
  LineProfile,
  LineProfileSegment,
  TrackParameterId,
} from "@carto-rinf/shared-types";
import { fieldValueLabel } from "../components/fieldValueText";
import { categoryLabel } from "../map/dataColors";
import { toCsv } from "../export/download";

/** A segment placed on the chart's single km axis. Runs (disconnected
 *  parts of the line) are laid end to end with a visible gap between
 *  them, so a break in RINF's chain never reads as continuous track. */
export interface PlacedSegment {
  segment: LineProfileSegment;
  run: number;
  /** Position on the shared axis, in km (gaps included). */
  x0: number;
  x1: number;
}

export interface ProfileLayout {
  segments: PlacedSegment[];
  /** Axis length in km, gaps included. */
  totalKm: number;
  /** Track length in km, without gaps. */
  lineKm: number;
  /** Where each gap between runs sits, for drawing the break marker. */
  gaps: { x0: number; x1: number }[];
}

export function layoutProfile(profile: LineProfile): ProfileLayout {
  const lineKm = profile.runs.reduce((sum, run) => sum + (run.at(-1)?.endKm ?? 0), 0);
  const gap = Math.max(lineKm * 0.02, 0.5);
  const segments: PlacedSegment[] = [];
  const gaps: ProfileLayout["gaps"] = [];
  let offset = 0;
  profile.runs.forEach((run, i) => {
    if (i > 0) {
      gaps.push({ x0: offset, x1: offset + gap });
      offset += gap;
    }
    for (const segment of run) {
      segments.push({ segment, run: i, x0: offset + segment.startKm, x1: offset + segment.endKm });
    }
    offset += run.at(-1)?.endKm ?? 0;
  });
  return { segments, totalKm: offset, lineKm, gaps };
}

/** Operational-point labels along the axis: every segment boundary
 *  (and the end of each run), keeping only those at least `minGapPx`
 *  apart so names never collide. The ends of runs are always kept. */
export function stationLabels(
  layout: ProfileLayout,
  pxPerKm: number,
  minGapPx = 72,
): { x: number; name: string; uopid: string }[] {
  const candidates: { x: number; name: string; uopid: string; priority: boolean }[] = [];
  layout.segments.forEach((placed, i) => {
    const prev = layout.segments[i - 1];
    const runStart = !prev || prev.run !== placed.run;
    const next = layout.segments[i + 1];
    const runEnd = !next || next.run !== placed.run;
    const from = placed.segment.from;
    candidates.push({ x: placed.x0, name: fieldValueLabel(from.name), uopid: from.uopid, priority: runStart });
    if (runEnd) {
      const to = placed.segment.to;
      candidates.push({ x: placed.x1, name: fieldValueLabel(to.name), uopid: to.uopid, priority: true });
    }
  });
  const kept: typeof candidates = [];
  // Priority labels first, then fill in between where there's room.
  for (const c of [...candidates.filter((c) => c.priority), ...candidates.filter((c) => !c.priority)]) {
    if (kept.every((k) => Math.abs(k.x - c.x) * pxPerKm >= minGapPx)) kept.push(c);
  }
  return kept.sort((a, b) => a.x - b.x).map(({ x, name, uopid }) => ({ x, name, uopid }));
}

/** Top of the speed axis: the line's highest speed rounded up to 40. */
export function speedAxisMax(layout: ProfileLayout): number {
  const max = Math.max(
    0,
    ...layout.segments.map((p) =>
      p.segment.parameters.maxSpeed?.kind === "numeric" ? p.segment.parameters.maxSpeed.max : 0,
    ),
  );
  return Math.max(40, Math.ceil(max / 40) * 40);
}

/** Categories of one parameter along this line, most frequent first (by
 *  segments) — the order the colour slots are assigned in. */
export function lineCategories(
  layout: ProfileLayout,
  param: TrackParameterId,
  labels: Record<string, string>,
): { value: string; label: string }[] {
  const counts = new Map<string, number>();
  for (const { segment } of layout.segments) {
    const v = segment.parameters[param];
    if (v?.kind === "categorical") for (const c of v.values) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([value]) => ({ value, label: categoryLabel(value, labels[value]) }));
}

export function parameterCell(
  segment: LineProfileSegment,
  param: TrackParameterId,
  labels: Record<string, string>,
): string {
  const v = segment.parameters[param];
  if (!v) return "";
  if (v.kind === "numeric") return v.min === v.max ? String(v.max) : `${v.min}-${v.max}`;
  return v.values.map((c) => categoryLabel(c, labels[c])).join("; ");
}

/** The profile as a table, one row per section, in chart order. Empty
 *  cells mean RINF has no value for that section. */
export function profileCsv(profile: LineProfile, layout: ProfileLayout): string {
  const labels = profile.categoryLabels;
  return toCsv(
    [
      "run", "start_km", "end_km", "length_known", "from_uopid", "from_name", "to_uopid", "to_name",
      "max_speed_kmh", "electrification", "gauge_mm", "etcs_level", "section_rinf_uri",
    ],
    layout.segments.map(({ segment: s, run }) => [
      run + 1,
      s.startKm,
      s.endKm,
      s.lengthKnown ? "yes" : "no",
      s.from.uopid,
      fieldValueLabel(s.from.name),
      s.to.uopid,
      fieldValueLabel(s.to.name),
      parameterCell(s, "maxSpeed", labels),
      parameterCell(s, "electrification", labels),
      parameterCell(s, "gauge", labels),
      parameterCell(s, "etcsLevel", labels),
      s.rinfUri,
    ]),
  );
}
