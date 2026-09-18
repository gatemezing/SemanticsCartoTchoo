import type { FastifyInstance } from "fastify";
import type {
  ApiEnvelope,
  OperationalPointDetail,
  OperationalPointsCollection,
} from "@carto-rinf/shared-types";
import { getOrLoad } from "../cache/ttlCache.js";
import { mapOperationalPointDetail } from "../mapping/operationalPointDetail.js";
import { mapOperationalPoints } from "../mapping/operationalPoints.js";
import { runSparqlSelect, SparqlQueryError } from "../sparql/client.js";
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
      const data = await getOrLoad<OperationalPointsCollection>(
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
      request.log.error(err);
      reply.code(err instanceof SparqlQueryError ? 502 : 500);
      const body: ApiEnvelope<never> = {
        status: "error",
        message:
          err instanceof SparqlQueryError
            ? err.message
            : "Unexpected server error while loading operational points",
      };
      return body;
    }
  });

  app.get("/api/operational-points/:uopid", async (request, reply) => {
    const { uopid } = request.params as { uopid: string };

    try {
      const data = await getOrLoad<OperationalPointDetail | null>(
        `operational-point-detail:${uopid}`,
        async () => {
          const results = await runSparqlSelect(
            buildOperationalPointDetailQuery(uopid),
          );
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
      request.log.error(err);
      reply.code(err instanceof SparqlQueryError ? 502 : 500);
      const body: ApiEnvelope<never> = {
        status: "error",
        message:
          err instanceof SparqlQueryError
            ? err.message
            : "Unexpected server error while loading the operational point",
      };
      return body;
    }
  });
}
