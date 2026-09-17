import type { WikidataStationInfo } from "@carto-rinf/shared-types";
import { getOrLoad } from "../cache/ttlCache.js";
import { WIKIDATA_CACHE_TTL_MS } from "../config.js";
import { runWikidataSparqlSelect, WikidataQueryError } from "./client.js";
import { mapWikidataStationsByPlc } from "./mapping.js";
import { buildFrenchStationsQuery } from "./queries.js";

/** Enrichment is optional: a Wikidata failure must never break
 *  /api/primary-locations, so callers get an empty map (no enrichment)
 *  rather than a thrown error on failure. */
export async function getWikidataStationsByPlc(): Promise<
  Map<string, WikidataStationInfo>
> {
  try {
    return await getOrLoad(
      "wikidata-stations-by-plc:FR",
      async () =>
        mapWikidataStationsByPlc(
          await runWikidataSparqlSelect(buildFrenchStationsQuery()),
        ),
      WIKIDATA_CACHE_TTL_MS,
    );
  } catch (err) {
    if (err instanceof WikidataQueryError) {
      console.error("Wikidata enrichment unavailable:", err.message);
      return new Map();
    }
    throw err;
  }
}
