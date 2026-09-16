import { SPARQL_ENDPOINT, SPARQL_TIMEOUT_MS } from "../config.js";

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

/** Runs a SPARQL SELECT against the live RINF/ERA GraphDB endpoint. Callers
 *  should always go through the cache layer (see ../cache) rather than
 *  calling this directly from a route handler. */
export async function runSparqlSelect(
  query: string,
): Promise<SparqlJsonResults> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SPARQL_TIMEOUT_MS);

  try {
    const response = await fetch(SPARQL_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
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

    return (await response.json()) as SparqlJsonResults;
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
