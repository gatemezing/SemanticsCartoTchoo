import type {
  SectionParameters,
  SectionParameterValue,
  TrackParameterId,
} from "@carto-rinf/shared-types";
import type { ResolvedTheme } from "../theme/theme";

/** Data colours, validated with the dataviz skill's validator (2026-10)
 *  against the map surface (OSM land ≈ #f2efe9; the dimmed dark basemap
 *  ≈ #2a2a28) — see docs/ROADMAP.md for the runs. Never eyeballed.
 *
 *  Categorical on a map is the "all pairs" case (any two lines can be
 *  neighbours), where the reference palette validates only its first
 *  three slots — so at most three values get a hue; the rest fold into
 *  "Other / mixed". Light-mode orange and aqua sit below 3:1 on the map
 *  surface: the relief is the surface casing drawn under coloured lines,
 *  the always-visible legend, and the per-section tooltip/detail. */
export const CATEGORY_SLOTS: Record<ResolvedTheme, [string, string, string]> = {
  light: ["#2a78d6", "#eb6834", "#1baf7a"],
  dark: ["#3987e5", "#d95926", "#199e70"],
};

/** Ordinal (one hue, monotone lightness) — five steps, low → high speed.
 *  Six failed the adjacent-ΔL and light-end-contrast checks. The dark
 *  ramp flips its anchor: faster is lighter against the dark basemap. */
export const SPEED_RAMP: Record<ResolvedTheme, string[]> = {
  light: ["#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
  dark: ["#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"],
};

export const SPEED_BINS: { upTo: number; label: string }[] = [
  { upTo: 80, label: "≤ 80 km/h" },
  { upTo: 120, label: "81–120 km/h" },
  { upTo: 160, label: "121–160 km/h" },
  { upTo: 200, label: "161–200 km/h" },
  { upTo: Infinity, label: "> 200 km/h" },
];

/** Secondary ink for "Other / mixed" (solid), muted gray for "no data"
 *  (thin, dashed) — told apart by line style as well as tone. */
export const OTHER_COLOR: Record<ResolvedTheme, string> = { light: "#52514e", dark: "#c3c2b7" };
export const NO_DATA_COLOR = "#898781";
/** The 2px surface ring under coloured marks. */
export const CASING_COLOR: Record<ResolvedTheme, string> = { light: "#ffffff", dark: "#1a1a19" };
/** Neutral ink for the extra infrastructure layers: their identity is the
 *  marker shape (the op-type palette already uses all eight hues, and a
 *  ninth+ hue isn't allowed). */
export const INFRA_INK: Record<ResolvedTheme, string> = { light: "#3d3c39", dark: "#e1e0d9" };

export const PARAMETER_LABELS: Record<TrackParameterId, string> = {
  maxSpeed: "Maximum speed",
  electrification: "Electrification",
  gauge: "Track gauge",
  etcsLevel: "ETCS level",
};

export interface LegendEntry {
  key: string;
  label: string;
  color: string;
  style: "solid" | "dashed";
}

export interface ColourScale {
  colourOf(value: SectionParameterValue | undefined): LegendEntry;
  entries: LegendEntry[];
}

/** A category's display label: RINF's label, or — for codes its
 *  vocabulary doesn't define — the code itself, marked as such. */
export function categoryLabel(value: string, label: string | undefined): string {
  if (label) return label;
  const code = value.split("/").pop() ?? value;
  return `code ${code} (no label in RINF)`;
}

export function noDataEntry(): LegendEntry {
  return { key: "__nodata__", label: "No data in RINF", color: NO_DATA_COLOR, style: "dashed" };
}

export function numericScale(theme: ResolvedTheme): ColourScale {
  const entries: LegendEntry[] = SPEED_BINS.map((bin, i) => ({
    key: `bin:${i}`,
    label: bin.label,
    color: SPEED_RAMP[theme][i],
    style: "solid",
  }));
  const noData = noDataEntry();
  return {
    // A section is coloured by the highest speed any of its tracks allows.
    colourOf: (value) => {
      if (value?.kind !== "numeric") return noData;
      const i = SPEED_BINS.findIndex((bin) => value.max <= bin.upTo);
      return entries[i];
    },
    entries: [...entries, noData],
  };
}

/** Top three categories (by number of sections, as ranked by the API)
 *  take the three slots; the assignment is per dataset (country or line),
 *  and stable within it — no filter repaints a value. */
export function categoricalScale(
  categories: { value: string; label?: string }[],
  theme: ResolvedTheme,
): ColourScale {
  const slots = CATEGORY_SLOTS[theme];
  const top = categories.slice(0, 3).map((c, i): LegendEntry => ({
    key: c.value,
    label: categoryLabel(c.value, c.label),
    color: slots[i],
    style: "solid",
  }));
  const byValue = new Map(top.map((e) => [e.key, e]));
  const other: LegendEntry = {
    key: "__other__",
    label: categories.length > 3 ? "Other values / mixed" : "Mixed (several values)",
    color: OTHER_COLOR[theme],
    style: "solid",
  };
  const noData = noDataEntry();
  return {
    colourOf: (value) => {
      if (value?.kind !== "categorical" || value.values.length === 0) return noData;
      if (value.values.length > 1) return other;
      return byValue.get(value.values[0]) ?? other;
    },
    entries: [...top, other, noData],
  };
}

export function scaleFor(params: SectionParameters, theme: ResolvedTheme): ColourScale {
  return params.kind === "numeric"
    ? numericScale(theme)
    : categoricalScale(params.categories, theme);
}

/** Base colours of the always-on line layers, stepped per theme so they
 *  stay visible on the dimmed dark basemap. Mirrored as --map-section /
 *  --map-tunnel in theme.css for the legend swatches. */
export const SECTION_COLOR: Record<ResolvedTheme, string> = { light: "#0f766e", dark: "#2fb5a5" };
export const TUNNEL_COLOR: Record<ResolvedTheme, string> = { light: "#78350f", dark: "#d9a066" };
export const HIGHLIGHT_COLOR: Record<ResolvedTheme, string> = { light: "#2563eb", dark: "#8ab4f8" };

/** "120 km/h", "80–120 km/h", "AC 25kV-50Hz, Not electrified" — or null
 *  when RINF has no value (callers render that state explicitly). */
export function parameterValueText(
  param: TrackParameterId,
  value: SectionParameterValue | undefined,
  labels: Record<string, string | undefined>,
): string | null {
  if (!value) return null;
  if (value.kind === "numeric") {
    const unit = param === "maxSpeed" ? " km/h" : "";
    return value.min === value.max ? `${value.max}${unit}` : `${value.min}–${value.max}${unit}`;
  }
  return value.values.map((v) => categoryLabel(v, labels[v])).join(", ");
}
