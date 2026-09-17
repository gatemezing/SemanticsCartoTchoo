import {
  WIKIDATA_SPARQL_ENDPOINT,
  WIKIDATA_TIMEOUT_MS,
  WIKIDATA_USER_AGENT,
} from "../config.js";
import type { SparqlJsonResults } from "../sparql/client.js";

export class WikidataQueryError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "WikidataQueryError";
  }
}

/** Separate from the RINF SPARQL client (../sparql/client.ts): different
 *  endpoint, and Wikidata's query service expects a descriptive
 *  User-Agent and rate-limits without one. Enrichment is optional — a
 *  failure here should never take down the primary-locations response. */
export async function runWikidataSparqlSelect(
  query: string,
): Promise<SparqlJsonResults> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WIKIDATA_TIMEOUT_MS);

  try {
    const url = new URL(WIKIDATA_SPARQL_ENDPOINT);
    url.searchParams.set("query", query);
    url.searchParams.set("format", "json");

    const response = await fetch(url, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": WIKIDATA_USER_AGENT,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new WikidataQueryError(
        `Wikidata query service returned HTTP ${response.status}`,
      );
    }

    return (await response.json()) as SparqlJsonResults;
  } catch (err) {
    if (err instanceof WikidataQueryError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new WikidataQueryError(
        `Wikidata query service timed out after ${WIKIDATA_TIMEOUT_MS}ms`,
        err,
      );
    }
    throw new WikidataQueryError(
      "Failed to reach the Wikidata query service",
      err,
    );
  } finally {
    clearTimeout(timeout);
  }
}
