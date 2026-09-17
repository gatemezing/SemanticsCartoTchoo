export const SPARQL_ENDPOINT =
  process.env.RINF_SPARQL_ENDPOINT ??
  "https://graph.data.era.europa.eu/repositories/rinf-plus";

/** SPARQL requests against the full France dataset take ~30-40s cold. */
export const SPARQL_TIMEOUT_MS = 60_000;

/** RINF infrastructure data changes on a weeks/months cadence, not
 *  per-request, so a long TTL is safe and keeps the public endpoint from
 *  being hammered on every map load. */
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** v1 ships France only; the query layer takes this as a parameter so more
 *  countries can be added later without redesigning the queries. */
export const DEFAULT_COUNTRY_UOPID_PREFIX = "FR";

/** era:inCountry uses the EU Publications Office authority table, keyed by
 *  ISO 3166-1 alpha-3 — used for entities (e.g. tunnels) that don't carry a
 *  uopid to filter by directly. */
export const COUNTRY_ISO3_BY_UOPID_PREFIX: Record<string, string> = {
  FR: "FRA",
};

export function countryAuthorityUri(uopidPrefix: string): string {
  const iso3 = COUNTRY_ISO3_BY_UOPID_PREFIX[uopidPrefix];
  if (!iso3) {
    throw new Error(`No ISO3 country mapping for uopid prefix "${uopidPrefix}"`);
  }
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

export const WIKIDATA_TIMEOUT_MS = 30_000;

/** Wikidata edits are infrequent relative to a browsing session and its
 *  query service rate-limits hard, so this is cached longer than RINF's
 *  own 6h default. */
export const WIKIDATA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
