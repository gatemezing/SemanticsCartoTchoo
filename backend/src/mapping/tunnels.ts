import type { TunnelsCollection } from "@carto-rinf/shared-types";
import type { SparqlJsonResults } from "../sparql/client.js";
import { wktToLineal } from "../wkt.js";
import { literalFieldValue, numericFieldValue } from "./fieldValue.js";
import { warnSkipped } from "./skipped.js";

export function mapTunnels(results: SparqlJsonResults): TunnelsCollection {
  const features: TunnelsCollection["features"] = [];
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
        rinfUri: b.t.value,
        name: literalFieldValue(b.label, b.labelNA),
        lengthMetres: numericFieldValue(b.length, b.lengthNA),
      },
    });
  }
  warnSkipped("tunnels", skipped);
  return { type: "FeatureCollection", features };
}
