import type { FastifyInstance } from "fastify";
import type { ApiEnvelope, DescribeResult } from "@carto-rinf/shared-types";
import { lookupCache } from "../cache/ttlCache.js";
import { LOOKUP_RATE_LIMIT_PER_MINUTE } from "../config.js";
import { BadRequestError, replyWithError } from "../errors.js";
import { mapDescribe } from "../mapping/describe.js";
import {
  lookupLimiter,
  runSparqlConstructTurtle,
  runSparqlSelect,
} from "../sparql/client.js";
import {
  buildDescribeConstructQuery,
  buildDescribeQuery,
  DESCRIBE_LIMIT,
} from "../sparql/queries.js";

/** A download name from the IRI's last segment, reduced to characters
 *  that are safe inside a quoted Content-Disposition filename. */
export function turtleFileName(iri: string): string {
  const last = iri.replace(/[/#]+$/, "").split(/[/#]/).pop() ?? "";
  const safe = last.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
  return `${safe || "resource"}.ttl`;
}

export function registerDescribeRoute(app: FastifyInstance): void {
  app.get(
    "/api/describe",
    { config: { rateLimit: { max: LOOKUP_RATE_LIMIT_PER_MINUTE } } },
    async (request, reply) => {
      const { iri, direction: rawDirection } = request.query as {
        iri?: string;
        direction?: string;
      };
      const direction = rawDirection === "in" ? "in" : "out";

      try {
        if (!iri) throw new BadRequestError("Missing ?iri= parameter");
        // Validates the IRI before it becomes a cache key.
        const query = buildDescribeQuery(iri, direction);
        const data = await lookupCache.getOrLoad<DescribeResult>(
          `describe:${direction}:${iri}`,
          async () =>
            mapDescribe(
              iri,
              direction,
              await lookupLimiter.run(() => runSparqlSelect(query)),
              DESCRIBE_LIMIT,
            ),
        );
        const body: ApiEnvelope<DescribeResult> = { status: "ok", data };
        return body;
      } catch (err) {
        return replyWithError(
          request,
          reply,
          err,
          "Unexpected server error while describing the resource",
        );
      }
    },
  );

  app.get(
    "/api/describe.ttl",
    { config: { rateLimit: { max: LOOKUP_RATE_LIMIT_PER_MINUTE } } },
    async (request, reply) => {
      const { iri } = request.query as { iri?: string };
      try {
        if (!iri) throw new BadRequestError("Missing ?iri= parameter");
        const query = buildDescribeConstructQuery(iri); // validates the IRI
        const turtle = await lookupCache.getOrLoad<string>(
          `describe-ttl:${iri}`,
          () => lookupLimiter.run(() => runSparqlConstructTurtle(query)),
        );
        reply
          .type("text/turtle; charset=utf-8")
          .header("content-disposition", `attachment; filename="${turtleFileName(iri)}"`);
        return turtle;
      } catch (err) {
        return replyWithError(
          request,
          reply,
          err,
          "Unexpected server error while exporting the resource as Turtle",
        );
      }
    },
  );
}
