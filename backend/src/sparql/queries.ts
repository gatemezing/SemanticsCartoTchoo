import { countryAuthorityUri } from "../config.js";
import { countryOfUopid, getCountry, uopidPrefixOf } from "../countries.js";
import { BadRequestError } from "../errors.js";

export const ERA = "http://data.europa.eu/949/";
export const TIME_PREFIX = `PREFIX time: <http://www.w3.org/2006/time#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>`;

/** See CountryInfo.validityStrategy for the full rationale. */
export function strategyFor(countryPrefix: string): "range" | "annual-begin" {
  return getCountry(countryPrefix)?.validityStrategy ?? "range";
}

/** The uopid prefix to filter on for a registry country code (they differ
 *  for Greece — see CountryInfo.uopidPrefix). */
export function uopidPrefixFor(countryCode: string): string {
  const country = getCountry(countryCode);
  return country ? uopidPrefixOf(country) : countryCode;
}

/** Escapes a value for safe interpolation into a SPARQL string literal.
 *  Only ever fed a server-configured country prefix, never user input, but
 *  kept strict regardless. */
export function assertSafeCountryPrefix(prefix: string): void {
  if (!/^[A-Z]{2}$/.test(prefix)) {
    throw new Error(`Invalid country uopid prefix: "${prefix}"`);
  }
}

/** uopid comes straight from a URL path param (the detail endpoint), so
 *  this one really is a user-input boundary, not just defense in depth.
 *  It's interpolated inside a "..." SPARQL string literal, which only `"`,
 *  `\` and line breaks can escape — none of which this allows. The set is
 *  what real uopids use, surveyed live (2026-10): beyond A-Z/0-9, 2,734
 *  uopids (SE, NL, IE, DE, LT, NO, LU, AT, SI) contain lower-case and
 *  non-ASCII letters (ö, Å, Ø, Æ…), spaces, `+` and `-`; the longest
 *  was 12 characters. */
export function assertSafeUopid(uopid: string): void {
  if (!/^[\p{L}\p{N} +-]{1,20}$/u.test(uopid)) {
    throw new BadRequestError(`Invalid uopid: "${uopid}"`);
  }
}

/** RINF keeps past, current, and future-dated versions of the same
 *  real-world entity simultaneously in the graph, each a distinct subject
 *  sharing one uopid/identity — confirmed live on Germany, whose
 *  operational points and sections of line are versioned in exact
 *  calendar years (2025, 2026, 2027 all present for the same uopid),
 *  which without this filter renders as triplicated points/lines.
 *
 *  Kept: a subject with no era:validity at all (unversioned — e.g. all
 *  2,520 Spanish sections of line, and 656 French operational points,
 *  mostly "technical change" points, confirmed live 2026-10), or one with
 *  a validity window that is current under the country's strategy:
 *
 *  - "range" (default): the window contains today (`xsd:date(NOW())`, not
 *    a hardcoded year, so this stays correct without a yearly change).
 *    An open-ended window (begin, no end) counts as still running — the
 *    norm, not an edge case, for several providers: 3,308 of 3,310 Swiss
 *    operational points, 2,342 of 2,344 Spanish and 719 of 730 Norwegian
 *    ones. Requiring an end date had silently emptied those maps.
 *  - "annual-begin": the window *begins* in the current calendar year.
 *    Needed for Germany, which submits overlapping multi-year windows
 *    (2025-01-01..2026-12-31 alongside 2026-01-01..2027-12-31 for the
 *    same uopid) that "range" can't disambiguate, and open-ended
 *    next-year versions (2027-01-01..) that must stay out. Would be wrong
 *    as a default: France's windows are long-lived (1800..2382).
 *
 *  Measured duplicates under these rules (uopids with more than one kept
 *  subject, 2026-10): CH 2, FR 2, DE 0, ES 0, NO 0 — accepted, not worth
 *  restructuring every query to group by uopid.
 *
 *  It's a correlated FILTER rather than a GROUP BY subquery: a filter
 *  can't multiply rows when a subject has several current validity
 *  statements, and it was measured faster on the largest countries
 *  (FR sections 92s → 13s, DE sections 38s → 13s, FR points 102s → 77s).
 *
 *  `suffix` disambiguates the SPARQL variables when applied to more than
 *  one subject in the same query (e.g. a section of line's two endpoints). */
export function validNow(
  subjectVar: string,
  suffix: string,
  strategy: "range" | "annual-begin",
): string {
  return `FILTER(NOT EXISTS { ${subjectVar} era:validity ?anyValidity${suffix} } || EXISTS {
      ${validityWindowPattern(subjectVar, suffix, strategy, `?validity${suffix}`)}
    })`;
}

function validityWindowPattern(
  subjectVar: string,
  suffix: string,
  strategy: "range" | "annual-begin",
  validityVar: string,
): string {
  // Instants are written as time:inXSDDate by most providers, but as
  // time:inXSDDateTimeStamp by some (confirmed live: three Austrian IMs —
  // 93 operational points, 83 sections, 128 signals), so any of the three
  // XSD time properties is read and cut down to its date. An end instant
  // with none of them (seen on the same Austrian data) counts as open.
  const instant = "time:inXSDDate|time:inXSDDateTimeStamp|time:inXSDDateTime";
  const dateFilter =
    strategy === "annual-begin"
      ? `FILTER(YEAR(?begin${suffix}) = YEAR(NOW()))`
      : `FILTER(?begin${suffix} <= xsd:date(NOW()) && (!BOUND(?end${suffix}) || ?end${suffix} >= xsd:date(NOW())))`;
  return `${subjectVar} era:validity ${validityVar} .
      ${validityVar} time:hasBeginning/(${instant}) ?beginRaw${suffix} .
      BIND(xsd:date(SUBSTR(STR(?beginRaw${suffix}), 1, 10)) AS ?begin${suffix})
      OPTIONAL {
        ${validityVar} time:hasEnd/(${instant}) ?endRaw${suffix} .
        BIND(xsd:date(SUBSTR(STR(?endRaw${suffix}), 1, 10)) AS ?end${suffix})
      }
      ${dateFilter}`;
}

/** Some free-text RINF literals (e.g. era:opName) occasionally carry more
 *  than one value in the same language for the same subject — a data-entry
 *  duplicate in the source, not something to interpret (confirmed live: one
 *  French operational point has both "Limite SNCF-RESEAU - EuroTunnel" and
 *  "Limite SNCF RESEAU - EuroTunnel" as era:opName@en, which without this
 *  silently doubled that one point on the map). A GROUP BY/SAMPLE
 *  subquery — the same technique already used for geometry ambiguity —
 *  picks one deterministically instead of multiplying the row. Behaves
 *  exactly like `OPTIONAL { subject predicate ?out FILTER lang }` when
 *  there's at most one match.
 *
 *  The subquery is uncorrelated (evaluated before the join), so it's
 *  scoped by `subjectScope` (predicate-object list for the subject):
 *  pass a narrower one — e.g. a fixed uopid — when only one subject is
 *  wanted. Without the class scope, a predicate shared by every
 *  infrastructure element (era:inCountry is on 800k+ subjects) made the
 *  operational-points query cost ~70s for any country, even Luxembourg's
 *  99 points; scoped, ~12s with identical results (measured 2026-10). */
export function sampleOptional(
  subjectVar: string,
  predicate: string,
  rawVar: string,
  outVar: string,
  lang: string,
  subjectScope = "a era:OperationalPoint",
): string {
  return `OPTIONAL {
    SELECT ${subjectVar} (SAMPLE(${rawVar}) AS ${outVar}) WHERE {
      ${subjectVar} ${subjectScope} ; ${predicate} ${rawVar} . FILTER(LANG(${rawVar}) = "${lang}")
    } GROUP BY ${subjectVar}
  }`;
}

/** Same problem as sampleOptional, one level deeper: a subject can have
 *  more than one value of a *reference* property too (confirmed live: a
 *  German operational point has two different era:opType assignments,
 *  concepts/op-types/70 and /120, which without this doubled it on the
 *  map exactly like the opName case). Picks one URI via SAMPLE first,
 *  then resolves that URI's label — also sampled, since providers can
 *  add their own labels to shared concepts (confirmed live: the Greek
 *  graph labels the EU country concept "GRC"@en next to ERA's
 *  "Greece"@en, which doubled every Greek operational point). Labels from
 *  ERA's own vocabulary graphs (graph/rinf/...) win. Behaves exactly like
 *  `OPTIONAL { subject predicate ?uri . OPTIONAL { ?uri labelPredicate
 *  ?label FILTER lang } }` when there's at most one match. */
export function sampleLinkedOptional(
  subjectVar: string,
  predicate: string,
  rawLinkVar: string,
  linkVar: string,
  labelPredicate: string,
  labelVar: string,
  lang: string,
  subjectScope = "a era:OperationalPoint",
): string {
  return `OPTIONAL {
    {
      SELECT ${subjectVar} (SAMPLE(${rawLinkVar}) AS ${linkVar}) WHERE {
        ${subjectVar} ${subjectScope} ; ${predicate} ${rawLinkVar} .
      } GROUP BY ${subjectVar}
    }
    OPTIONAL {
      SELECT ${linkVar} (COALESCE(SAMPLE(${labelVar}Vocab), SAMPLE(${labelVar}Any)) AS ${labelVar}) WHERE {
        ${linkVar} ${labelPredicate} ${labelVar}Any . FILTER(LANG(${labelVar}Any) = "${lang}")
        OPTIONAL {
          GRAPH ${labelVar}Graph { ${linkVar} ${labelPredicate} ${labelVar}Vocab . }
          FILTER(STRSTARTS(STR(${labelVar}Graph), "${ERA}graph/rinf/") && LANG(${labelVar}Vocab) = "${lang}")
        }
      } GROUP BY ${linkVar}
    }
  }`;
}

/** One WKT per subject (SAMPLE: some have several), from either place
 *  RINF puts it — the usual era:netReference node, or directly on the
 *  subject, which some providers use instead (confirmed live, 2026-10:
 *  all 713 Norwegian sections of line, 2,596 primary locations, a few
 *  operational points). The class constraint keeps the direct branch
 *  from scanning every geometry in the store. */
export function geometryOf(subjectVar: string, classIri: string): string {
  // The net-reference geometry wins when both exist: Norway's operational
  // points have a net-reference POINT and, directly, a collection of
  // track lines (their footprint), which SAMPLE would otherwise pick at
  // random.
  return `{
    SELECT ${subjectVar} (COALESCE(SAMPLE(?netWkt), SAMPLE(?directWkt)) AS ?wkt) WHERE {
      ${subjectVar} a ${classIri} .
      OPTIONAL { ${subjectVar} era:netReference/geo:hasGeometry/geo:asWKT ?netWkt . }
      OPTIONAL { ${subjectVar} geo:hasGeometry/geo:asWKT ?directWkt . }
      FILTER(BOUND(?netWkt) || BOUND(?directWkt))
    } GROUP BY ${subjectVar}
  }`;
}

/** All operational points for one country, deduplicated to one row per
 *  point (an OperationalPoint can have more than one era:netReference
 *  node — see plan notes), each carrying the "value / not_applicable /
 *  not_available_in_rinf" signal for opName/opType/inCountry via a
 *  sibling `*NA` binding meaning "explicitly not applicable". */
export function buildOperationalPointsQuery(countryPrefix: string): string {
  assertSafeCountryPrefix(countryPrefix);
  return `PREFIX era: <${ERA}>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
${TIME_PREFIX}
SELECT ?op ?uopid ?opName ?opNameNA ?wkt ?opTypeURI ?opTypeLabel ?opTypeNA ?countryURI ?countryLabel ?countryNA WHERE {
  ?op a era:OperationalPoint ;
      era:uopid ?uopid .
  FILTER(STRSTARTS(?uopid, "${uopidPrefixFor(countryPrefix)}"))
  ${validNow("?op", "Op", strategyFor(countryPrefix))}
  ${geometryOf("?op", "era:OperationalPoint")}
  ${sampleOptional("?op", "era:opName", "?opNameX", "?opName", "en")}
  OPTIONAL { ?op era:notApplicable era:opName . BIND(true AS ?opNameNA) }
  ${sampleLinkedOptional("?op", "era:opType", "?opTypeURIx", "?opTypeURI", "skos:prefLabel", "?opTypeLabel", "en")}
  OPTIONAL { ?op era:notApplicable era:opType . BIND(true AS ?opTypeNA) }
  ${sampleLinkedOptional("?op", "era:inCountry", "?countryURIx", "?countryURI", "skos:prefLabel", "?countryLabel", "en")}
  OPTIONAL { ?op era:notApplicable era:inCountry . BIND(true AS ?countryNA) }
}`;
}

/** Sections of line for one country, keyed by their two endpoint
 *  operational points. Geometry is always the two-point straight line
 *  between those endpoints (see plan notes on approximated geometry).
 *  Validity is checked on the section itself and on both endpoints, so a
 *  currently-valid line is never paired with a stale-versioned station. */
export function buildSectionsOfLineQuery(countryPrefix: string): string {
  assertSafeCountryPrefix(countryPrefix);
  return `PREFIX era: <${ERA}>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
${TIME_PREFIX}
SELECT ?sol ?opStart ?opStartUopid ?opStartName ?opEnd ?opEndUopid ?opEndName ?wkt WHERE {
  ?sol a era:SectionOfLine ;
       era:opStart ?opStart ;
       era:opEnd ?opEnd .
  ?opStart era:uopid ?opStartUopid .
  ?opEnd era:uopid ?opEndUopid .
  ${sampleOptional("?opStart", "era:opName", "?opStartNameX", "?opStartName", "en")}
  ${sampleOptional("?opEnd", "era:opName", "?opEndNameX", "?opEndName", "en")}
  FILTER(STRSTARTS(?opStartUopid, "${uopidPrefixFor(countryPrefix)}"))
  ${validNow("?sol", "Sol", strategyFor(countryPrefix))}
  ${validNow("?opStart", "Start", strategyFor(countryPrefix))}
  ${validNow("?opEnd", "End", strategyFor(countryPrefix))}
  ${geometryOf("?sol", "era:SectionOfLine")}
}`;
}

/** Tunnels for one country. Unlike sections of line, a tunnel's two-point
 *  LineString genuinely is its portal-to-portal geometry (not a stand-in
 *  for missing detail), so it's rendered as real geometry, not dashed.
 *  Takes the country code (not the authority URI directly) so it can also
 *  look up the right validity strategy — tunnels don't carry a uopid to
 *  derive that from the way other entities do. */
export function buildTunnelsQuery(countryCode: string): string {
  const country = getCountry(countryCode);
  if (!country) throw new Error(`Unknown country code: "${countryCode}"`);
  return `PREFIX era: <${ERA}>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
${TIME_PREFIX}
SELECT ?t ?label ?labelNA ?length ?lengthNA ?wkt WHERE {
  ?t a era:Tunnel ;
     era:inCountry <${countryAuthorityUri(country.iso3)}> .
  ${validNow("?t", "T", country.validityStrategy ?? "range")}
  ${geometryOf("?t", "era:Tunnel")}
  OPTIONAL { ?t era:tunnelIdentification ?label }
  OPTIONAL { ?t era:notApplicable era:tunnelIdentification . BIND(true AS ?labelNA) }
  OPTIONAL { ?t era:lengthOfTunnel ?length }
  OPTIONAL { ?t era:notApplicable era:lengthOfTunnel . BIND(true AS ?lengthNA) }
}`;
}

/** era:PrimaryLocation instances for one country, each carrying its parent
 *  operational point's uopid/name/subject-URI so the frontend can always
 *  show which operational point a primary location belongs to. An
 *  operational point can have zero, one, or several — each becomes its own
 *  row/feature here. Only primary locations with their own geometry can be
 *  plotted, which the join below requires implicitly. */
export function buildPrimaryLocationsQuery(countryPrefix: string): string {
  assertSafeCountryPrefix(countryPrefix);
  // One correlated aggregate grouped per primary location, instead of
  // uncorrelated per-subject subqueries: the previous shape exceeded the
  // endpoint's 120s limit for every country tested (even Luxembourg);
  // this one answers in ~8s for France or Germany (measured 2026-10). It
  // also collapses a primary location linked from two versions of its
  // operational point into one feature.
  return `PREFIX era: <${ERA}>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
${TIME_PREFIX}
SELECT ?pl (SAMPLE(?opX) AS ?op) (SAMPLE(?opUopidX) AS ?opUopid) (SAMPLE(?opNameX) AS ?opName)
       (SAMPLE(?plCodeX) AS ?plCode) (COALESCE(SAMPLE(?netWkt), SAMPLE(?directWkt)) AS ?wkt) WHERE {
  ?opX a era:OperationalPoint ;
       era:uopid ?opUopidX ;
       era:primaryLocation ?pl .
  FILTER(STRSTARTS(?opUopidX, "${uopidPrefixFor(countryPrefix)}"))
  ${validNow("?opX", "Op", strategyFor(countryPrefix))}
  ?pl era:primaryLocationCode ?plCodeX .
  OPTIONAL { ?pl era:netReference/geo:hasGeometry/geo:asWKT ?netWkt . }
  OPTIONAL { ?pl geo:hasGeometry/geo:asWKT ?directWkt . }
  FILTER(BOUND(?netWkt) || BOUND(?directWkt))
  OPTIONAL { ?opX era:opName ?opNameX . FILTER(LANG(?opNameX) = "en") }
} GROUP BY ?pl`;
}

/** Full detail for one operational point, looked up by its public uopid
 *  (not the graph's internal subject URI) — filtered to the currently
 *  valid version, since more than one dated version can share a uopid.
 *  partsCount and primaryLocationCodes are pre-aggregated in their own
 *  subqueries to avoid a cross-product blow-up when an OP has several of
 *  each. */
export function buildOperationalPointDetailQuery(uopid: string): string {
  assertSafeUopid(uopid);
  // uopid is always country-prefixed (e.g. "DE0ANEB", "FR0000007913"), the
  // same convention the rest of the app relies on to derive a country.
  const strategy = countryOfUopid(uopid)?.validityStrategy ?? "range";
  // Every helper subquery is pinned to this uopid: they're uncorrelated,
  // so with only a class scope each one ran over all operational points
  // (~12s per detail lookup); pinned, they touch one subject.
  const scope = `a era:OperationalPoint ; era:uopid "${uopid}"`;
  return `PREFIX era: <${ERA}>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
${TIME_PREFIX}
SELECT ?op ?opName ?opNameNA ?opTypeURI ?opTypeLabel ?opTypeNA ?countryURI ?countryLabel ?countryNA ?validityLabel ?partsCount ?primaryLocationCodes WHERE {
  ?op a era:OperationalPoint ;
      era:uopid "${uopid}" .
  ${validNow("?op", "Op", strategy)}
  ${sampleOptional("?op", "era:opName", "?opNameX", "?opName", "en", scope)}
  OPTIONAL { ?op era:notApplicable era:opName . BIND(true AS ?opNameNA) }
  ${sampleLinkedOptional("?op", "era:opType", "?opTypeURIx", "?opTypeURI", "skos:prefLabel", "?opTypeLabel", "en", scope)}
  OPTIONAL { ?op era:notApplicable era:opType . BIND(true AS ?opTypeNA) }
  ${sampleLinkedOptional("?op", "era:inCountry", "?countryURIx", "?countryURI", "skos:prefLabel", "?countryLabel", "en", scope)}
  OPTIONAL { ?op era:notApplicable era:inCountry . BIND(true AS ?countryNA) }
  OPTIONAL { ?op era:validity/rdfs:label ?validityLabel . FILTER(LANG(?validityLabel) = "en") }
  OPTIONAL {
    SELECT ?op (COUNT(?part) AS ?partsCount) WHERE {
      ?op ${scope} ; era:hasPart ?part .
    } GROUP BY ?op
  }
  OPTIONAL {
    SELECT ?op (GROUP_CONCAT(DISTINCT ?code; separator="|") AS ?primaryLocationCodes) WHERE {
      ?op ${scope} ; era:primaryLocation/era:primaryLocationCode ?code .
    } GROUP BY ?op
  }
}`;
}

/** The IRI comes straight from a query parameter (the Describe view lets
 *  users follow any link), so it's interpolated as `<...>` only after
 *  checking it's an absolute http(s) IRI with none of the characters the
 *  SPARQL IRIREF production forbids — which is also exactly the set that
 *  could close the `<...>` early and inject query text. */
export function assertSafeIri(iri: string): void {
  if (
    iri.length > 2000 ||
    !/^https?:\/\/[^\s<>"{}|\\^`]+$/.test(iri)
  ) {
    throw new BadRequestError(`Invalid IRI: "${iri.slice(0, 200)}"`);
  }
}

export const DESCRIBE_LIMIT = 1000;

/** The raw neighbourhood of one IRI, outgoing (`<iri> ?p ?node`) or
 *  incoming (`?node ?p <iri>`). Not SPARQL DESCRIBE itself: its result
 *  shape is store-defined (GraphDB returns a CBD-ish graph without the
 *  labels the UI needs), whereas a SELECT gives a predictable table.
 *
 *  The row cap is applied in an inner subquery *before* label lookup and
 *  grouping, so a resource with a huge in-degree (a country, a SKOS
 *  concept every track points at) costs one bounded scan, not a GROUP BY
 *  over millions of rows. One extra row is fetched so the caller can tell
 *  "exactly the limit" from "truncated". Labels are SAMPLEd because some
 *  resources carry more than one label in the same language. */
export function buildDescribeQuery(
  iri: string,
  direction: "out" | "in",
  limit = DESCRIBE_LIMIT,
): string {
  assertSafeIri(iri);
  const pattern =
    direction === "out" ? `<${iri}> ?p ?node` : `?node ?p <${iri}>`;
  return `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?p ?node (SAMPLE(?pl) AS ?pLabel) (SAMPLE(?nl) AS ?nodeLabel) WHERE {
  { SELECT ?p ?node WHERE { ${pattern} } LIMIT ${limit + 1} }
  OPTIONAL { ?p rdfs:label ?pl . FILTER(LANG(?pl) IN ("en", "")) }
  OPTIONAL {
    ?node skos:prefLabel|rdfs:label ?nl .
    FILTER(isIRI(?node) && LANG(?nl) IN ("en", ""))
  }
} GROUP BY ?p ?node`;
}

/** Sections of one country that are valid now: the same scope and
 *  validity rule as the sections-of-line layer, as a reusable pattern
 *  binding `?sol`. */
export function countrySectionsPattern(countryPrefix: string): string {
  assertSafeCountryPrefix(countryPrefix);
  return `?sol a era:SectionOfLine ; era:opStart/era:uopid ?solStartUopid .
  FILTER(STRSTARTS(?solStartUopid, "${uopidPrefixFor(countryPrefix)}"))
  ${validNow("?sol", "Sol", strategyFor(countryPrefix))}`;
}

export const TURTLE_EXPORT_LIMIT = 10000;

/** The outgoing triples of one resource as an RDF graph, for download as
 *  Turtle — the same neighbourhood as the Describe view's "outgoing" tab,
 *  but as data rather than a table. */
export function buildDescribeConstructQuery(iri: string): string {
  assertSafeIri(iri);
  return `CONSTRUCT { <${iri}> ?p ?o } WHERE { <${iri}> ?p ?o } LIMIT ${TURTLE_EXPORT_LIMIT}`;
}
