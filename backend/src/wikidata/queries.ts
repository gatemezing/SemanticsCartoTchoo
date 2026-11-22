import type { CountryInfo } from "@carto-rinf/shared-types";

/** Only ever fed server-configured registry values (../countries.ts), never
 *  user input — kept strict regardless, since they're interpolated
 *  directly into the query. */
function assertSafe(value: string | undefined, pattern: RegExp, what: string): void {
  if (value !== undefined && !pattern.test(value)) {
    throw new Error(`Invalid ${what}: "${value}"`);
  }
}

/** Wikidata items that can be matched to one country's RINF primary
 *  locations, by any of three keys (see WikidataStationInfo.matchedBy):
 *
 *  - PLC (wdt:P12783), the same "XXnnnnn" code as RINF's
 *    era:primaryLocationCode (Valenciennes: "FR02494" in both).
 *  - ERA ID (wdt:P11631), whose value is the operational point's uopid
 *    (its formatter is ERA's old functionalInfrastructure/operationalPoints/
 *    IRI). Measured 2026-11: 1,560 Hungarian and 368 Norwegian items, far
 *    more than the 3 it had when first tried.
 *  - UIC station code (wdt:P722) with this country's UIC prefix, for the
 *    many stations that have one but no PLC (Bern, Lausanne, Geneva…).
 *    The mapper only accepts these near RINF's position.
 *
 *  Scoped by code prefix, not by class or country: a station's type varies
 *  ("railway stop", "Haltepunkt", "S-Bahn station"… — 1,527 of the 7,528
 *  PLC items aren't typed "railway station" at all), and a code prefix is
 *  what RINF itself keys on. */
export function buildStationsQuery(country: CountryInfo, codePrefix: string): string {
  assertSafe(codePrefix, /^[A-Z]{2}$/, "code prefix");
  assertSafe(country.uicCountryCode, /^[0-9]{2}$/, "UIC country code");
  const uicBranch = country.uicCountryCode
    ? `UNION { ?station wdt:P722 ?uic . FILTER(STRSTARTS(?uic, "${country.uicCountryCode}")) }`
    : "";
  return `SELECT ?station ?stationLabel ?plc ?eraId ?uic ?coord ?wifi ?accessLabel ?platforms WHERE {
  { ?station wdt:P12783 ?plc . FILTER(STRSTARTS(?plc, "${codePrefix}")) }
  UNION { ?station wdt:P11631 ?eraId . FILTER(STRSTARTS(?eraId, "${codePrefix}")) }
  ${uicBranch}
  OPTIONAL { ?station wdt:P625 ?coord . }
  OPTIONAL { ?station wdt:P2848 ?wifi . }
  OPTIONAL { ?station wdt:P2846 ?access . }
  OPTIONAL { ?station wdt:P1103 ?platforms . }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en,fr,de,it,es,pl,nl,cs,sv,pt,da,fi,el,hu,ro,bg,hr,sk,sl,lt,lv,et".
  }
}`;
}

export type StructureKind = "tunnel" | "bridge";

/** Wikidata's classes for these, by exact type: "railway tunnel" has 1,723
 *  items in RINF's countries and "railway bridge" 4,322 (measured 2026-11). */
const STRUCTURE_CLASS: Record<StructureKind, string> = {
  tunnel: "Q1311958",
  bridge: "Q1210334",
};

/** One country's Wikidata railway tunnels or bridges that have coordinates,
 *  with the facts the popup shows. Picked by measured coverage: for
 *  tunnels length 81%, carries 74%, image 50%, operator 32%, inception
 *  30%, opening 27%, crosses 12%, heritage 7%; for bridges carries 75%,
 *  image 73%, crosses 69%, inception 23%, heritage 21%, length 20%,
 *  material 7%, height 6%, spans 5%. Quantities are read normalised to SI
 *  units, so a length given in km arrives in metres. */
export function buildStructuresQuery(kind: StructureKind, countryQid: string): string {
  assertSafe(countryQid, /^Q[1-9][0-9]*$/, "Wikidata QID");
  const quantity = (pid: string, out: string) =>
    `OPTIONAL { ?item p:${pid}/psv:${pid}/wikibase:quantityNormalized/wikibase:quantityAmount ${out} . }`;
  return `SELECT ?item ?itemLabel ?coord ?lengthM ?heightM ?spans ?spanM ?opened ?inception
       ?carriesLabel ?crossesLabel ?operatorLabel ?heritageLabel ?materialLabel ?image WHERE {
  ?item wdt:P31 wd:${STRUCTURE_CLASS[kind]} ;
        wdt:P17 wd:${countryQid} ;
        wdt:P625 ?coord .
  ${quantity("P2043", "?lengthM")}
  ${kind === "bridge" ? `${quantity("P2048", "?heightM")}
  ${quantity("P2787", "?spanM")}
  OPTIONAL { ?item wdt:P1314 ?spans . }
  OPTIONAL { ?item wdt:P186 ?material . }` : ""}
  OPTIONAL { ?item wdt:P1619 ?opened . }
  OPTIONAL { ?item wdt:P571 ?inception . }
  OPTIONAL { ?item wdt:P2505 ?carries . }
  OPTIONAL { ?item wdt:P177 ?crosses . }
  OPTIONAL { ?item wdt:P137 ?operator . }
  OPTIONAL { ?item wdt:P1435 ?heritage . }
  OPTIONAL { ?item wdt:P18 ?image . }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en,fr,de,it,es,pl,nl,cs,sv,pt,da,fi,el,hu,ro,bg,hr,sk,sl,lt,lv,et,nb".
  }
}`;
}

/** Wikidata items in the RINF countries (P17) that record Wi-Fi access
 *  (P2848) and carry a key the map matches stations on: primary location
 *  code, ERA ID or UIC station code. One query for all countries, because
 *  the query service rate-limits hard; the RINF side is then fetched for
 *  just these codes (buildPrimaryLocationsByCodeQuery). P2848 alone would
 *  also count about 15,000 libraries and museums (measured 2026-11). */
export function buildWifiStationsQuery(countryQids: readonly string[]): string {
  for (const qid of countryQids) assertSafe(qid, /^Q[1-9][0-9]*$/, "Wikidata QID");
  return `SELECT ?station ?country ?wifi ?plc ?eraId ?uic ?coord WHERE {
  VALUES ?country { ${countryQids.map((q) => `wd:${q}`).join(" ")} }
  ?station wdt:P17 ?country ; wdt:P2848 ?wifi .
  { ?station wdt:P12783 ?plc } UNION { ?station wdt:P11631 ?eraId } UNION { ?station wdt:P722 ?uic }
  OPTIONAL { ?station wdt:P625 ?coord }
}`;
}
