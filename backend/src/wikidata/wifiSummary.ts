import {
  WIFI_ACCESS_VALUES,
  type WifiAccess,
  type WifiCounts,
  type WifiSummary,
  type WikidataStationInfo,
} from "@carto-rinf/shared-types";
import { type CountryInfo, uopidPrefixOf } from "../countries.js";
import { opTypeCode, opTypeLabelOfCode } from "../mapping/opType.js";
import type { SparqlBinding, SparqlJsonResults } from "../sparql/client.js";
import { wktToPoint } from "../wkt.js";
import { mapWikidataStations, matchWikidataStation, wifiAccess, type WikidataStationIndex } from "./mapping.js";

/** A station is a primary location whose operational point has one of these
 *  era:opType codes: ERA's "station" (op-types/10). Small stations (20),
 *  passenger terminals (30) and passenger stops (70) are other types. */
export const STATION_OP_TYPE_CODES: readonly string[] = ["10"];

export const WIFI_SUMMARY_DEFINITION =
  "A station is a RINF primary location whose operational point has era:opType “station” (ERA concept " +
  "op-types/10). Its Wi-Fi is the Wi-Fi access (P2848) of the Wikidata item matched to it on the map's keys: " +
  "primary location code (P12783), then ERA ID (P11631, the uopid), then UIC station code (P722) within 1 km. " +
  "Wikidata values: gratis → free, paid → paid, yes → available (cost not stated), no → none. The Wikidata " +
  "columns count items in the country (P17) that record Wi-Fi and carry one of those keys, matched or not.";

type ByValue = Map<WifiAccess, Set<string>>;

const add = (map: ByValue, value: WifiAccess, id: string) => {
  const set = map.get(value) ?? new Set<string>();
  set.add(id);
  map.set(value, set);
};
const countsOf = (byValue: ByValue): WifiCounts => {
  const counts: WifiCounts = { free: 0, paid: 0, available: 0, none: 0 };
  for (const [value, ids] of byValue) counts[value] = ids.size;
  return counts;
};

export interface CountryWifiStations {
  /** Wikidata's Wi-Fi items for the country, indexed for matching. */
  index: WikidataStationIndex;
  /** Those items by Wi-Fi value, matched or not. */
  wikidata: ByValue;
}

/** Splits the one Wikidata answer by country (P17) and indexes each part
 *  the way the map does, so matching uses the same keys and rules. */
export function partitionWifiStations(
  results: SparqlJsonResults,
  countries: readonly CountryInfo[],
): Map<string, CountryWifiStations> {
  const byQid = new Map(countries.map((c) => [c.wikidataQid, c]));
  const rows = new Map<string, SparqlBinding[]>();
  for (const b of results.results.bindings) {
    const country = byQid.get(b.country?.value.replace("http://www.wikidata.org/entity/", "") ?? "");
    if (!country) continue;
    const list = rows.get(country.code) ?? [];
    list.push(b);
    rows.set(country.code, list);
  }
  const out = new Map<string, CountryWifiStations>();
  for (const [code, bindings] of rows) {
    const country = countries.find((c) => c.code === code)!;
    const wikidata: ByValue = new Map();
    for (const b of bindings) {
      const value = wifiAccess(b.wifi?.value);
      if (value && b.station) add(wikidata, value, b.station.value);
    }
    const index = mapWikidataStations({ ...results, results: { bindings } }, uopidPrefixOf(country), country.uicCountryCode);
    out.set(code, { index, wikidata });
  }
  return out;
}

/** The codes to look up in RINF for one country: primary location codes,
 *  the codes UIC station codes imply, and ERA IDs (uopids). */
export function lookupKeys(index: WikidataStationIndex): { plCodes: string[]; uopids: string[] } {
  return { plCodes: [...index.byPlc.keys(), ...index.byUicKey.keys()], uopids: [...index.byEraId.keys()] };
}

const MATCH_RANK = { "primary-location-code": 3, "era-id": 2, "uic-station-code": 1 } as const;

/** RINF stations (distinct primary location codes) by the Wi-Fi of the item
 *  each one matches, from buildPrimaryLocationsByCodeQuery's rows (one per
 *  primary location and operational point). A primary location is a station
 *  when a point referencing it is typed "station"; its match is the
 *  strongest over those station points (its own code is the same for all;
 *  ERA IDs belong to points).
 *
 *  Only Wi-Fi items were fetched from Wikidata, so a station whose stronger
 *  key points at an item without Wi-Fi could take a weaker key's Wi-Fi item
 *  here, where the map (which indexes every item) would not. Two items
 *  claiming one station is rare, and the gap goes in that direction only. */
export function countStationsByWifi(rows: SparqlJsonResults, index: WikidataStationIndex): ByValue {
  const best = new Map<string, WikidataStationInfo>();
  for (const b of rows.results.bindings) {
    const code = opTypeCode(b.opTypeURI?.value);
    if (!code || !STATION_OP_TYPE_CODES.includes(code) || !b.plCode || !b.opUopid) continue;
    const point = b.wkt ? wktToPoint(b.wkt.value) : null;
    const match = matchWikidataStation(index, {
      primaryLocationCode: b.plCode.value,
      operationalPointUopid: b.opUopid.value,
      // No position: a UIC-derived match can't be checked, so it's refused.
      point: (point?.coordinates as [number, number] | undefined) ?? [Number.NaN, Number.NaN],
    });
    if (!match) continue;
    const current = best.get(b.plCode.value);
    if (!current || MATCH_RANK[match.matchedBy] > MATCH_RANK[current.matchedBy]) best.set(b.plCode.value, match);
  }
  const out: ByValue = new Map();
  for (const [plCode, match] of best) if (match.wifi) add(out, match.wifi, plCode);
  return out;
}

/** Every RINF country is listed, zeros included, so "none recorded" reads as
 *  such rather than as a missing row. */
export function buildWifiSummary(
  perCountry: readonly { country: CountryInfo; stations: ByValue; wikidata: ByValue }[],
  query: string,
  fetchedAt: string,
): WifiSummary {
  const stationsTotal: WifiCounts = { free: 0, paid: 0, available: 0, none: 0 };
  const wikidataTotal: ByValue = new Map();
  const rows = perCountry.map(({ country, stations, wikidata }) => {
    const counts = countsOf(stations);
    for (const v of WIFI_ACCESS_VALUES) stationsTotal[v] += counts[v];
    for (const [v, ids] of wikidata) for (const id of ids) add(wikidataTotal, v, id);
    return { code: country.code, label: country.label, stations: counts, wikidata: countsOf(wikidata) };
  });
  const recorded = (c: WifiCounts) => WIFI_ACCESS_VALUES.reduce((n, v) => n + c[v], 0);
  rows.sort(
    (a, b) =>
      b.stations.free - a.stations.free ||
      b.wikidata.free - a.wikidata.free ||
      recorded(b.wikidata) - recorded(a.wikidata) ||
      a.label.localeCompare(b.label),
  );
  return {
    countries: rows,
    total: { stations: stationsTotal, wikidata: countsOf(wikidataTotal) },
    stationTypes: STATION_OP_TYPE_CODES.map((code) => ({ code, label: opTypeLabelOfCode(code) ?? code })),
    definition: WIFI_SUMMARY_DEFINITION,
    query,
    fetchedAt,
  };
}
