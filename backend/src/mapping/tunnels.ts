import type { TunnelsCollection } from "@carto-rinf/shared-types";
import type { SparqlJsonResults } from "../sparql/client.js";
import { parseWktLineString } from "../wkt.js";
import { literalFieldValue, numericFieldValue } from "./fieldValue.js";

export function mapTunnels(results: SparqlJsonResults): TunnelsCollection {
  return {
    type: "FeatureCollection",
    features: results.results.bindings.map((b) => ({
      type: "Feature",
      geometry: parseWktLineString(b.wkt.value),
      properties: {
        rinfUri: b.t.value,
        name: literalFieldValue(b.label, b.labelNA),
        lengthMetres: numericFieldValue(b.length, b.lengthNA),
      },
    })),
  };
}
