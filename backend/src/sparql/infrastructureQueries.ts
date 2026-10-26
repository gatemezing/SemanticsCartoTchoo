import type { InfrastructureKind } from "@carto-rinf/shared-types";
import { ERA, TIME_PREFIX, uopidPrefixFor, validNow } from "./queries.js";

const CLASS_BY_KIND: Record<InfrastructureKind, string> = {
  "level-crossings": "era:LevelCrossing",
  bridges: "era:Bridge",
  signals: "era:Signal",
  switches: "era:Switch",
};

/** One country's features of a given class, scoped by the country's
 *  infrastructure managers' named graphs rather than era:inCountry, which
 *  is missing on about half of these (e.g. all Austrian level crossings
 *  and switches). Geometry is on the feature itself or on its net
 *  reference, depending on the provider.
 *
 *  Validity follows the same rules as the core layers (queries.ts
 *  validNow): unversioned features are kept, open-ended windows count. */
export function buildInfrastructureQuery(
  kind: InfrastructureKind,
  graphIris: string[],
): string {
  return `PREFIX era: <${ERA}>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
${TIME_PREFIX}
SELECT ?s (SAMPLE(?wktX) AS ?wkt) (SAMPLE(?enLabel) AS ?labelEn) (SAMPLE(?anyLabel) AS ?labelAny)
       (SAMPLE(?subtypeX) AS ?subtype) (SAMPLE(?subtypeLabelX) AS ?subtypeLabel) WHERE {
  VALUES ?g { ${graphIris.map((g) => `<${g}>`).join(" ")} }
  GRAPH ?g { ?s a ${CLASS_BY_KIND[kind]} . }
  { ?s geo:hasGeometry/geo:asWKT ?wktX . } UNION { ?s era:netReference/geo:hasGeometry/geo:asWKT ?wktX . }
  ${validNow("?s", "S", "range")}
  OPTIONAL { ?s rdfs:label ?enLabel . FILTER(LANG(?enLabel) IN ("en", "")) }
  OPTIONAL { ?s rdfs:label ?anyLabel . }
  ${kind === "signals" ? `OPTIONAL {
    ?s era:signalType ?subtypeX .
    OPTIONAL { ?subtypeX skos:prefLabel ?subtypeLabelX . FILTER(LANG(?subtypeLabelX) = "en") }
  }` : ""}
} GROUP BY ?s`;
}

/** The named graphs holding a country's operational points — i.e. its
 *  infrastructure managers' graphs, read from RINF itself (~0.6s) rather
 *  than from ERA's dataset explorer, so the infrastructure layers don't
 *  depend on a second upstream service being up. */
export function buildProviderGraphsQuery(countryCode: string): string {
  return `PREFIX era: <${ERA}>
SELECT DISTINCT ?g WHERE {
  GRAPH ?g { ?op a era:OperationalPoint ; era:uopid ?u . }
  FILTER(STRSTARTS(?u, "${uopidPrefixFor(countryCode)}"))
}`;
}
