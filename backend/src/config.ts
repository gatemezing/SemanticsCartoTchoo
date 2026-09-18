export const SPARQL_ENDPOINT =
  process.env.RINF_SPARQL_ENDPOINT ??
  "https://graph.data.era.europa.eu/repositories/rinf-plus";

/** SPARQL requests against a full country take ~10-40s cold for most of the
 *  register, but the largest (Germany, ~28k raw operational-point rows
 *  before the current-validity filter narrows them down) pushed past both
 *  60s and 120s once that filter's extra joins were added — confirmed by
 *  live 502s during development, worst observed being the primary-locations
 *  query (joins operational points + primary locations + validity).
 *  Generous headroom here only costs anything on a cold cache miss (6h
 *  TTL), never on a cache hit. */
export const SPARQL_TIMEOUT_MS = 180_000;

/** RINF infrastructure data changes on a weeks/months cadence, not
 *  per-request, so a long TTL is safe and keeps the public endpoint from
 *  being hammered on every map load. */
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Default when a request doesn't specify ?country= — kept for backward
 *  compatibility with links from before multi-country support. The full
 *  registry (all countries actually present in the register) lives in
 *  ./countries.ts. */
export const DEFAULT_COUNTRY_UOPID_PREFIX = "FR";

/** era:inCountry uses the EU Publications Office authority table, keyed by
 *  ISO 3166-1 alpha-3 — used for entities (e.g. tunnels) that don't carry a
 *  uopid to filter by directly. */
export function countryAuthorityUri(iso3: string): string {
  return `http://publications.europa.eu/resource/authority/country/${iso3}`;
}

export const PORT = Number(process.env.PORT ?? 3001);

export const WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

/** Wikidata's query service etiquette expects a descriptive User-Agent
 *  identifying the project and a contact URL, and will otherwise rate-limit
 *  more aggressively (confirmed live: hit a 429 during development without
 *  one — well-formed UA plus a few seconds' backoff cleared it). */
export const WIKIDATA_USER_AGENT =
  "CartoRinf/0.1 (https://github.com/gatemezing/SemanticsCartoTchoo)";

export const WIKIDATA_TIMEOUT_MS = 60_000;

/** Wikidata edits are infrequent relative to a browsing session and its
 *  query service rate-limits hard, so this is cached longer than RINF's
 *  own 6h default. */
export const WIKIDATA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
