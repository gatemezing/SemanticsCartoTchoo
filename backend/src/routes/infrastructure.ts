import type { FastifyInstance } from "fastify";
import {
  type ApiEnvelope,
  type InfrastructureCollection,
  type InfrastructureKind,
  INFRASTRUCTURE_KINDS,
} from "@carto-rinf/shared-types";
import { datasetCache } from "../cache/ttlCache.js";
import { BadRequestError, replyWithError } from "../errors.js";
import { enrichOnce } from "../cache/enrichOnce.js";
import { enrichBridges, mapInfrastructure } from "../mapping/infrastructure.js";
import { getWikidataStructures } from "../wikidata/service.js";
import { runSparqlSelect } from "../sparql/client.js";
import { buildInfrastructureQuery } from "../sparql/infrastructureQueries.js";
import { providerGraphsFor } from "./providerGraphs.js";
import { resolveCountry } from "./resolveCountry.js";

const EMPTY: InfrastructureCollection = { type: "FeatureCollection", features: [] };

export function registerInfrastructureRoute(app: FastifyInstance): void {
  app.get("/api/infrastructure/:kind", async (request, reply) => {
    const { kind } = request.params as { kind: string };
    if (!(INFRASTRUCTURE_KINDS as readonly string[]).includes(kind)) {
      return replyWithError(
        request,
        reply,
        new BadRequestError(`Unknown infrastructure kind "${kind}" — one of ${INFRASTRUCTURE_KINDS.join(", ")}`),
        "",
      );
    }
    const country = resolveCountry(request, reply);
    if (!country) return reply;

    try {
      const rinf = await datasetCache.getOrLoad<InfrastructureCollection>(
        `infrastructure:${kind}:${country.code}`,
        async () => {
          const graphs = await providerGraphsFor(country.code);
          if (graphs.length === 0) return EMPTY;
          const { collection, skipped } = mapInfrastructure(
            kind as InfrastructureKind,
            await runSparqlSelect(buildInfrastructureQuery(kind as InfrastructureKind, graphs)),
          );
          if (skipped > 0) {
            request.log.warn({ kind, country: country.code, skipped }, "infrastructure features without usable geometry");
          }
          return collection;
        },
      );
      // Only bridges have a Wikidata counterpart worth matching, and only
      // when RINF has any (Wikidata isn't asked for an empty layer).
      const data =
        kind === "bridges" && rinf.features.length > 0
          ? enrichOnce(rinf, await getWikidataStructures("bridge", country), enrichBridges)
          : rinf;
      const body: ApiEnvelope<InfrastructureCollection> = { status: "ok", data };
      return body;
    } catch (err) {
      return replyWithError(request, reply, err, `Unexpected server error while loading ${kind}`);
    }
  });
}
