import {
  assertSafeCountryPrefix,
  assertSafeIri,
  ERA,
  sampleOptional,
  strategyFor,
  TIME_PREFIX,
  uopidPrefixFor,
  validNow,
} from "./queries.js";

/** National lines (era:nationalLine) with their current sections in one
 *  country. Lengths are sampled once per section before summing, so a
 *  duplicated length triple can't double-count; a section without a
 *  length adds 0 and is counted in `missingLengths`. */
export function buildNationalLinesQuery(countryPrefix: string): string {
  assertSafeCountryPrefix(countryPrefix);
  return `PREFIX era: <${ERA}>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
${TIME_PREFIX}
SELECT ?line ?sections ?km (SAMPLE(?lbl) AS ?label) WHERE {
  {
    SELECT ?line (COUNT(?sol) AS ?sections) (SUM(COALESCE(?len, 0)) AS ?km) WHERE {
      {
        SELECT ?sol ?line (SAMPLE(?lenX) AS ?len) WHERE {
          ?sol a era:SectionOfLine ; era:nationalLine ?line ; era:opStart/era:uopid ?u .
          FILTER(STRSTARTS(?u, "${uopidPrefixFor(countryPrefix)}"))
          ${validNow("?sol", "Sol", strategyFor(countryPrefix))}
          OPTIONAL { ?sol era:lengthOfSectionOfLine ?lenX }
        } GROUP BY ?sol ?line
      }
    } GROUP BY ?line
  }
  OPTIONAL { ?line rdfs:label ?lbl }
} GROUP BY ?line ?sections ?km`;
}

/** The current sections of one national line with their endpoints and
 *  length — the input to the line-profile chaining. The validity strategy
 *  comes from the country the line belongs to. */
export function buildLineSectionsQuery(lineIri: string, countryPrefix: string): string {
  assertSafeIri(lineIri);
  assertSafeCountryPrefix(countryPrefix);
  return `PREFIX era: <${ERA}>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
${TIME_PREFIX}
SELECT ?sol ?len ?startUopid ?startName ?endUopid ?endName ?lineLabel WHERE {
  ?sol a era:SectionOfLine ; era:nationalLine <${lineIri}> ;
       era:opStart ?start ; era:opEnd ?end .
  ?start era:uopid ?startUopid .
  ?end era:uopid ?endUopid .
  ${validNow("?sol", "Sol", strategyFor(countryPrefix))}
  OPTIONAL { ?sol era:lengthOfSectionOfLine ?len }
  ${sampleOptional("?start", "era:opName", "?startNameX", "?startName", "en")}
  ${sampleOptional("?end", "era:opName", "?endNameX", "?endName", "en")}
  OPTIONAL { <${lineIri}> rdfs:label ?lineLabel }
}`;
}

/** Typed detail of one section of line, as a single implicit group:
 *  every pattern hangs off the bound section IRI and each column is
 *  SAMPLEd, so duplicate values in the source (two labels, two lengths)
 *  can't multiply rows, and nothing is evaluated store-wide. (A first
 *  version used label subqueries correlated only on the label's subject
 *  and took 75s; this takes well under a second.) Labels are taken in
 *  English or untagged — national-line and IM labels are untagged. */
export function buildSectionDetailQuery(iri: string): string {
  assertSafeIri(iri);
  const s = `<${iri}>`;
  const linked = (predicate: string, v: string) => `OPTIONAL {
    ${s} ${predicate} ?${v}X .
    OPTIONAL { ?${v}X skos:prefLabel|rdfs:label ?${v}LabelX . FILTER(LANG(?${v}LabelX) IN ("en", "")) }
  }
  OPTIONAL { ${s} era:notApplicable ${predicate} . BIND(true AS ?${v}NAX) }`;
  return `PREFIX era: <${ERA}>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT (SAMPLE(?labelX) AS ?label) (SAMPLE(?lenX) AS ?len) (SAMPLE(?lenNAX) AS ?lenNA)
       (SAMPLE(?natureX) AS ?nature) (SAMPLE(?natureLabelX) AS ?natureLabel) (SAMPLE(?natureNAX) AS ?natureNA)
       (SAMPLE(?lineX) AS ?line) (SAMPLE(?lineLabelX) AS ?lineLabel) (SAMPLE(?lineNAX) AS ?lineNA)
       (SAMPLE(?imX) AS ?im) (SAMPLE(?imLabelX) AS ?imLabel) (SAMPLE(?imNAX) AS ?imNA)
       (SAMPLE(?startUopidX) AS ?startUopid) (SAMPLE(?startNameX) AS ?startName)
       (SAMPLE(?endUopidX) AS ?endUopid) (SAMPLE(?endNameX) AS ?endName)
       (SAMPLE(?validityLabelX) AS ?validityLabel) (COUNT(DISTINCT ?track) AS ?tracks) WHERE {
  ${s} a era:SectionOfLine ; era:opStart/era:uopid ?startUopidX ; era:opEnd/era:uopid ?endUopidX .
  OPTIONAL { ${s} era:opStart/era:opName ?startNameX . FILTER(LANG(?startNameX) = "en") }
  OPTIONAL { ${s} era:opEnd/era:opName ?endNameX . FILTER(LANG(?endNameX) = "en") }
  OPTIONAL { ${s} rdfs:label ?labelX . FILTER(LANG(?labelX) IN ("en", "")) }
  OPTIONAL { ${s} era:lengthOfSectionOfLine ?lenX }
  OPTIONAL { ${s} era:notApplicable era:lengthOfSectionOfLine . BIND(true AS ?lenNAX) }
  ${linked("era:solNature", "nature")}
  ${linked("era:nationalLine", "line")}
  ${linked("era:infrastructureManager", "im")}
  OPTIONAL { ${s} era:validity/rdfs:label ?validityLabelX . FILTER(LANG(?validityLabelX) IN ("en", "")) }
  OPTIONAL { ${s} era:hasPart|^era:isPartOf ?track . ?track a era:RunningTrack }
}`;
}
