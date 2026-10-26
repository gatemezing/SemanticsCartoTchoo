import {
  NOT_ELECTRIFIED,
  type SectionParameters,
  type SectionParameterValue,
  type TrackParameterId,
  TRACK_PARAMETERS,
} from "@carto-rinf/shared-types";
import type { SparqlJsonResults } from "../sparql/client.js";
import { TRACK_PARAMETER_DEFS } from "../sparql/trackParameters.js";

export type SectionParameterMap = Map<
  string,
  Partial<Record<TrackParameterId, SectionParameterValue>>
>;

const isParam = (v: string): v is TrackParameterId =>
  (TRACK_PARAMETERS as readonly string[]).includes(v);

/** Rows of buildSectionParameterRowsQuery → per-section values, plus the
 *  set of concept IRIs that need labels. */
export function mapParameterRows(results: SparqlJsonResults): {
  bySection: SectionParameterMap;
  conceptIris: Set<string>;
} {
  const bySection: SectionParameterMap = new Map();
  const conceptIris = new Set<string>();
  for (const b of results.results.bindings) {
    const param = b.param?.value;
    if (!b.sol || !param || !isParam(param)) continue;
    let value: SectionParameterValue | undefined;
    if (TRACK_PARAMETER_DEFS[param].kind === "numeric") {
      const min = Number(b.min?.value);
      const max = Number(b.max?.value);
      if (Number.isFinite(min) && Number.isFinite(max)) value = { kind: "numeric", min, max };
    } else {
      const values = (b.values?.value ?? "").split("|").filter(Boolean).sort();
      if (values.length > 0) {
        value = { kind: "categorical", values };
        for (const v of values) if (v !== NOT_ELECTRIFIED) conceptIris.add(v);
      }
    }
    if (!value) continue;
    const entry = bySection.get(b.sol.value) ?? {};
    entry[param] = value;
    bySection.set(b.sol.value, entry);
  }
  return { bySection, conceptIris };
}

/** Concept labels, English first. Codes RINF's vocabulary doesn't define
 *  (seen live: etcs-levels/10, energy-supply-systems/90) get no entry —
 *  the UI shows the code rather than an invented meaning. The synthetic
 *  "not electrified" value is labelled here. */
export function mapConceptLabels(results: SparqlJsonResults | null): Record<string, string> {
  const labels: Record<string, string> = { [NOT_ELECTRIFIED]: "Not electrified" };
  for (const b of results?.results.bindings ?? []) {
    const label = b.enLabel?.value ?? b.anyLabel?.value;
    if (b.c && label) labels[b.c.value] = label;
  }
  return labels;
}

/** One country's rollup of one parameter, for colouring the map. */
export function buildSectionParameters(
  param: TrackParameterId,
  bySection: SectionParameterMap,
  labels: Record<string, string>,
): SectionParameters {
  const def = TRACK_PARAMETER_DEFS[param];
  const values: SectionParameters["values"] = {};
  const counts = new Map<string, number>();
  for (const [sol, params] of bySection) {
    const value = params[param];
    if (!value) continue;
    values[sol] = value;
    if (value.kind === "categorical") {
      for (const v of value.values) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  return {
    param,
    kind: def.kind,
    ...(def.unit && { unit: def.unit }),
    values,
    categories: [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([value, sections]) => ({
        value,
        sections,
        ...(labels[value] && { label: labels[value] }),
      })),
  };
}
