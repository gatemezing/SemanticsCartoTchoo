import type {
  OperationalPointWikidata,
  OperationalPointWikidataMap,
  PrimaryLocationsCollection,
  WifiAccess,
  WikidataStationInfo,
} from "@carto-rinf/shared-types";
import type { WikidataStationIndex } from "./mapping.js";

const MATCH_RANK: Record<WikidataStationInfo["matchedBy"], number> = {
  "primary-location-code": 3,
  "era-id": 2,
  "uic-station-code": 1,
};
const WIFI_RANK: Record<WifiAccess, number> = { free: 4, paid: 3, available: 2, none: 1 };

function compact(s: WikidataStationInfo): OperationalPointWikidata {
  return {
    qid: s.qid,
    ...(s.label && { label: s.label }),
    ...(s.wifi && { wifi: s.wifi }),
    matchedBy: s.matchedBy,
    matchedValue: s.matchedValue,
  };
}

/** The stronger match wins. Two different items claiming the same point
 *  disagree, and the stronger key is the one to trust; only on a tie does
 *  the one recording Wi-Fi win (the same item matched twice has the same
 *  facts either way). */
function isBetter(a: OperationalPointWikidata, b: OperationalPointWikidata): boolean {
  const byMatch = MATCH_RANK[a.matchedBy] - MATCH_RANK[b.matchedBy];
  if (byMatch !== 0) return byMatch > 0;
  return (a.wifi ? WIFI_RANK[a.wifi] : 0) > (b.wifi ? WIFI_RANK[b.wifi] : 0);
}

/** One Wikidata station per operational point, keyed by uopid: from the
 *  point's primary locations (already matched on any of the three keys, see
 *  enrichPrimaryLocations), and directly by ERA ID for points that have no
 *  primary location. Uopids that aren't in the country's layer are harmless:
 *  the map joins on the points it has. */
export function stationsByOperationalPoint(
  primaryLocations: PrimaryLocationsCollection,
  index: WikidataStationIndex,
): OperationalPointWikidataMap {
  // Keys come partly from Wikidata values: no inherited prototype keys.
  const out: OperationalPointWikidataMap = Object.create(null);
  const offer = (uopid: string, station: OperationalPointWikidata) => {
    const current = out[uopid];
    if (!current || isBetter(station, current)) out[uopid] = station;
  };
  for (const f of primaryLocations.features) {
    if (f.properties.wikidata) offer(f.properties.operationalPointUopid, compact(f.properties.wikidata));
  }
  for (const [uopid, candidate] of index.byEraId) {
    offer(uopid, compact({ ...candidate.facts, matchedBy: "era-id", matchedValue: uopid }));
  }
  return out;
}
