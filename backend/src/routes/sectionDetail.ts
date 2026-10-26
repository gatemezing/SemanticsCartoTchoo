import type { FastifyInstance } from "fastify";
import {
  type ApiEnvelope,
  type SectionOfLineDetail,
  TRACK_PARAMETERS,
} from "@carto-rinf/shared-types";
import { lookupCache } from "../cache/ttlCache.js";
import { LOOKUP_RATE_LIMIT_PER_MINUTE } from "../config.js";
import { BadRequestError, replyWithError } from "../errors.js";
import { mapSectionDetail } from "../mapping/sectionDetail.js";
import { mapConceptLabels, mapParameterRows } from "../mapping/trackParameters.js";
import { lookupLimiter, runSparqlSelect } from "../sparql/client.js";
import { buildSectionDetailQuery } from "../sparql/lineQueries.js";
import {
  buildConceptLabelsQuery,
  buildSectionParameterRowsQuery,
  valuesClause,
} from "../sparql/trackParameters.js";

const lookup = (query: string) => lookupLimiter.run(() => runSparqlSelect(query));

export function registerSectionDetailRoute(app: FastifyInstance): void {
  app.get(
    "/api/sections-of-line/detail",
    { config: { rateLimit: { max: LOOKUP_RATE_LIMIT_PER_MINUTE } } },
    async (request, reply) => {
      const { iri } = request.query as { iri?: string };
      try {
        if (!iri) throw new BadRequestError("Missing ?iri= parameter");
        const detailQuery = buildSectionDetailQuery(iri); // validates the IRI
        const data = await lookupCache.getOrLoad<SectionOfLineDetail | null>(
          `section-detail:${iri}`,
          async () => {
            const [detail, paramRows] = await Promise.all([
              lookup(detailQuery),
              lookup(buildSectionParameterRowsQuery(valuesClause("?sol", [iri]), [...TRACK_PARAMETERS])),
            ]);
            const binding = detail.results.bindings[0];
            // An aggregate query always returns one row; an unknown IRI
            // shows up as that row with nothing bound.
            if (!binding?.startUopid) return null;
            const { bySection, conceptIris } = mapParameterRows(paramRows);
            const labels = mapConceptLabels(
              conceptIris.size > 0 ? await lookup(buildConceptLabelsQuery([...conceptIris])) : null,
            );
            return mapSectionDetail(iri, binding, bySection.get(iri) ?? {}, labels);
          },
        );
        if (!data) {
          reply.code(404);
          const body: ApiEnvelope<never> = {
            status: "error",
            message: `No section of line found in RINF with IRI "${iri}"`,
          };
          return body;
        }
        const body: ApiEnvelope<SectionOfLineDetail> = { status: "ok", data };
        return body;
      } catch (err) {
        return replyWithError(request, reply, err, "Unexpected server error while loading the section of line");
      }
    },
  );
}
