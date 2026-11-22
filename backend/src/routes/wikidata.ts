import type { FastifyInstance } from "fastify";
import type {
  ApiEnvelope,
  OperationalPointWikidataMap,
  PrimaryLocationsCollection,
  WifiSummary,
} from "@carto-rinf/shared-types";
import { enrichOnce } from "../cache/enrichOnce.js";
import { replyWithError } from "../errors.js";
import { enrichPrimaryLocations } from "../mapping/primaryLocations.js";
import { stationsByOperationalPoint } from "../wikidata/operationalPoints.js";
import { getWifiSummary, getWikidataStations, WikidataUnavailableError } from "../wikidata/service.js";
import { loadPrimaryLocations } from "./primaryLocations.js";
import { resolveCountry } from "./resolveCountry.js";

/** Stands in for a country's primary locations when they can't be loaded,
 *  so points still get their ERA ID matches. One object, so the join is
 *  memoised like any other. */
const NO_PRIMARY_LOCATIONS: PrimaryLocationsCollection = { type: "FeatureCollection", features: [] };

export function registerWikidataRoutes(app: FastifyInstance): void {
  /** The Wikidata station matched to each operational point of a country,
   *  for the map's Wi-Fi filter. Enrichment only: separate from the
   *  operational-points layer, so it never slows that core layer down. */
  app.get("/api/wikidata/stations", async (request, reply) => {
    const country = resolveCountry(request, reply);
    if (!country) return reply;
    try {
      const [primaryLocations, index] = await Promise.all([
        loadPrimaryLocations(country).catch((err: unknown) => {
          request.log.warn({ err }, `Primary locations unavailable for ${country.code}: ERA ID matches only`);
          return NO_PRIMARY_LOCATIONS;
        }),
        getWikidataStations(country),
      ]);
      const enriched = enrichOnce(primaryLocations, index, enrichPrimaryLocations);
      const data = enrichOnce(enriched, index, stationsByOperationalPoint);
      const body: ApiEnvelope<OperationalPointWikidataMap> = { status: "ok", data };
      return body;
    } catch (err) {
      return replyWithError(request, reply, err, "Unexpected server error while matching Wikidata stations");
    }
  });

  /** Europe-wide: how many RINF stations are matched to a Wikidata item
   *  recording free (or paid, or no) Wi-Fi, per country. */
  app.get("/api/wikidata/wifi", async (request, reply) => {
    try {
      const data = await getWifiSummary();
      const body: ApiEnvelope<WifiSummary> = { status: "ok", data };
      return body;
    } catch (err) {
      if (err instanceof WikidataUnavailableError) {
        reply.code(503);
        const body: ApiEnvelope<never> = {
          status: "error",
          message: "Wikidata's query service didn't answer. Try again in a few minutes.",
        };
        return body;
      }
      return replyWithError(request, reply, err, "Unexpected server error while counting Wi-Fi stations");
    }
  });
}
