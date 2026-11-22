import type { PrimaryLocationsCollection } from "@carto-rinf/shared-types";
import type { SparqlJsonResults } from "../sparql/client.js";
import { matchWikidataStation, type WikidataStationIndex } from "../wikidata/mapping.js";
import { wktToPoint } from "../wkt.js";
import { literalFieldValue } from "./fieldValue.js";
import { warnSkipped } from "./skipped.js";

/** RINF's primary locations, without Wikidata (see enrichPrimaryLocations). */
export function mapPrimaryLocations(results: SparqlJsonResults): PrimaryLocationsCollection {
  const features: PrimaryLocationsCollection["features"] = [];
  let skipped = 0;
  for (const b of results.results.bindings) {
    // Own geometry first, else the operational point's (see
    // buildPrimaryLocationsQuery for which providers need this).
    const own = b.wkt ? wktToPoint(b.wkt.value) : null;
    const geometry = own ?? (b.opWkt ? wktToPoint(b.opWkt.value) : null);
    if (!geometry) {
      skipped++;
      continue;
    }
    const plCode = b.plCode.value;
    features.push({
      type: "Feature",
      geometry,
      properties: {
        rinfUri: b.pl.value,
        primaryLocationCode: plCode,
        operationalPointUopid: b.opUopid.value,
        operationalPointName: literalFieldValue(b.opName, undefined),
        operationalPointRinfUri: b.op.value,
        positionFrom: own ? "primary-location" : "operational-point",
      },
    });
  }
  warnSkipped("primary locations", skipped);
  return { type: "FeatureCollection", features };
}

/** Adds each primary location's Wikidata station, when one matches. */
export function enrichPrimaryLocations(
  collection: PrimaryLocationsCollection,
  wikidata: WikidataStationIndex,
): PrimaryLocationsCollection {
  return {
    type: "FeatureCollection",
    features: collection.features.map((f) => {
      const station = matchWikidataStation(wikidata, {
        primaryLocationCode: f.properties.primaryLocationCode,
        operationalPointUopid: f.properties.operationalPointUopid,
        point: f.geometry.coordinates as [number, number],
      });
      return station ? { ...f, properties: { ...f.properties, wikidata: station } } : f;
    }),
  };
}
