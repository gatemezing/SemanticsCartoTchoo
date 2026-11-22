import type { WikidataStationInfo } from "@carto-rinf/shared-types";
import type { SparqlBinding, SparqlJsonResults } from "../sparql/client.js";

/** What a station offers before it's matched to anything. */
export type WikidataStationFacts = Omit<WikidataStationInfo, "matchedBy" | "matchedValue">;

interface Candidate {
  facts: WikidataStationFacts;
  /** [lon, lat] from wdt:P625, when Wikidata has one. */
  coord?: [number, number];
}

/** One country's Wikidata stations, indexed by each key they can be
 *  matched on. When two items share a PLC or ERA ID (rare: 1,670 rows for
 *  1,666 distinct French PLCs), the first one wins, since nothing in this
 *  data says which duplicate is right. A UIC key keeps every candidate,
 *  because the closest one is chosen at match time. */
export interface WikidataStationIndex {
  byPlc: Map<string, Candidate>;
  byEraId: Map<string, Candidate>;
  /** Keyed by the primary location code a UIC station code implies:
   *  code prefix + its 5-digit station number ("8507000" → "CH07000"). */
  byUicKey: Map<string, { candidate: Candidate; uic: string }[]>;
}

export const EMPTY_WIKIDATA_INDEX: WikidataStationIndex = {
  byPlc: new Map(),
  byEraId: new Map(),
  byUicKey: new Map(),
};

const WIFI_BY_VALUE: Record<string, NonNullable<WikidataStationInfo["wifi"]>> = {
  Q1543615: "free", // gratis
  Q24202480: "paid",
  Q6452715: "available", // "yes": cost not stated
  Q1814990: "none", // "no"
};

/** P2848's value item → what the popup says. Unknown values are dropped
 *  rather than guessed. */
export function wifiAccess(valueIri: string | undefined): WikidataStationInfo["wifi"] {
  return valueIri ? WIFI_BY_VALUE[valueIri.replace("http://www.wikidata.org/entity/", "")] : undefined;
}

/** A UIC-derived match is accepted only this close to RINF's position. */
export const UIC_MATCH_MAX_KM = 1;

function parsePoint(wkt: string): [number, number] | undefined {
  const m = /^Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/i.exec(wkt.trim());
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

/** "8507000" or "85070003" (with check digit) → "CH07000" for prefix
 *  "CH" and UIC country code "85"; undefined when it isn't this country's. */
export function uicKey(uic: string, codePrefix: string, uicCountryCode: string): string | undefined {
  const digits = uic.replace(/\s/g, "");
  if (!/^\d{7,8}$/.test(digits) || !digits.startsWith(uicCountryCode)) return undefined;
  return `${codePrefix}${digits.slice(2, 7)}`;
}

export function mapWikidataStations(
  results: SparqlJsonResults,
  codePrefix: string,
  uicCountryCode: string | undefined,
): WikidataStationIndex {
  // Rows are one per key value and OPTIONAL combination: gather each item
  // first, then index it under every key it has.
  const items = new Map<string, { rows: SparqlBinding[] }>();
  for (const b of results.results.bindings) {
    const iri = b.station.value;
    const item = items.get(iri) ?? { rows: [] };
    item.rows.push(b);
    items.set(iri, item);
  }

  const index: WikidataStationIndex = { byPlc: new Map(), byEraId: new Map(), byUicKey: new Map() };
  for (const [iri, { rows }] of items) {
    const first = <K extends string>(key: K) => rows.find((r) => r[key])?.[key]?.value;
    const facts: WikidataStationFacts = {
      qid: iri.replace("http://www.wikidata.org/entity/", ""),
      sourceUrl: iri,
    };
    const label = first("stationLabel");
    // The label service falls back to the bare QID when no listed language
    // has a label: that's not a name.
    if (label && label !== facts.qid) facts.label = label;
    const access = first("accessLabel");
    if (access) facts.wheelchairAccessibility = access;
    const wifi = wifiAccess(first("wifi"));
    if (wifi) facts.wifi = wifi;
    const platforms = first("platforms");
    if (platforms !== undefined && Number.isFinite(Number(platforms))) facts.platformCount = Number(platforms);
    const coordWkt = first("coord");
    const candidate: Candidate = { facts, coord: coordWkt ? parsePoint(coordWkt) : undefined };

    for (const r of rows) {
      const plc = r.plc?.value;
      if (plc && !index.byPlc.has(plc)) index.byPlc.set(plc, candidate);
      const eraId = r.eraId?.value;
      if (eraId && !index.byEraId.has(eraId)) index.byEraId.set(eraId, candidate);
    }
    if (uicCountryCode) {
      const uics = new Set(rows.map((r) => r.uic?.value).filter((u): u is string => Boolean(u)));
      for (const uic of uics) {
        const key = uicKey(uic, codePrefix, uicCountryCode);
        if (!key) continue;
        const list = index.byUicKey.get(key) ?? [];
        list.push({ candidate, uic });
        index.byUicKey.set(key, list);
      }
    }
  }
  return index;
}

/** Distance in km, equirectangular: exact enough at a 1 km threshold. */
function distanceKm([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const x = (lon2 - lon1) * 111.32 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  const y = (lat2 - lat1) * 110.574;
  return Math.hypot(x, y);
}

/** The Wikidata station for one RINF primary location, by the strongest
 *  key that matches (see WikidataStationInfo.matchedBy). */
export function matchWikidataStation(
  index: WikidataStationIndex,
  pl: { primaryLocationCode: string; operationalPointUopid: string; point: [number, number] },
): WikidataStationInfo | undefined {
  const byPlc = index.byPlc.get(pl.primaryLocationCode);
  if (byPlc) {
    return { ...byPlc.facts, matchedBy: "primary-location-code", matchedValue: pl.primaryLocationCode };
  }
  const byEraId = index.byEraId.get(pl.operationalPointUopid);
  if (byEraId) {
    return { ...byEraId.facts, matchedBy: "era-id", matchedValue: pl.operationalPointUopid };
  }
  let best: { candidate: Candidate; uic: string; km: number } | undefined;
  for (const { candidate, uic } of index.byUicKey.get(pl.primaryLocationCode) ?? []) {
    if (!candidate.coord) continue;
    const km = distanceKm(candidate.coord, pl.point);
    if (km <= UIC_MATCH_MAX_KM && (!best || km < best.km)) best = { candidate, uic, km };
  }
  return best && { ...best.candidate.facts, matchedBy: "uic-station-code", matchedValue: best.uic };
}
