import type { OperationalPointsCollection } from "@carto-rinf/shared-types";
import type { SparqlJsonResults } from "../sparql/client.js";
import { wktToPoint } from "../wkt.js";
import { linkFieldValue, literalFieldValue } from "./fieldValue.js";
import { warnSkipped } from "./skipped.js";

export function mapOperationalPoints(
  results: SparqlJsonResults,
): OperationalPointsCollection {
  const features: OperationalPointsCollection["features"] = [];
  let skipped = 0;
  for (const b of results.results.bindings) {
    const geometry = wktToPoint(b.wkt.value);
    if (!geometry) {
      skipped++;
      continue;
    }
    features.push({
      type: "Feature",
      geometry,
      properties: {
        uopid: b.uopid.value,
        rinfUri: b.op.value,
        name: literalFieldValue(b.opName, b.opNameNA),
        opType: linkFieldValue(b.opTypeURI, b.opTypeLabel, b.opTypeNA),
        country: linkFieldValue(b.countryURI, b.countryLabel, b.countryNA),
      },
    });
  }
  warnSkipped("operational points", skipped);
  return { type: "FeatureCollection", features };
}
