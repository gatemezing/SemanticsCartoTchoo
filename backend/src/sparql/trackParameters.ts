import {
  NOT_ELECTRIFIED,
  type TrackParameterId,
} from "@carto-rinf/shared-types";
import { ERA } from "./queries.js";

const CONCEPTS = `${ERA}concepts/`;

export interface TrackParameterDef {
  id: TrackParameterId;
  kind: "numeric" | "categorical";
  unit?: string;
  /** Graph pattern binding `?n` (numeric) or `?c` (categorical concept
   *  IRI) for running track `?t`. */
  pattern: string;
}

/** The running-track parameters that roll up per section of line. Paths
 *  verified live (2026-10) on FR/DE/LU data:
 *  - speed is a plain integer on the track;
 *  - electrification hangs off the contact-line system node. RINF models
 *    a non-electrified track as a contact-line system of type "Not
 *    electrified" (contact-line-systems/40, ~27k tracks) without an energy
 *    supply system; that becomes the synthetic NOT_ELECTRIFIED value. A
 *    track without any contact-line system (~262k) contributes nothing:
 *    "no data", not "not electrified";
 *  - ETCS hangs off the trackside ETCS node. */
export const TRACK_PARAMETER_DEFS: Record<TrackParameterId, TrackParameterDef> = {
  maxSpeed: {
    id: "maxSpeed",
    kind: "numeric",
    unit: "km/h",
    pattern: `?t era:maximumPermittedSpeed ?n .`,
  },
  electrification: {
    id: "electrification",
    kind: "categorical",
    pattern: `{ ?t era:contactLineSystem/era:energySupplySystem ?c . }
    UNION {
      ?t era:contactLineSystem/era:contactLineSystemType <${CONCEPTS}contact-line-systems/40> .
      FILTER NOT EXISTS { ?t era:contactLineSystem/era:energySupplySystem ?anySupply }
      BIND(<${NOT_ELECTRIFIED}> AS ?c)
    }`,
  },
  gauge: {
    id: "gauge",
    kind: "categorical",
    unit: "mm",
    pattern: `?t era:wheelSetGauge ?c .`,
  },
  etcsLevel: {
    id: "etcsLevel",
    kind: "categorical",
    pattern: `?t era:etcs/era:etcsLevelType ?c .`,
  },
};

/** Per-section rollup of the given parameters over each section's
 *  running tracks. `sectionPattern` must bind `?sol` (a country scope with
 *  validity, or a VALUES list). Tracks link to their section either way
 *  round depending on the provider (`era:isPartOf` in FR, `era:hasPart`
 *  in SE), so both are followed. One row per section × parameter. */
export function buildSectionParameterRowsQuery(
  sectionPattern: string,
  params: TrackParameterId[],
  timePrefix = "",
): string {
  const unions = params
    .map((id) => `{ BIND("${id}" AS ?param) ${TRACK_PARAMETER_DEFS[id].pattern} }`)
    .join("\n  UNION\n  ");
  return `PREFIX era: <${ERA}>
${timePrefix}
SELECT ?sol ?param (MIN(?n) AS ?min) (MAX(?n) AS ?max)
       (GROUP_CONCAT(DISTINCT STR(?c); separator="|") AS ?values) WHERE {
  ${sectionPattern}
  ?sol era:hasPart|^era:isPartOf ?t .
  ?t a era:RunningTrack .
  ${unions}
} GROUP BY ?sol ?param`;
}

/** Labels for concept IRIs (English preferred, then any language). The
 *  IRIs come from upstream results, so each is checked before being
 *  interpolated; anything odd is dropped rather than queried. */
export function buildConceptLabelsQuery(iris: string[]): string {
  return `PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?c (SAMPLE(?en) AS ?enLabel) (SAMPLE(?any) AS ?anyLabel) WHERE {
  ${valuesClause("?c", iris)}
  OPTIONAL { ?c skos:prefLabel ?en . FILTER(LANG(?en) = "en") }
  OPTIONAL { ?c skos:prefLabel ?any }
} GROUP BY ?c`;
}

/** `VALUES ?var { <iri> ... }` for IRIs that came back from upstream —
 *  each is re-checked against the IRIREF rules before interpolation, and
 *  anything that fails is dropped rather than queried. */
export function valuesClause(variable: string, iris: Iterable<string>): string {
  const safe = [...iris].filter((iri) => /^https?:\/\/[^\s<>"{}|\\^`]+$/.test(iri));
  return `VALUES ${variable} { ${safe.map((iri) => `<${iri}>`).join(" ")} }`;
}
