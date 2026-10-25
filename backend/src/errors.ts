import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiEnvelope } from "@carto-rinf/shared-types";
import { DatasetsApiError } from "./datasets/client.js";
import { SparqlQueryError, UpstreamBusyError } from "./sparql/client.js";

/** Input that fails validation (an IRI or uopid that isn't safe to put in a
 *  query). Thrown by the query builders so validation lives next to the
 *  interpolation it protects; surfaced as 400, never as a 500. */
export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

/** The one place a thrown error becomes an HTTP status + ApiEnvelope, so
 *  every route maps the same error to the same status. Only messages we
 *  wrote ourselves are echoed to the client; anything unexpected gets the
 *  route's generic `fallback` text (the details go to the log). */
export function replyWithError(
  request: FastifyRequest,
  reply: FastifyReply,
  err: unknown,
  fallback: string,
): ApiEnvelope<never> {
  let status = 500;
  let message = fallback;
  if (err instanceof BadRequestError) {
    status = 400;
    message = err.message;
  } else if (err instanceof UpstreamBusyError) {
    status = 503;
    message = err.message;
  } else if (err instanceof SparqlQueryError || err instanceof DatasetsApiError) {
    status = 502;
    message = err.message;
  }
  if (status >= 500) request.log.error(err);
  reply.code(status);
  return { status: "error", message };
}
