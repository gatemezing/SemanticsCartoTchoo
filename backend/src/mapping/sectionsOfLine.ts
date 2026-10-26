import type { SectionOfLineCollection } from "@carto-rinf/shared-types";
import type { SparqlJsonResults } from "../sparql/client.js";
import { wktToLineal } from "../wkt.js";
import { literalFieldValue } from "./fieldValue.js";
import { warnSkipped } from "./skipped.js";

export function mapSectionsOfLine(
  results: SparqlJsonResults,
): SectionOfLineCollection {
  const features: SectionOfLineCollection["features"] = [];
  let skipped = 0;
  for (const b of results.results.bindings) {
    const geometry = wktToLineal(b.wkt.value);
    if (!geometry) {
      skipped++;
      continue;
    }
    features.push({
      type: "Feature",
      geometry,
      properties: {
        rinfUri: b.sol.value,
        opStartUopid: b.opStartUopid.value,
        opEndUopid: b.opEndUopid.value,
        opStartName: literalFieldValue(b.opStartName, undefined),
        opEndName: literalFieldValue(b.opEndName, undefined),
        geometryIsApproximate:
          geometry.type === "LineString" && geometry.coordinates.length <= 2,
      },
    });
  }
  warnSkipped("sections of line", skipped);
  return { type: "FeatureCollection", features };
}
