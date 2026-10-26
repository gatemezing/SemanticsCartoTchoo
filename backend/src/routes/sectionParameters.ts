import type { FastifyInstance } from "fastify";
import {
  type ApiEnvelope,
  type SectionParameters,
  type TrackParameterId,
  TRACK_PARAMETERS,
} from "@carto-rinf/shared-types";
import { datasetCache } from "../cache/ttlCache.js";
import { BadRequestError, replyWithError } from "../errors.js";
import {
  buildSectionParameters,
  mapConceptLabels,
  mapParameterRows,
} from "../mapping/trackParameters.js";
import { runSparqlSelect } from "../sparql/client.js";
import { countrySectionsPattern, TIME_PREFIX } from "../sparql/queries.js";
import {
  buildConceptLabelsQuery,
  buildSectionParameterRowsQuery,
} from "../sparql/trackParameters.js";
import { resolveCountry } from "./resolveCountry.js";

export function registerSectionParametersRoute(app: FastifyInstance): void {
  app.get("/api/section-parameters", async (request, reply) => {
    const { param } = request.query as { param?: string };
    if (!param || !(TRACK_PARAMETERS as readonly string[]).includes(param)) {
      return replyWithError(
        request,
        reply,
        new BadRequestError(`?param= must be one of ${TRACK_PARAMETERS.join(", ")}`),
        "",
      );
    }
    const country = resolveCountry(request, reply);
    if (!country) return reply;

    try {
      // One parameter per request: rolling all four up at once took 77s
      // for France, one takes 8-17s (measured 2026-10), cached 6h.
      const data = await datasetCache.getOrLoad<SectionParameters>(
        `section-parameters:${param}:${country.code}`,
        async () => {
          const { bySection, conceptIris } = mapParameterRows(
            await runSparqlSelect(
              buildSectionParameterRowsQuery(
                countrySectionsPattern(country.code),
                [param as TrackParameterId],
                TIME_PREFIX,
              ),
            ),
          );
          const labels = mapConceptLabels(
            conceptIris.size > 0
              ? await runSparqlSelect(buildConceptLabelsQuery([...conceptIris]))
              : null,
          );
          return buildSectionParameters(param as TrackParameterId, bySection, labels);
        },
      );
      const body: ApiEnvelope<SectionParameters> = { status: "ok", data };
      return body;
    } catch (err) {
      return replyWithError(request, reply, err, "Unexpected server error while loading track parameters");
    }
  });
}
