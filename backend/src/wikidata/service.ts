import type { WikidataStationInfo } from "@carto-rinf/shared-types";
import { getOrLoad } from "../cache/ttlCache.js";
import { WIKIDATA_CACHE_TTL_MS } from "../config.js";
import type { CountryInfo } from "../countries.js";
import { runWikidataSparqlSelect, WikidataQueryError } from "./client.js";
import { mapWikidataStationsByPlc } from "./mapping.js";
import { buildStationsQuery } from "./queries.js";

/** Enrichment is optional: a Wikidata failure must never break
 *  /api/primary-locations, so callers get an empty map (no enrichment)
 *  rather than a thrown error on failure. */
export async function getWikidataStationsByPlc(
  country: CountryInfo,
): Promise<Map<string, WikidataStationInfo>> {
  try {
    return await getOrLoad(
      `wikidata-stations-by-plc:${country.code}`,
      async () =>
        mapWikidataStationsByPlc(
          await runWikidataSparqlSelect(buildStationsQuery(country.wikidataQid)),
        ),
      WIKIDATA_CACHE_TTL_MS,
    );
  } catch (err) {
    if (err instanceof WikidataQueryError) {
      console.error(
        `Wikidata enrichment unavailable for ${country.label}:`,
        err.message,
      );
      return new Map();
    }
    throw err;
  }
}
