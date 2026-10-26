import type { FastifyInstance } from "fastify";
import {
  type ApiEnvelope,
  type LineProfile,
  type NationalLine,
  TRACK_PARAMETERS,
} from "@carto-rinf/shared-types";
import { datasetCache, lookupCache } from "../cache/ttlCache.js";
import { LOOKUP_RATE_LIMIT_PER_MINUTE } from "../config.js";
import { BadRequestError, replyWithError } from "../errors.js";
import { buildLineProfile, mapLineSections, mapNationalLines } from "../mapping/lines.js";
import { mapConceptLabels, mapParameterRows } from "../mapping/trackParameters.js";
import { lookupLimiter, runSparqlSelect } from "../sparql/client.js";
import { buildLineSectionsQuery, buildNationalLinesQuery } from "../sparql/lineQueries.js";
import {
  buildConceptLabelsQuery,
  buildSectionParameterRowsQuery,
  valuesClause,
} from "../sparql/trackParameters.js";
import { resolveCountry } from "./resolveCountry.js";

const lookup = (query: string) => lookupLimiter.run(() => runSparqlSelect(query));

export function registerLinesRoutes(app: FastifyInstance): void {
  app.get("/api/lines", async (request, reply) => {
    const country = resolveCountry(request, reply);
    if (!country) return reply;
    try {
      const data = await datasetCache.getOrLoad<NationalLine[]>(
        `national-lines:${country.code}`,
        async () => mapNationalLines(await runSparqlSelect(buildNationalLinesQuery(country.code))),
      );
      const body: ApiEnvelope<NationalLine[]> = { status: "ok", data };
      return body;
    } catch (err) {
      return replyWithError(request, reply, err, "Unexpected server error while loading national lines");
    }
  });

  app.get(
    "/api/line-profile",
    { config: { rateLimit: { max: LOOKUP_RATE_LIMIT_PER_MINUTE } } },
    async (request, reply) => {
      const { line } = request.query as { line?: string };
      const country = resolveCountry(request, reply);
      if (!country) return reply;
      try {
        if (!line) throw new BadRequestError("Missing ?line= parameter");
        const sectionsQuery = buildLineSectionsQuery(line, country.code); // validates
        const data = await lookupCache.getOrLoad<LineProfile | null>(
          `line-profile:${country.code}:${line}`,
          async () => {
            const { sections, lineLabel } = mapLineSections(await lookup(sectionsQuery));
            if (sections.length === 0) return null;
            const { bySection, conceptIris } = mapParameterRows(
              await lookup(
                buildSectionParameterRowsQuery(
                  valuesClause("?sol", sections.map((s) => s.rinfUri)),
                  [...TRACK_PARAMETERS],
                ),
              ),
            );
            const labels = mapConceptLabels(
              conceptIris.size > 0 ? await lookup(buildConceptLabelsQuery([...conceptIris])) : null,
            );
            return buildLineProfile(
              { iri: line, label: lineLabel ?? line.split("/").pop() ?? line },
              sections,
              bySection,
              labels,
            );
          },
        );
        if (!data) {
          reply.code(404);
          const body: ApiEnvelope<never> = {
            status: "error",
            message: `No current sections found in RINF for line "${line}"`,
          };
          return body;
        }
        const body: ApiEnvelope<LineProfile> = { status: "ok", data };
        return body;
      } catch (err) {
        return replyWithError(request, reply, err, "Unexpected server error while building the line profile");
      }
    },
  );
}
