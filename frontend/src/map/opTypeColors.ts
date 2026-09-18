/** Categorical colors for the operational-point types that actually occur
 *  in the France dataset (checked live against the RINF endpoint). Hex
 *  values and slot order come from the dataviz skill's validated 8-hue
 *  categorical palette (passes lightness/chroma/CVD/normal-vision gates on
 *  the default adjacent-pair check; the three lower-contrast slots —
 *  aqua/yellow/magenta — rely on the "relief rule": every use here is
 *  paired with a visible text label in the legend and the click popup, so
 *  color is never the only carrier of the category).
 *
 *  RINF defines more op-type concepts than these; anything not in this map
 *  (the one vanishingly rare type actually seen — shunting yard, ~0.04% of
 *  points — and any point whose opType is not available/not applicable)
 *  falls back to OTHER_COLOR. The dataviz skill's own rule is explicit that
 *  a 9th+ series should fold into "Other" rather than mint another hue that
 *  fails all-pairs separation. "passenger stop" is treated as a variant of
 *  "station" (per product decision) and shares its color. */
export const OP_TYPE_COLORS: Record<string, string> = {
  junction: "#2a78d6",
  "depot or workshop": "#eb6834",
  station: "#1baf7a",
  "passenger stop": "#1baf7a",
  "private siding": "#eda100",
  "technical change": "#e87ba4",
  "freight terminal": "#008300",
  "train technical services": "#4a3aa7",
  "domestic border point": "#e34948",
};

export interface LegendEntry {
  label: string;
  color: string;
  /** The underlying opTypeKey value(s) this row represents — more than one
   *  for a merged synonym row (station/passenger stop share a color), so a
   *  click can hide/show all of them together. */
  keys: string[];
}

/** What the legend actually shows — one row per distinct color, with
 *  synonyms (station/passenger stop) merged into a single label. */
export const LEGEND_ENTRIES: LegendEntry[] = [
  { label: "junction", color: OP_TYPE_COLORS.junction, keys: ["junction"] },
  {
    label: "depot or workshop",
    color: OP_TYPE_COLORS["depot or workshop"],
    keys: ["depot or workshop"],
  },
  {
    label: "station / passenger stop",
    color: OP_TYPE_COLORS.station,
    keys: ["station", "passenger stop"],
  },
  {
    label: "private siding",
    color: OP_TYPE_COLORS["private siding"],
    keys: ["private siding"],
  },
  {
    label: "technical change",
    color: OP_TYPE_COLORS["technical change"],
    keys: ["technical change"],
  },
  {
    label: "freight terminal",
    color: OP_TYPE_COLORS["freight terminal"],
    keys: ["freight terminal"],
  },
  {
    label: "train technical services",
    color: OP_TYPE_COLORS["train technical services"],
    keys: ["train technical services"],
  },
  {
    label: "domestic border point",
    color: OP_TYPE_COLORS["domestic border point"],
    keys: ["domestic border point"],
  },
];

export const OTHER_LABEL = "Other / not available";
export const OTHER_COLOR = "#898781";

export function colorForOpTypeLabel(label: string | undefined): string {
  if (label && label in OP_TYPE_COLORS) return OP_TYPE_COLORS[label];
  return OTHER_COLOR;
}

/** MapLibre GeoJSON sources JSON.stringify nested property objects (see
 *  fieldValueText.ts), so a `match` paint expression can't reach into
 *  `properties.opType.value.label` directly. This precomputes a flat,
 *  top-level string key per feature that the paint expression can key on. */
export function withOpTypeKey<
  P extends { opType: { status: string; value?: { label?: string } } },
>(
  collection: GeoJSON.FeatureCollection<GeoJSON.Point, P>,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: collection.features.map((f) => {
      const label =
        f.properties.opType.status === "value"
          ? f.properties.opType.value?.label
          : undefined;
      const opTypeKey = label && label in OP_TYPE_COLORS ? label : OTHER_LABEL;
      return {
        ...f,
        properties: { ...f.properties, opTypeKey },
      };
    }),
  };
}

/** Which opTypeKey values actually occur in this country's data — used to
 *  hide legend rows for categories that don't exist here (e.g. most
 *  countries have zero "domestic border point"s), rather than always
 *  listing all 8+1 regardless of relevance. */
export function presentOpTypeKeys<
  P extends { opType: { status: string; value?: { label?: string } } },
>(collection: GeoJSON.FeatureCollection<GeoJSON.Point, P>): Set<string> {
  const present = new Set<string>();
  for (const f of collection.features) {
    const label =
      f.properties.opType.status === "value"
        ? f.properties.opType.value?.label
        : undefined;
    present.add(label && label in OP_TYPE_COLORS ? label : OTHER_LABEL);
  }
  return present;
}

/** A MapLibre `match` expression mapping the flat `opTypeKey` (see
 *  withOpTypeKey) to its color, defaulting to OTHER_COLOR. Typed loosely —
 *  maplibre-gl's expression types are a large recursive union that a plain
 *  literal like this doesn't structurally match without a lot of ceremony. */
export function opTypeColorMatchExpression(): unknown[] {
  const pairs = Object.entries(OP_TYPE_COLORS).flatMap(([label, color]) => [
    label,
    color,
  ]);
  return ["match", ["get", "opTypeKey"], ...pairs, OTHER_COLOR];
}

/** A MapLibre filter expression hiding features whose opTypeKey is in the
 *  given set — backs the legend's click-to-toggle-visibility rows. */
export function hiddenOpTypeKeysFilterExpression(
  hidden: Set<string>,
): unknown[] {
  return ["!", ["in", ["get", "opTypeKey"], ["literal", [...hidden]]]];
}
