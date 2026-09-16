import type { SectionOfLineCollection } from "@carto-rinf/shared-types";
import type { SparqlJsonResults } from "../sparql/client.js";
import { parseWktLineString } from "../wkt.js";
import { literalFieldValue } from "./fieldValue.js";

export function mapSectionsOfLine(
  results: SparqlJsonResults,
): SectionOfLineCollection {
  return {
    type: "FeatureCollection",
    features: results.results.bindings.map((b) => ({
      type: "Feature",
      geometry: parseWktLineString(b.wkt.value),
      properties: {
        opStartUopid: b.opStartUopid.value,
        opEndUopid: b.opEndUopid.value,
        opStartName: literalFieldValue(b.opStartName, undefined),
        opEndName: literalFieldValue(b.opEndName, undefined),
        geometryIsApproximate: true,
      },
    })),
  };
}
