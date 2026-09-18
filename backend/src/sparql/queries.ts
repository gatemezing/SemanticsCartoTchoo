import { countryAuthorityUri } from "../config.js";
import { getCountry } from "../countries.js";

const ERA = "http://data.europa.eu/949/";
const TIME_PREFIX = `PREFIX time: <http://www.w3.org/2006/time#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>`;

/** See CountryInfo.validityStrategy for the full rationale. */
function strategyFor(countryPrefix: string): "range" | "annual-begin" {
  return getCountry(countryPrefix)?.validityStrategy ?? "range";
}

/** Escapes a value for safe interpolation into a SPARQL string literal.
 *  Only ever fed a server-configured country prefix, never user input, but
 *  kept strict regardless. */
function assertSafeCountryPrefix(prefix: string): void {
  if (!/^[A-Z]{2}$/.test(prefix)) {
    throw new Error(`Invalid country uopid prefix: "${prefix}"`);
  }
}

/** uopid comes straight from a URL path param (the detail endpoint), so
 *  this one really is a user-input boundary, not just defense in depth. */
function assertSafeUopid(uopid: string): void {
  if (!/^[A-Z0-9]{1,20}$/.test(uopid)) {
    throw new Error(`Invalid uopid: "${uopid}"`);
  }
}

/** RINF keeps past, current, and future-dated versions of the same
 *  real-world entity simultaneously in the graph, each a distinct subject
 *  sharing one uopid/identity — confirmed live on Germany, whose
 *  operational points and sections of line are versioned in exact
 *  non-overlapping calendar years (e.g. 2025-01-01..2025-12-31,
 *  2026-01-01..2026-12-31, 2027-01-01..2027-12-31 all present for the same
 *  uopid), which without this filter renders as triplicated points/lines.
 *
 *  Two strategies, chosen per-country (CountryInfo.validityStrategy):
 *
 *  - "range" (default): the version whose window contains today
 *    (`xsd:date(NOW())`, not a hardcoded year, so this stays correct
 *    without a yearly code change) — collapsed to one row per *subject*
 *    via a GROUP BY/SAMPLE subquery in case that one subject somehow has
 *    more than one validity statement. This is NOT enough for Germany:
 *    also confirmed live, some German uopids have two *different* subjects
 *    whose validity windows genuinely overlap today (e.g.
 *    2025-01-01..2026-12-31 alongside 2026-01-01..2027-12-31 — both
 *    "currently valid" simultaneously, a real ambiguity in the submission,
 *    not something a range filter alone can resolve, since GROUP BY is
 *    per-subject and both subjects independently pass).
 *  - "annual-begin": requires the window to *begin* in the current
 *    calendar year instead. Resolves the Germany case above because at
 *    most one candidate begins in the current year. Would be wrong as a
 *    default: France's validity windows are long-lived (e.g.
 *    1800-01-01..2382-01-01) and were never meant to be re-filed annually,
 *    so requiring a current-year begin date would exclude everything.
 *
 *  Known residual gap (accepted, not fixed): a handful of German uopids
 *  (confirmed live: 3 out of 9,617, e.g. DE0UVIU) have two *different*
 *  subjects whose validity both begin on the exact same current-year date —
 *  a genuine duplicate-submission ambiguity in the source with no
 *  principled way to prefer one over the other from the data alone.
 *  "annual-begin" can't disambiguate a tie it wasn't designed to break.
 *  Fixing this fully would mean grouping the entire outer query by uopid
 *  (not just this validity subquery), which is a larger restructuring than
 *  a ~0.03% cosmetic duplicate on the map currently justifies.
 *
 *  `suffix` disambiguates the SPARQL variables when applied to more than
 *  one subject in the same query (e.g. a section of line's two endpoints). */
function validNow(
  subjectVar: string,
  suffix: string,
  strategy: "range" | "annual-begin",
): string {
  const dateFilter =
    strategy === "annual-begin"
      ? `FILTER(YEAR(?begin${suffix}) = YEAR(NOW()))`
      : `FILTER(?begin${suffix} <= xsd:date(NOW()) && ?end${suffix} >= xsd:date(NOW()))`;
  return `{
    SELECT ${subjectVar} (SAMPLE(?validity${suffix}) AS ?chosenValidity${suffix}) WHERE {
      ${subjectVar} era:validity ?validity${suffix} .
      ?validity${suffix} time:hasBeginning/time:inXSDDate ?begin${suffix} ;
                          time:hasEnd/time:inXSDDate ?end${suffix} .
      ${dateFilter}
    } GROUP BY ${subjectVar}
  }`;
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
 *  there's at most one match. */
function sampleOptional(
  subjectVar: string,
  predicate: string,
  rawVar: string,
  outVar: string,
  lang: string,
): string {
  return `OPTIONAL {
    SELECT ${subjectVar} (SAMPLE(${rawVar}) AS ${outVar}) WHERE {
      ${subjectVar} ${predicate} ${rawVar} . FILTER(LANG(${rawVar}) = "${lang}")
    } GROUP BY ${subjectVar}
  }`;
}

/** Same problem as sampleOptional, one level deeper: a subject can have
 *  more than one value of a *reference* property too (confirmed live: a
 *  German operational point has two different era:opType assignments,
 *  concepts/op-types/70 and /120, which without this doubled it on the
 *  map exactly like the opName case). Picks one URI via SAMPLE first,
 *  then resolves that URI's label — behaves exactly like
 *  `OPTIONAL { subject predicate ?uri . OPTIONAL { ?uri labelPredicate
 *  ?label FILTER lang } }` when there's at most one match. */
function sampleLinkedOptional(
  subjectVar: string,
  predicate: string,
  rawLinkVar: string,
  linkVar: string,
  labelPredicate: string,
  labelVar: string,
  lang: string,
): string {
  return `OPTIONAL {
    {
      SELECT ${subjectVar} (SAMPLE(${rawLinkVar}) AS ${linkVar}) WHERE {
        ${subjectVar} ${predicate} ${rawLinkVar} .
      } GROUP BY ${subjectVar}
    }
    OPTIONAL { ${linkVar} ${labelPredicate} ${labelVar} . FILTER(LANG(${labelVar}) = "${lang}") }
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
  FILTER(STRSTARTS(?uopid, "${countryPrefix}"))
  ${validNow("?op", "Op", strategyFor(countryPrefix))}
  {
    SELECT ?op (SAMPLE(?wktX) AS ?wkt) WHERE {
      ?op era:netReference ?nr .
      ?nr geo:hasGeometry/geo:asWKT ?wktX .
    } GROUP BY ?op
  }
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
  FILTER(STRSTARTS(?opStartUopid, "${countryPrefix}"))
  ${validNow("?sol", "Sol", strategyFor(countryPrefix))}
  ${validNow("?opStart", "Start", strategyFor(countryPrefix))}
  ${validNow("?opEnd", "End", strategyFor(countryPrefix))}
  {
    SELECT ?sol (SAMPLE(?wktX) AS ?wkt) WHERE {
      ?sol era:netReference ?nr .
      ?nr geo:hasGeometry/geo:asWKT ?wktX .
    } GROUP BY ?sol
  }
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
  {
    SELECT ?t (SAMPLE(?wktX) AS ?wkt) WHERE {
      ?t era:netReference ?nr .
      ?nr geo:hasGeometry/geo:asWKT ?wktX .
    } GROUP BY ?t
  }
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
  return `PREFIX era: <${ERA}>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
${TIME_PREFIX}
SELECT ?op ?opUopid ?opName ?pl ?plCode ?wkt WHERE {
  ?op a era:OperationalPoint ;
      era:uopid ?opUopid ;
      era:primaryLocation ?pl .
  FILTER(STRSTARTS(?opUopid, "${countryPrefix}"))
  ${validNow("?op", "Op", strategyFor(countryPrefix))}
  ${sampleOptional("?op", "era:opName", "?opNameX", "?opName", "en")}
  ?pl era:primaryLocationCode ?plCode .
  {
    SELECT ?pl (SAMPLE(?wktX) AS ?wkt) WHERE {
      ?pl era:netReference ?nr .
      ?nr geo:hasGeometry/geo:asWKT ?wktX .
    } GROUP BY ?pl
  }
}`;
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
  const strategy = strategyFor(uopid.slice(0, 2));
  return `PREFIX era: <${ERA}>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
${TIME_PREFIX}
SELECT ?op ?opName ?opNameNA ?opTypeURI ?opTypeLabel ?opTypeNA ?countryURI ?countryLabel ?countryNA ?validityLabel ?partsCount ?primaryLocationCodes WHERE {
  ?op a era:OperationalPoint ;
      era:uopid "${uopid}" .
  ${validNow("?op", "Op", strategy)}
  ${sampleOptional("?op", "era:opName", "?opNameX", "?opName", "en")}
  OPTIONAL { ?op era:notApplicable era:opName . BIND(true AS ?opNameNA) }
  ${sampleLinkedOptional("?op", "era:opType", "?opTypeURIx", "?opTypeURI", "skos:prefLabel", "?opTypeLabel", "en")}
  OPTIONAL { ?op era:notApplicable era:opType . BIND(true AS ?opTypeNA) }
  ${sampleLinkedOptional("?op", "era:inCountry", "?countryURIx", "?countryURI", "skos:prefLabel", "?countryLabel", "en")}
  OPTIONAL { ?op era:notApplicable era:inCountry . BIND(true AS ?countryNA) }
  OPTIONAL { ?op era:validity/rdfs:label ?validityLabel . FILTER(LANG(?validityLabel) = "en") }
  OPTIONAL {
    SELECT ?op (COUNT(?part) AS ?partsCount) WHERE {
      ?op era:hasPart ?part .
    } GROUP BY ?op
  }
  OPTIONAL {
    SELECT ?op (GROUP_CONCAT(DISTINCT ?code; separator="|") AS ?primaryLocationCodes) WHERE {
      ?op era:primaryLocation/era:primaryLocationCode ?code .
    } GROUP BY ?op
  }
}`;
}
