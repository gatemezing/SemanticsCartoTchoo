import type {
  PrimaryLocationsCollection,
  WikidataStationInfo,
} from "@carto-rinf/shared-types";
import type { SparqlJsonResults } from "../sparql/client.js";
import { wktToPoint } from "../wkt.js";
import { literalFieldValue } from "./fieldValue.js";
import { warnSkipped } from "./skipped.js";

export function mapPrimaryLocations(
  results: SparqlJsonResults,
  wikidataByPlc: Map<string, WikidataStationInfo>,
): PrimaryLocationsCollection {
  const features: PrimaryLocationsCollection["features"] = [];
  let skipped = 0;
  for (const b of results.results.bindings) {
    const geometry = wktToPoint(b.wkt.value);
    if (!geometry) {
      skipped++;
      continue;
    }
    const plCode = b.plCode.value;
    const wikidata = wikidataByPlc.get(plCode);
    features.push({
      type: "Feature",
      geometry,
      properties: {
        rinfUri: b.pl.value,
        primaryLocationCode: plCode,
        operationalPointUopid: b.opUopid.value,
        operationalPointName: literalFieldValue(b.opName, undefined),
        operationalPointRinfUri: b.op.value,
        ...(wikidata ? { wikidata } : {}),
      },
    });
  }
  warnSkipped("primary locations", skipped);
  return { type: "FeatureCollection", features };
}
