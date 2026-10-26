import {
  SPARQL_ENDPOINT,
  SPARQL_LOOKUP_MAX_CONCURRENT,
  SPARQL_LOOKUP_MAX_QUEUED,
  SPARQL_TIMEOUT_MS,
} from "../config.js";
import { ConcurrencyLimiter } from "./limiter.js";

export interface SparqlTerm {
  type: "uri" | "literal" | "bnode";
  value: string;
  "xml:lang"?: string;
  datatype?: string;
}

export type SparqlBinding = Record<string, SparqlTerm>;

export interface SparqlJsonResults {
  head: { vars: string[] };
  results: { bindings: SparqlBinding[] };
}

export class SparqlQueryError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SparqlQueryError";
  }
}

/** Upstream is saturated and the wait queue is full — a 503, not a 502:
 *  the endpoint isn't failing, this server is shedding load. */
export class UpstreamBusyError extends SparqlQueryError {
  constructor() {
    super("Too many RINF queries in progress — please retry in a moment");
    this.name = "UpstreamBusyError";
  }
}

/** For queries keyed by user input (entity detail, describe). Country
 *  layers don't go through it: their keys come from the fixed registry
 *  and in-flight deduplication already bounds them to one upstream query
 *  per layer and country, whereas lookups are unbounded without this. */
export const lookupLimiter = new ConcurrencyLimiter(
  SPARQL_LOOKUP_MAX_CONCURRENT,
  SPARQL_LOOKUP_MAX_QUEUED,
  () => new UpstreamBusyError(),
);

/** POSTs a query to the RINF endpoint with the given Accept type, mapping
 *  transport failures, HTTP errors and the timeout to SparqlQueryError. */
async function postQuery<T>(
  query: string,
  accept: string,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SPARQL_TIMEOUT_MS);

  try {
    const response = await fetch(SPARQL_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: accept,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ query }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new SparqlQueryError(
        `RINF SPARQL endpoint returned HTTP ${response.status}`,
      );
    }

    return await read(response);
  } catch (err) {
    if (err instanceof SparqlQueryError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new SparqlQueryError(
        `RINF SPARQL endpoint timed out after ${SPARQL_TIMEOUT_MS}ms`,
        err,
      );
    }
    throw new SparqlQueryError(
      "Failed to reach the RINF SPARQL endpoint",
      err,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** Runs a SPARQL SELECT against the live RINF/ERA GraphDB endpoint. Callers
 *  should always go through the cache layer (see ../cache) rather than
 *  calling this directly from a route handler. */
export function runSparqlSelect(query: string): Promise<SparqlJsonResults> {
  return postQuery(
    query,
    "application/sparql-results+json",
    async (response) => (await response.json()) as SparqlJsonResults,
  );
}

/** Runs a SPARQL CONSTRUCT and returns the graph as Turtle text. */
export function runSparqlConstructTurtle(query: string): Promise<string> {
  return postQuery(query, "text/turtle", (response) => response.text());
}
