import type { FastifyInstance } from "fastify";
import type {
  ApiEnvelope,
  OperationalPointDetail,
  OperationalPointsCollection,
} from "@carto-rinf/shared-types";
import { datasetCache, lookupCache } from "../cache/ttlCache.js";
import { LOOKUP_RATE_LIMIT_PER_MINUTE } from "../config.js";
import { replyWithError } from "../errors.js";
import { mapOperationalPointDetail } from "../mapping/operationalPointDetail.js";
import { mapOperationalPoints } from "../mapping/operationalPoints.js";
import { lookupLimiter, runSparqlSelect } from "../sparql/client.js";
import {
  buildOperationalPointDetailQuery,
  buildOperationalPointsQuery,
} from "../sparql/queries.js";
import { resolveCountry } from "./resolveCountry.js";

export function registerOperationalPointsRoute(app: FastifyInstance): void {
  app.get("/api/operational-points", async (request, reply) => {
    const country = resolveCountry(request, reply);
    if (!country) return reply;

    try {
      const data = await datasetCache.getOrLoad<OperationalPointsCollection>(
        `operational-points:${country.code}`,
        async () =>
          mapOperationalPoints(
            await runSparqlSelect(buildOperationalPointsQuery(country.code)),
          ),
      );
      const body: ApiEnvelope<OperationalPointsCollection> = {
        status: "ok",
        data,
      };
      return body;
    } catch (err) {
      return replyWithError(
        request,
        reply,
        err,
        "Unexpected server error while loading operational points",
      );
    }
  });

  app.get(
    "/api/operational-points/:uopid",
    { config: { rateLimit: { max: LOOKUP_RATE_LIMIT_PER_MINUTE } } },
    async (request, reply) => {
      const { uopid } = request.params as { uopid: string };

      try {
        // Built (and so validated) before touching the cache, so a
        // rejected uopid never becomes a cache key.
        const query = buildOperationalPointDetailQuery(uopid);
        const data = await lookupCache.getOrLoad<OperationalPointDetail | null>(
          `operational-point-detail:${uopid}`,
          async () => {
            const results = await lookupLimiter.run(() => runSparqlSelect(query));
            const binding = results.results.bindings[0];
            return binding ? mapOperationalPointDetail(uopid, binding) : null;
          },
        );

        if (!data) {
          reply.code(404);
          const body: ApiEnvelope<never> = {
            status: "error",
            message: `No operational point found in RINF with uopid "${uopid}"`,
          };
          return body;
        }

        const body: ApiEnvelope<OperationalPointDetail> = {
          status: "ok",
          data,
        };
        return body;
      } catch (err) {
        return replyWithError(
          request,
          reply,
          err,
          "Unexpected server error while loading the operational point",
        );
      }
    },
  );
}
