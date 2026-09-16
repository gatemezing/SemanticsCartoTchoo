import type { OperationalPointsCollection } from "@carto-rinf/shared-types";
import type { SparqlJsonResults } from "../sparql/client.js";
import { parseWktPoint } from "../wkt.js";
import { linkFieldValue, literalFieldValue } from "./fieldValue.js";

export function mapOperationalPoints(
  results: SparqlJsonResults,
): OperationalPointsCollection {
  return {
    type: "FeatureCollection",
    features: results.results.bindings.map((b) => ({
      type: "Feature",
      geometry: parseWktPoint(b.wkt.value),
      properties: {
        uopid: b.uopid.value,
        rinfUri: b.op.value,
        name: literalFieldValue(b.opName, b.opNameNA),
        opType: linkFieldValue(b.opTypeURI, b.opTypeLabel, b.opTypeNA),
        country: linkFieldValue(b.countryURI, b.countryLabel, b.countryNA),
      },
    })),
  };
}
