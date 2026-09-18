/** The full country registry — derived live from the RINF/ERA graph itself
 *  (grouping era:OperationalPoint by the first two characters of era:uopid,
 *  cross-referenced with era:inCountry/skos:prefLabel), not hand-typed. One
 *  pseudo-code is deliberately excluded: "EU" appears on ~476 operational
 *  points (mostly Germany-adjacent) that don't belong to a single national
 *  network in RINF's own uopid scheme — a real but small (<1%) gap in v1's
 *  per-country coverage, not a bug in this table.
 *
 *  `iso3` and `wikidataQid` were both verified against live sources (the
 *  ISO3 values against era:inCountry's own authority-table URIs; the QIDs
 *  against Wikidata's wdt:P297 "ISO 3166-1 alpha-2 code" property) rather
 *  than typed from memory, the same discipline as everything else RINF- or
 *  Wikidata-sourced in this app. `defaultViewport` is the only
 *  approximate/non-verified field — a reasonable map center and zoom for
 *  first landing on that country, not a claimed precise centroid.
 *
 *  The CountryInfo shape itself lives in @carto-rinf/shared-types since
 *  it's served verbatim by GET /api/countries. */
import type { CountryInfo } from "@carto-rinf/shared-types";
export type { CountryInfo };

export const COUNTRIES: CountryInfo[] = [
  { code: "DE", label: "Germany", iso3: "DEU", wikidataQid: "Q183", defaultViewport: { lat: 51.0, lon: 10.4, zoom: 5.3 }, validityStrategy: "annual-begin" },
  { code: "FR", label: "France", iso3: "FRA", wikidataQid: "Q142", defaultViewport: { lat: 46.6, lon: 2.5, zoom: 5 } },
  { code: "PL", label: "Poland", iso3: "POL", wikidataQid: "Q36", defaultViewport: { lat: 52.0, lon: 19.5, zoom: 5.7 } },
  { code: "CZ", label: "Czechia", iso3: "CZE", wikidataQid: "Q213", defaultViewport: { lat: 49.8, lon: 15.5, zoom: 6.5 } },
  { code: "CH", label: "Switzerland", iso3: "CHE", wikidataQid: "Q39", defaultViewport: { lat: 46.8, lon: 8.2, zoom: 7 } },
  { code: "IT", label: "Italy", iso3: "ITA", wikidataQid: "Q38", defaultViewport: { lat: 42.8, lon: 12.6, zoom: 5.3 } },
  { code: "ES", label: "Spain", iso3: "ESP", wikidataQid: "Q29", defaultViewport: { lat: 40.3, lon: -3.7, zoom: 5.3 } },
  { code: "RO", label: "Romania", iso3: "ROU", wikidataQid: "Q218", defaultViewport: { lat: 45.9, lon: 25.0, zoom: 6 } },
  { code: "HU", label: "Hungary", iso3: "HUN", wikidataQid: "Q28", defaultViewport: { lat: 47.2, lon: 19.5, zoom: 6.5 } },
  { code: "AT", label: "Austria", iso3: "AUT", wikidataQid: "Q40", defaultViewport: { lat: 47.6, lon: 14.1, zoom: 6.5 } },
  { code: "BE", label: "Belgium", iso3: "BEL", wikidataQid: "Q31", defaultViewport: { lat: 50.6, lon: 4.7, zoom: 7 } },
  { code: "SE", label: "Sweden", iso3: "SWE", wikidataQid: "Q34", defaultViewport: { lat: 62.0, lon: 15.0, zoom: 4.3 } },
  { code: "SK", label: "Slovakia", iso3: "SVK", wikidataQid: "Q214", defaultViewport: { lat: 48.7, lon: 19.5, zoom: 7 } },
  { code: "FI", label: "Finland", iso3: "FIN", wikidataQid: "Q33", defaultViewport: { lat: 64.5, lon: 26.0, zoom: 4.7 } },
  { code: "PT", label: "Portugal", iso3: "PRT", wikidataQid: "Q45", defaultViewport: { lat: 39.6, lon: -8.0, zoom: 6 } },
  { code: "NL", label: "Netherlands", iso3: "NLD", wikidataQid: "Q55", defaultViewport: { lat: 52.2, lon: 5.5, zoom: 7 } },
  { code: "HR", label: "Croatia", iso3: "HRV", wikidataQid: "Q224", defaultViewport: { lat: 45.3, lon: 16.5, zoom: 6.7 } },
  { code: "DK", label: "Denmark", iso3: "DNK", wikidataQid: "Q35", defaultViewport: { lat: 56.0, lon: 10.0, zoom: 6 } },
  { code: "NO", label: "Norway", iso3: "NOR", wikidataQid: "Q20", defaultViewport: { lat: 62.0, lon: 10.0, zoom: 4.3 } },
  { code: "BG", label: "Bulgaria", iso3: "BGR", wikidataQid: "Q219", defaultViewport: { lat: 42.7, lon: 25.3, zoom: 6.5 } },
  { code: "SI", label: "Slovenia", iso3: "SVN", wikidataQid: "Q215", defaultViewport: { lat: 46.1, lon: 14.8, zoom: 7.7 } },
  { code: "IE", label: "Ireland", iso3: "IRL", wikidataQid: "Q27", defaultViewport: { lat: 53.4, lon: -8.0, zoom: 6.3 } },
  { code: "EL", label: "Greece", iso3: "GRC", wikidataQid: "Q41", defaultViewport: { lat: 39.5, lon: 22.0, zoom: 5.8 } },
  { code: "LT", label: "Lithuania", iso3: "LTU", wikidataQid: "Q37", defaultViewport: { lat: 55.3, lon: 23.9, zoom: 6.7 } },
  { code: "EE", label: "Estonia", iso3: "EST", wikidataQid: "Q191", defaultViewport: { lat: 58.7, lon: 25.5, zoom: 6.7 } },
  { code: "LU", label: "Luxembourg", iso3: "LUX", wikidataQid: "Q32", defaultViewport: { lat: 49.8, lon: 6.1, zoom: 9 } },
  { code: "LV", label: "Latvia", iso3: "LVA", wikidataQid: "Q211", defaultViewport: { lat: 56.9, lon: 24.6, zoom: 6.7 } },
  { code: "LI", label: "Liechtenstein", iso3: "LIE", wikidataQid: "Q347", defaultViewport: { lat: 47.14, lon: 9.55, zoom: 10.5 } },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function getCountry(code: string): CountryInfo | undefined {
  return BY_CODE.get(code.toUpperCase());
}
