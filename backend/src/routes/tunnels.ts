import type { FastifyInstance } from "fastify";
import type { ApiEnvelope, TunnelsCollection } from "@carto-rinf/shared-types";
import { getOrLoad } from "../cache/ttlCache.js";
import { mapTunnels } from "../mapping/tunnels.js";
import { runSparqlSelect, SparqlQueryError } from "../sparql/client.js";
import { buildTunnelsQuery } from "../sparql/queries.js";
import { resolveCountry } from "./resolveCountry.js";

export function registerTunnelsRoute(app: FastifyInstance): void {
  app.get("/api/tunnels", async (request, reply) => {
    const country = resolveCountry(request, reply);
    if (!country) return reply;

    try {
      const data = await getOrLoad<TunnelsCollection>(
        `tunnels:${country.code}`,
        async () =>
          mapTunnels(await runSparqlSelect(buildTunnelsQuery(country.code))),
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
