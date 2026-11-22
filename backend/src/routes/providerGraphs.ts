import { datasetCache } from "../cache/ttlCache.js";
import { runSparqlSelect } from "../sparql/client.js";
import { buildProviderGraphsQuery } from "../sparql/infrastructureQueries.js";

/** A country's infrastructure managers' named graphs — how every class
 *  other than operational points and sections is scoped to a country,
 *  since era:inCountry is missing on many of them (all Austrian level
 *  crossings; 5,700+ tunnels, see buildTunnelsQuery). IRIs come back from
 *  upstream, so only well-formed provider-graph IRIs are kept: the query
 *  builders interpolate them. */
export function providerGraphsFor(countryCode: string): Promise<string[]> {
  return datasetCache.getOrLoad(`provider-graphs:${countryCode}`, async () =>
    (await runSparqlSelect(buildProviderGraphsQuery(countryCode))).results.bindings
      .map((b) => b.g?.value ?? "")
      .filter((g) => /^http:\/\/data\.europa\.eu\/949\/graph\/[A-Za-z0-9]{2,8}$/.test(g)),
  );
}
