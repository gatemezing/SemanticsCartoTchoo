import { datasetCache } from "../cache/ttlCache.js";
import { WIKIDATA_CACHE_TTL_MS } from "../config.js";
import { type CountryInfo, uopidPrefixOf } from "../countries.js";
import { runWikidataSparqlSelect, WikidataQueryError } from "./client.js";
import {
  EMPTY_WIKIDATA_INDEX,
  mapWikidataStations,
  type WikidataStationIndex,
} from "./mapping.js";
import { buildStationsQuery, buildStructuresQuery, type StructureKind } from "./queries.js";
import { mapWikidataStructures, type StructureCandidate } from "./structures.js";

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
