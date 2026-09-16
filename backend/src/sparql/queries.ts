const ERA = "http://data.europa.eu/949/";

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
SELECT ?op ?uopid ?opName ?opNameNA ?wkt ?opTypeURI ?opTypeLabel ?opTypeNA ?countryURI ?countryLabel ?countryNA WHERE {
  ?op a era:OperationalPoint ;
      era:uopid ?uopid .
  FILTER(STRSTARTS(?uopid, "${countryPrefix}"))
  {
    SELECT ?op (SAMPLE(?wktX) AS ?wkt) WHERE {
      ?op era:netReference ?nr .
      ?nr geo:hasGeometry/geo:asWKT ?wktX .
    } GROUP BY ?op
  }
  OPTIONAL { ?op era:opName ?opName . FILTER(LANG(?opName) = "en") }
  OPTIONAL { ?op era:notApplicable era:opName . BIND(true AS ?opNameNA) }
  OPTIONAL {
    ?op era:opType ?opTypeURI .
    OPTIONAL { ?opTypeURI skos:prefLabel ?opTypeLabel . FILTER(LANG(?opTypeLabel) = "en") }
  }
  OPTIONAL { ?op era:notApplicable era:opType . BIND(true AS ?opTypeNA) }
  OPTIONAL {
    ?op era:inCountry ?countryURI .
    OPTIONAL { ?countryURI skos:prefLabel ?countryLabel . FILTER(LANG(?countryLabel) = "en") }
  }
  OPTIONAL { ?op era:notApplicable era:inCountry . BIND(true AS ?countryNA) }
}`;
}

/** Sections of line for one country, keyed by their two endpoint
 *  operational points. Geometry is always the two-point straight line
 *  between those endpoints (see plan notes on approximated geometry). */
export function buildSectionsOfLineQuery(countryPrefix: string): string {
  assertSafeCountryPrefix(countryPrefix);
  return `PREFIX era: <${ERA}>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
SELECT ?sol ?opStart ?opStartUopid ?opStartName ?opEnd ?opEndUopid ?opEndName ?wkt WHERE {
  ?sol a era:SectionOfLine ;
       era:opStart ?opStart ;
       era:opEnd ?opEnd .
  ?opStart era:uopid ?opStartUopid .
  ?opEnd era:uopid ?opEndUopid .
  OPTIONAL { ?opStart era:opName ?opStartName . FILTER(LANG(?opStartName) = "en") }
  OPTIONAL { ?opEnd era:opName ?opEndName . FILTER(LANG(?opEndName) = "en") }
  FILTER(STRSTARTS(?opStartUopid, "${countryPrefix}"))
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
 *  for missing detail), so it's rendered as real geometry, not dashed. */
export function buildTunnelsQuery(countryAuthorityUri: string): string {
  return `PREFIX era: <${ERA}>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
SELECT ?t ?label ?labelNA ?length ?lengthNA ?wkt WHERE {
  ?t a era:Tunnel ;
     era:inCountry <${countryAuthorityUri}> .
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
SELECT ?op ?opUopid ?opName ?pl ?plCode ?wkt WHERE {
  ?op a era:OperationalPoint ;
      era:uopid ?opUopid ;
      era:primaryLocation ?pl .
  FILTER(STRSTARTS(?opUopid, "${countryPrefix}"))
  OPTIONAL { ?op era:opName ?opName . FILTER(LANG(?opName) = "en") }
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
 *  (not the graph's internal subject URI). partsCount and
 *  primaryLocationCodes are pre-aggregated in their own subqueries to avoid
 *  a cross-product blow-up when an OP has several of each. */
export function buildOperationalPointDetailQuery(uopid: string): string {
  assertSafeUopid(uopid);
  return `PREFIX era: <${ERA}>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?op ?opName ?opNameNA ?opTypeURI ?opTypeLabel ?opTypeNA ?countryURI ?countryLabel ?countryNA ?validityLabel ?partsCount ?primaryLocationCodes WHERE {
  ?op a era:OperationalPoint ;
      era:uopid "${uopid}" .
  OPTIONAL { ?op era:opName ?opName . FILTER(LANG(?opName) = "en") }
  OPTIONAL { ?op era:notApplicable era:opName . BIND(true AS ?opNameNA) }
  OPTIONAL {
    ?op era:opType ?opTypeURI .
    OPTIONAL { ?opTypeURI skos:prefLabel ?opTypeLabel . FILTER(LANG(?opTypeLabel) = "en") }
  }
  OPTIONAL { ?op era:notApplicable era:opType . BIND(true AS ?opTypeNA) }
  OPTIONAL {
    ?op era:inCountry ?countryURI .
    OPTIONAL { ?countryURI skos:prefLabel ?countryLabel . FILTER(LANG(?countryLabel) = "en") }
  }
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
