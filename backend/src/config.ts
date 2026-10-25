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

/** ERA's dataset explorer API — the same call the RINF portal's dataset
 *  page makes; lists the latest published dataset per infrastructure
 *  manager (verified live: 58 entries, 2026-10). */
export const RINF_DATASETS_API =
  process.env.RINF_DATASETS_API ??
  "https://rinf.data.era.europa.eu/api/v1/dataset/published?latest=true&groupBy=im";

export const DATASETS_TIMEOUT_MS = 30_000;

/** Short compared to the SPARQL cache: this is a single cheap call, and
 *  "what was published when" is the one thing users open this list to see
 *  freshly. */
export const DATASETS_CACHE_TTL_MS = 60 * 60 * 1000;

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Upstream concurrency for user-keyed lookups (see sparql/client.ts
 *  lookupLimiter). A describe query takes ~0.1-0.3s, so 4 slots serve
 *  well over 10 lookups/s; the queue absorbs bursts, beyond it → 503. */
export const SPARQL_LOOKUP_MAX_CONCURRENT = intFromEnv("SPARQL_LOOKUP_MAX_CONCURRENT", 4);
export const SPARQL_LOOKUP_MAX_QUEUED = intFromEnv("SPARQL_LOOKUP_MAX_QUEUED", 50);

/** Per-client request budget per minute across the API, and a tighter one
 *  for the routes whose cache keys are user-chosen (each miss is a live
 *  upstream query). Generous for a person clicking around a map; a flood
 *  gets 429s. */
export const RATE_LIMIT_PER_MINUTE = intFromEnv("RATE_LIMIT_PER_MINUTE", 300);
export const LOOKUP_RATE_LIMIT_PER_MINUTE = intFromEnv("LOOKUP_RATE_LIMIT_PER_MINUTE", 60);

/** Which origins may call the API cross-origin. Unset (the default) means
 *  no CORS headers at all — same-origin deployments (Docker/nginx, the
 *  Vite dev proxy) don't need them. A static frontend hosted elsewhere
 *  (GitHub Pages) lists its origin here, e.g.
 *  CORS_ORIGINS=https://user.github.io */
export const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

/** Fastify's `trustProxy`: whether to take the client IP from
 *  X-Forwarded-For. Needed behind nginx, or every request looks like it
 *  comes from the proxy (one shared rate-limit bucket, useless logs) —
 *  but only safe when clients can't reach the backend directly, since
 *  the header is otherwise client-controlled. "true", or a
 *  comma-separated list of proxy IPs/CIDRs; unset = don't trust. */
export const TRUST_PROXY: boolean | string[] = (() => {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw || raw === "false") return false;
  if (raw === "true") return true;
  return raw.split(",").map((s) => s.trim());
})();
