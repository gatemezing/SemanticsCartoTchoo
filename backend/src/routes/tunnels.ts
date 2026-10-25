import type { FastifyInstance } from "fastify";
import type { ApiEnvelope, TunnelsCollection } from "@carto-rinf/shared-types";
import { datasetCache } from "../cache/ttlCache.js";
import { replyWithError } from "../errors.js";
import { mapTunnels } from "../mapping/tunnels.js";
import { runSparqlSelect } from "../sparql/client.js";
import { buildTunnelsQuery } from "../sparql/queries.js";
import { resolveCountry } from "./resolveCountry.js";

export function registerTunnelsRoute(app: FastifyInstance): void {
  app.get("/api/tunnels", async (request, reply) => {
    const country = resolveCountry(request, reply);
    if (!country) return reply;

    try {
      const data = await datasetCache.getOrLoad<TunnelsCollection>(
        `tunnels:${country.code}`,
        async () =>
          mapTunnels(await runSparqlSelect(buildTunnelsQuery(country.code))),
      );
      const body: ApiEnvelope<TunnelsCollection> = { status: "ok", data };
      return body;
    } catch (err) {
      return replyWithError(
        request,
        reply,
        err,
        "Unexpected server error while loading tunnels",
      );
    }
  });
}
