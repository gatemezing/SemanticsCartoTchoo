import type { TunnelsCollection } from "@carto-rinf/shared-types";
import type { SparqlBinding, SparqlJsonResults } from "../sparql/client.js";
import { matchStructure, STRUCTURE_MATCH_MAX_METRES, type StructureCandidate } from "../wikidata/structures.js";
import { wktToLineal, wktToPoint } from "../wkt.js";
import { literalFieldValue, numericFieldValue } from "./fieldValue.js";
import { warnSkipped } from "./skipped.js";

export function mapTunnels(results: SparqlJsonResults): TunnelsCollection {
  const features: TunnelsCollection["features"] = [];
  let skipped = 0;
  for (const b of results.results.bindings) {
    const geometry = (b.wkt && wktToLineal(b.wkt.value)) || portalToPortal(b);
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

/** A straight line between the two portals, for providers that give only
 *  those (Austria). That is a tunnel's real extent, not a stand-in. */
function portalToPortal(b: SparqlBinding): GeoJSON.LineString | null {
  const start = b.startWkt && wktToPoint(b.startWkt.value);
  const end = b.endWkt && wktToPoint(b.endWkt.value);
  return start && end ? { type: "LineString", coordinates: [start.coordinates, end.coordinates] } : null;
}

/** Adds each tunnel's Wikidata railway tunnel, when one is close enough
 *  and, where both give a length, about as long. */
export function enrichTunnels(collection: TunnelsCollection, candidates: readonly StructureCandidate[]): TunnelsCollection {
  if (candidates.length === 0) return collection;
  return {
    type: "FeatureCollection",
    features: collection.features.map((f) => {
      const length = f.properties.lengthMetres.status === "value" ? f.properties.lengthMetres.value : undefined;
      const wikidata = matchStructure(candidates, f.geometry, length, STRUCTURE_MATCH_MAX_METRES.tunnel);
      return wikidata ? { ...f, properties: { ...f.properties, wikidata } } : f;
    }),
  };
}
