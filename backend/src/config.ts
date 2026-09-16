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
