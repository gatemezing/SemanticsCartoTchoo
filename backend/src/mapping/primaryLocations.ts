import type { PrimaryLocationsCollection } from "@carto-rinf/shared-types";
import type { SparqlJsonResults } from "../sparql/client.js";
import { parseWktPoint } from "../wkt.js";
import { literalFieldValue } from "./fieldValue.js";

export function mapPrimaryLocations(
  results: SparqlJsonResults,
): PrimaryLocationsCollection {
  return {
    type: "FeatureCollection",
    features: results.results.bindings.map((b) => ({
      type: "Feature",
      geometry: parseWktPoint(b.wkt.value),
      properties: {
        rinfUri: b.pl.value,
        primaryLocationCode: b.plCode.value,
        operationalPointUopid: b.opUopid.value,
        operationalPointName: literalFieldValue(b.opName, undefined),
        operationalPointRinfUri: b.op.value,
      },
    })),
  };
}
