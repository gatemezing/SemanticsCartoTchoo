/** Only ever fed a server-configured Wikidata QID from ../countries.ts,
 *  never user input — kept strict regardless, since it's interpolated
 *  directly into the query. */
function assertSafeQid(qid: string): void {
  if (!/^Q[1-9][0-9]*$/.test(qid)) {
    throw new Error(`Invalid Wikidata QID: "${qid}"`);
  }
}

/** Railway stations (wd:Q55488) in one country carrying a PLC (wdt:P12783)
 *  — the crosswalk key to RINF's era:primaryLocationCode (verified live:
 *  same "XXnnnnn" format across countries, e.g. Valenciennes station is
 *  P12783="FR02494" and RINF primaryLocation "FR02494"). era:canonicalURI's
 *  ERA-ID counterpart (wdt:P11631) was tried first and rejected — it's
 *  populated on only 3 French items in all of Wikidata, vs 1,670+ for the
 *  PLC in France alone. */
export function buildStationsQuery(countryQid: string): string {
  assertSafeQid(countryQid);
  return `SELECT ?station ?stationLabel ?plc ?wifiLabel ?accessLabel ?platforms WHERE {
  ?station wdt:P31 wd:Q55488 ;
           wdt:P17 wd:${countryQid} ;
           wdt:P12783 ?plc .
  OPTIONAL { ?station wdt:P2848 ?wifi . }
  OPTIONAL { ?station wdt:P2846 ?access . }
  OPTIONAL { ?station wdt:P1103 ?platforms . }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en,fr,de,it,es,pl,nl,cs,sv,pt,da,fi,el,hu,ro,bg,hr,sk,sl,lt,lv,et".
  }
}`;
}
