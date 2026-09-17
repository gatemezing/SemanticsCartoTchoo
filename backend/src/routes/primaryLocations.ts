import type { FastifyInstance } from "fastify";
import type {
  ApiEnvelope,
  PrimaryLocationsCollection,
} from "@carto-rinf/shared-types";
import { getOrLoad } from "../cache/ttlCache.js";
import { DEFAULT_COUNTRY_UOPID_PREFIX } from "../config.js";
import { mapPrimaryLocations } from "../mapping/primaryLocations.js";
import { runSparqlSelect, SparqlQueryError } from "../sparql/client.js";
import { buildPrimaryLocationsQuery } from "../sparql/queries.js";
import { getWikidataStationsByPlc } from "../wikidata/service.js";

export function registerPrimaryLocationsRoute(app: FastifyInstance): void {
  app.get("/api/primary-locations", async (request, reply) => {
    const country =
      (request.query as { country?: string }).country?.toUpperCase() ??
      DEFAULT_COUNTRY_UOPID_PREFIX;

    try {
      const data = await getOrLoad<PrimaryLocationsCollection>(
        `primary-locations:${country}`,
        async () => {
          // Wikidata enrichment has its own, longer-lived cache (see
          // getWikidataStationsByPlc) and never fails this request — it
          // degrades to "no enrichment" instead.
          const [rinfResults, wikidataByPlc] = await Promise.all([
            runSparqlSelect(buildPrimaryLocationsQuery(country)),
            getWikidataStationsByPlc(),
          ]);
          return mapPrimaryLocations(rinfResults, wikidataByPlc);
        },
      );
      const body: ApiEnvelope<PrimaryLocationsCollection> = {
        status: "ok",
        data,
      };
      return body;
    } catch (err) {
      request.log.error(err);
      reply.code(err instanceof SparqlQueryError ? 502 : 500);
      const body: ApiEnvelope<never> = {
        status: "error",
        message:
          err instanceof SparqlQueryError
            ? err.message
            : "Unexpected server error while loading primary locations",
      };
      return body;
    }
  });
}
