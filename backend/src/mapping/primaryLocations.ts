import type {
  PrimaryLocationsCollection,
  WikidataStationInfo,
} from "@carto-rinf/shared-types";
import type { SparqlJsonResults } from "../sparql/client.js";
import { parseWktPoint } from "../wkt.js";
import { literalFieldValue } from "./fieldValue.js";

export function mapPrimaryLocations(
  results: SparqlJsonResults,
  wikidataByPlc: Map<string, WikidataStationInfo>,
): PrimaryLocationsCollection {
  return {
    type: "FeatureCollection",
    features: results.results.bindings.map((b) => {
      const plCode = b.plCode.value;
      const wikidata = wikidataByPlc.get(plCode);
      return {
        type: "Feature",
        geometry: parseWktPoint(b.wkt.value),
        properties: {
          rinfUri: b.pl.value,
          primaryLocationCode: plCode,
          operationalPointUopid: b.opUopid.value,
          operationalPointName: literalFieldValue(b.opName, undefined),
          operationalPointRinfUri: b.op.value,
          ...(wikidata ? { wikidata } : {}),
        },
      };
    }),
  };
}
