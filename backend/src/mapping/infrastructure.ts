import type {
  InfrastructureCollection,
  InfrastructureKind,
  InfrastructureProperties,
} from "@carto-rinf/shared-types";
import type { SparqlJsonResults } from "../sparql/client.js";
import { parseWkt } from "../wkt.js";
import { linkFieldValue, literalFieldValue } from "./fieldValue.js";

/** Features whose WKT can't be parsed (or is EMPTY) are left out and
 *  counted, rather than failing the whole layer for one bad record. */
export function mapInfrastructure(
  kind: InfrastructureKind,
  results: SparqlJsonResults,
): { collection: InfrastructureCollection; skipped: number } {
  let skipped = 0;
  const features: InfrastructureCollection["features"] = [];
  for (const b of results.results.bindings) {
    let geometry: GeoJSON.Geometry | null = null;
    try {
      geometry = b.wkt ? parseWkt(b.wkt.value) : null;
    } catch {
      geometry = null;
    }
    if (!geometry) {
      skipped++;
      continue;
    }
    const properties: InfrastructureProperties = {
      rinfUri: b.s.value,
      kind,
      label: literalFieldValue(b.labelEn ?? b.labelAny, undefined),
    };
    if (kind === "signals") {
      properties.subtype = linkFieldValue(b.subtype, b.subtypeLabel, undefined);
    }
    features.push({ type: "Feature", geometry, properties });
  }
  return { collection: { type: "FeatureCollection", features }, skipped };
}
