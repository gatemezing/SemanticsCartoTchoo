import type { FastifyInstance } from "fastify";
import {
  type ApiEnvelope,
  type InfrastructureCollection,
  type InfrastructureKind,
  INFRASTRUCTURE_KINDS,
} from "@carto-rinf/shared-types";
import { datasetCache } from "../cache/ttlCache.js";
import { BadRequestError, replyWithError } from "../errors.js";
import { mapInfrastructure } from "../mapping/infrastructure.js";
import { runSparqlSelect } from "../sparql/client.js";
import {
  buildInfrastructureQuery,
  buildProviderGraphsQuery,
} from "../sparql/infrastructureQueries.js";
import { resolveCountry } from "./resolveCountry.js";

const EMPTY: InfrastructureCollection = { type: "FeatureCollection", features: [] };

/** IRIs come back from upstream; only well-formed provider-graph IRIs are
 *  used (see buildInfrastructureQuery, which interpolates them). */
function providerGraphsFor(countryCode: string): Promise<string[]> {
  return datasetCache.getOrLoad(`provider-graphs:${countryCode}`, async () =>
    (await runSparqlSelect(buildProviderGraphsQuery(countryCode))).results.bindings
      .map((b) => b.g?.value ?? "")
      .filter((g) => /^http:\/\/data\.europa\.eu\/949\/graph\/[A-Za-z0-9]{2,8}$/.test(g)),
  );
}

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
      const data = await datasetCache.getOrLoad<InfrastructureCollection>(
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
      const body: ApiEnvelope<InfrastructureCollection> = { status: "ok", data };
      return body;
    } catch (err) {
      return replyWithError(request, reply, err, `Unexpected server error while loading ${kind}`);
    }
  });
}
