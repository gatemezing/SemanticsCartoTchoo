import type { FastifyInstance } from "fastify";
import type { ApiEnvelope, SectionOfLineCollection } from "@carto-rinf/shared-types";
import { getOrLoad } from "../cache/ttlCache.js";
import { DEFAULT_COUNTRY_UOPID_PREFIX } from "../config.js";
import { mapSectionsOfLine } from "../mapping/sectionsOfLine.js";
import { runSparqlSelect, SparqlQueryError } from "../sparql/client.js";
import { buildSectionsOfLineQuery } from "../sparql/queries.js";

export function registerSectionsOfLineRoute(app: FastifyInstance): void {
  app.get("/api/sections-of-line", async (request, reply) => {
    const country =
      (request.query as { country?: string }).country?.toUpperCase() ??
      DEFAULT_COUNTRY_UOPID_PREFIX;

    try {
      const data = await getOrLoad<SectionOfLineCollection>(
        `sections-of-line:${country}`,
        async () =>
          mapSectionsOfLine(
            await runSparqlSelect(buildSectionsOfLineQuery(country)),
          ),
      );
      const body: ApiEnvelope<SectionOfLineCollection> = {
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
            : "Unexpected server error while loading sections of line",
      };
      return body;
    }
  });
}
