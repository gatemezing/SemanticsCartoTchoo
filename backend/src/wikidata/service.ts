import { datasetCache } from "../cache/ttlCache.js";
import { WIKIDATA_CACHE_TTL_MS } from "../config.js";
import type { WifiSummary } from "@carto-rinf/shared-types";
import { COUNTRIES, type CountryInfo, uopidPrefixOf } from "../countries.js";
import { runWikidataSparqlSelect, WikidataQueryError } from "./client.js";
import {
  EMPTY_WIKIDATA_INDEX,
  mapWikidataStations,
  type WikidataStationIndex,
} from "./mapping.js";
import { buildStationsQuery, buildStructuresQuery, buildWifiStationsQuery, type StructureKind } from "./queries.js";
import { mapWikidataStructures, type StructureCandidate } from "./structures.js";
import { buildWifiSummary, countStationsByWifi, lookupKeys, partitionWifiStations } from "./wifiSummary.js";
import { runSparqlSelect, type SparqlJsonResults } from "../sparql/client.js";
import { buildPrimaryLocationsByCodeQuery } from "../sparql/queries.js";

/** After a failure, Wikidata isn't asked again for this long: its query
 *  service rate-limits hard, and retrying on every request would make that
 *  worse. Keys come from the fixed registry, so this map stays small. */
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;
const lastFailure = new Map<string, number>();

/** Enrichment is optional: a Wikidata failure must never break a RINF
 *  layer. It degrades to `empty` (no enrichment), and nothing about the
 *  failure is cached beyond the retry window above. Callers enrich their
 *  own cached RINF data with the result on each request (see
 *  enrichOnce), so a short outage can't strip enrichment for the whole
 *  6 h RINF TTL, as it once did for France. */
async function fromWikidata<T>(key: string, label: string, load: () => Promise<T>, empty: T): Promise<T> {
  const failedAt = lastFailure.get(key);
  if (failedAt !== undefined && Date.now() - failedAt < RETRY_AFTER_FAILURE_MS) return empty;
  try {
    const value = await datasetCache.getOrLoad(key, load, WIKIDATA_CACHE_TTL_MS);
    lastFailure.delete(key);
    return value;
  } catch (err) {
    if (err instanceof WikidataQueryError) {
      lastFailure.set(key, Date.now());
      console.error(`Wikidata ${label} unavailable:`, err.message);
      return empty;
    }
    throw err;
  }
}

export function getWikidataStations(country: CountryInfo): Promise<WikidataStationIndex> {
  const codePrefix = uopidPrefixOf(country);
  return fromWikidata(
    `wikidata-stations:${country.code}`,
    `stations for ${country.label}`,
    async () =>
      mapWikidataStations(
        await runWikidataSparqlSelect(buildStationsQuery(country, codePrefix)),
        codePrefix,
        country.uicCountryCode,
      ),
    EMPTY_WIKIDATA_INDEX,
  );
}

const NO_STRUCTURES: StructureCandidate[] = [];

export function getWikidataStructures(kind: StructureKind, country: CountryInfo): Promise<StructureCandidate[]> {
  return fromWikidata(
    `wikidata-${kind}s:${country.code}`,
    `${kind}s for ${country.label}`,
    async () => mapWikidataStructures(await runWikidataSparqlSelect(buildStructuresQuery(kind, country.wikidataQid))),
    NO_STRUCTURES,
  );
}

/** Wikidata couldn't be reached for the Wi-Fi count: a count of zero would
 *  be a wrong answer, so the route says so instead (503). */
export class WikidataUnavailableError extends Error {}

/** How many RINF stations, per country, are matched to a Wikidata item that
 *  records free (or paid, or no) Wi-Fi. One Wikidata query for every
 *  country (its rate limit makes one per country slow), then one small RINF
 *  query per country that has any Wi-Fi item, for just those codes. Cached
 *  with the RINF layers; the Wikidata answer is cached on its own, with the
 *  same retry window after a failure as enrichment. */
export function getWifiSummary(): Promise<WifiSummary> {
  return datasetCache.getOrLoad("wifi-summary", async () => {
    const query = buildWifiStationsQuery(COUNTRIES.map((c) => c.wikidataQid));
    const results = await fromWikidata<SparqlJsonResults | null>(
      "wikidata-wifi-stations",
      "Wi-Fi stations",
      () => runWikidataSparqlSelect(query),
      null,
    );
    if (!results) throw new WikidataUnavailableError("Wikidata's query service didn't answer");
    const partitions = partitionWifiStations(results, COUNTRIES);
    const perCountry = await Promise.all(
      COUNTRIES.map(async (country) => {
        const part = partitions.get(country.code);
        if (!part) return { country, stations: new Map(), wikidata: new Map() };
        const { plCodes, uopids } = lookupKeys(part.index);
        const rinfQuery = buildPrimaryLocationsByCodeQuery(country.code, plCodes, uopids);
        const stations = rinfQuery ? countStationsByWifi(await runSparqlSelect(rinfQuery), part.index) : new Map();
        return { country, stations, wikidata: part.wikidata };
      }),
    );
    return buildWifiSummary(perCountry, query, new Date().toISOString());
  });
}
