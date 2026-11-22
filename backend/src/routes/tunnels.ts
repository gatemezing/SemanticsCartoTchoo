import type { FastifyInstance } from "fastify";
import type { ApiEnvelope, TunnelsCollection } from "@carto-rinf/shared-types";
import { datasetCache } from "../cache/ttlCache.js";
import { replyWithError } from "../errors.js";
import { enrichOnce } from "../cache/enrichOnce.js";
import { enrichTunnels, mapTunnels } from "../mapping/tunnels.js";
import { getWikidataStructures } from "../wikidata/service.js";
import { runSparqlSelect } from "../sparql/client.js";
import { buildTunnelsQuery } from "../sparql/queries.js";
import { providerGraphsFor } from "./providerGraphs.js";
import { resolveCountry } from "./resolveCountry.js";

const EMPTY: TunnelsCollection = { type: "FeatureCollection", features: [] };

export function registerTunnelsRoute(app: FastifyInstance): void {
  app.get("/api/tunnels", async (request, reply) => {
    const country = resolveCountry(request, reply);
    if (!country) return reply;

    try {
      const [rinf, wikidata] = await Promise.all([
        datasetCache.getOrLoad<TunnelsCollection>(`tunnels:${country.code}`, async () => {
          const graphs = await providerGraphsFor(country.code);
          if (graphs.length === 0) return EMPTY;
          return mapTunnels(await runSparqlSelect(buildTunnelsQuery(country.code, graphs)));
        }),
        getWikidataStructures("tunnel", country),
      ]);
      const data = enrichOnce(rinf, wikidata, enrichTunnels);
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
