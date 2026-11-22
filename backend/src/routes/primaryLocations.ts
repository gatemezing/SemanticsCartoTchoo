import type { FastifyInstance } from "fastify";
import type {
  ApiEnvelope,
  PrimaryLocationsCollection,
} from "@carto-rinf/shared-types";
import { datasetCache } from "../cache/ttlCache.js";
import type { CountryInfo } from "../countries.js";
import { replyWithError } from "../errors.js";
import { enrichOnce } from "../cache/enrichOnce.js";
import { enrichPrimaryLocations, mapPrimaryLocations } from "../mapping/primaryLocations.js";
import { runSparqlSelect } from "../sparql/client.js";
import { buildPrimaryLocationsQuery } from "../sparql/queries.js";
import { getWikidataStations } from "../wikidata/service.js";
import { resolveCountry } from "./resolveCountry.js";

/** RINF's primary locations for a country, cached; shared with the
 *  operational points' Wikidata join (routes/wikidata.ts). */
export function loadPrimaryLocations(country: CountryInfo): Promise<PrimaryLocationsCollection> {
  return datasetCache.getOrLoad<PrimaryLocationsCollection>(`primary-locations:${country.code}`, async () =>
    mapPrimaryLocations(await runSparqlSelect(buildPrimaryLocationsQuery(country.code))),
  );
}

export function registerPrimaryLocationsRoute(app: FastifyInstance): void {
  app.get("/api/primary-locations", async (request, reply) => {
    const country = resolveCountry(request, reply);
    if (!country) return reply;

    try {
      // RINF and Wikidata are cached separately, and joined per request
      // (once per pair of cache entries): a Wikidata failure then only
      // costs enrichment until it's retried, never for the RINF TTL.
      const [rinf, wikidata] = await Promise.all([loadPrimaryLocations(country), getWikidataStations(country)]);
      const data = enrichOnce(rinf, wikidata, enrichPrimaryLocations);
      const body: ApiEnvelope<PrimaryLocationsCollection> = {
        status: "ok",
        data,
      };
      return body;
    } catch (err) {
      return replyWithError(
        request,
        reply,
        err,
        "Unexpected server error while loading primary locations",
      );
    }
  });
}
