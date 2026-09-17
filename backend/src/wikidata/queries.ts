/** French railway stations (wd:Q55488) carrying a PLC (wdt:P12783) — the
 *  crosswalk key to RINF's era:primaryLocationCode (verified live: same
 *  "FRnnnnn" format, e.g. Valenciennes station is P12783="FR02494" and
 *  RINF primaryLocation "FR02494"). era:canonicalURI's ERA-ID counterpart
 *  (wdt:P11631) was tried first and rejected — only 3 French items in all
 *  of Wikidata carry it, vs 1,670+ for the PLC.
 *
 *  Country is hardcoded to France (wd:Q142) for v1, matching the rest of
 *  the app's scope; parameterize by country QID if that ever changes. */
export function buildFrenchStationsQuery(): string {
  return `SELECT ?station ?stationLabel ?plc ?wifiLabel ?accessLabel ?platforms WHERE {
  ?station wdt:P31 wd:Q55488 ;
           wdt:P17 wd:Q142 ;
           wdt:P12783 ?plc .
  OPTIONAL { ?station wdt:P2848 ?wifi . }
  OPTIONAL { ?station wdt:P2846 ?access . }
  OPTIONAL { ?station wdt:P1103 ?platforms . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr". }
}`;
}
