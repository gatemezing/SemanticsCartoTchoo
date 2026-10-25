import type { FastifyInstance } from "fastify";
import type { ApiEnvelope, SectionOfLineCollection } from "@carto-rinf/shared-types";
import { datasetCache } from "../cache/ttlCache.js";
import { replyWithError } from "../errors.js";
import { mapSectionsOfLine } from "../mapping/sectionsOfLine.js";
import { runSparqlSelect } from "../sparql/client.js";
import { buildSectionsOfLineQuery } from "../sparql/queries.js";
import { resolveCountry } from "./resolveCountry.js";

export function registerSectionsOfLineRoute(app: FastifyInstance): void {
  app.get("/api/sections-of-line", async (request, reply) => {
    const country = resolveCountry(request, reply);
    if (!country) return reply;

    try {
      const data = await datasetCache.getOrLoad<SectionOfLineCollection>(
        `sections-of-line:${country.code}`,
        async () =>
          mapSectionsOfLine(
            await runSparqlSelect(buildSectionsOfLineQuery(country.code)),
          ),
      );
      const body: ApiEnvelope<SectionOfLineCollection> = {
        status: "ok",
        data,
      };
      return body;
    } catch (err) {
      return replyWithError(
        request,
        reply,
        err,
        "Unexpected server error while loading sections of line",
      );
    }
  });
}
