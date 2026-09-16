import type { FastifyInstance } from "fastify";
import type { ApiEnvelope, TunnelsCollection } from "@carto-rinf/shared-types";
import { getOrLoad } from "../cache/ttlCache.js";
import { countryAuthorityUri, DEFAULT_COUNTRY_UOPID_PREFIX } from "../config.js";
import { mapTunnels } from "../mapping/tunnels.js";
import { runSparqlSelect, SparqlQueryError } from "../sparql/client.js";
import { buildTunnelsQuery } from "../sparql/queries.js";

export function registerTunnelsRoute(app: FastifyInstance): void {
  app.get("/api/tunnels", async (request, reply) => {
    const country =
      (request.query as { country?: string }).country?.toUpperCase() ??
      DEFAULT_COUNTRY_UOPID_PREFIX;

    try {
      const data = await getOrLoad<TunnelsCollection>(
        `tunnels:${country}`,
        async () =>
          mapTunnels(
            await runSparqlSelect(buildTunnelsQuery(countryAuthorityUri(country))),
          ),
      );
      const body: ApiEnvelope<TunnelsCollection> = { status: "ok", data };
      return body;
    } catch (err) {
      request.log.error(err);
      reply.code(err instanceof SparqlQueryError ? 502 : 500);
      const body: ApiEnvelope<never> = {
        status: "error",
        message:
          err instanceof SparqlQueryError
            ? err.message
            : "Unexpected server error while loading tunnels",
      };
      return body;
    }
  });
}
