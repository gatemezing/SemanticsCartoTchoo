import type { WikidataStationInfo } from "@carto-rinf/shared-types";
import type { SparqlJsonResults } from "../sparql/client.js";

/** Keyed by PLC (era:primaryLocationCode / wdt:P12783). A PLC can appear on
 *  more than one Wikidata item in rare cases (1,670 rows / 1,666 distinct
 *  PLCs observed live) — first one wins, since there's no principled way to
 *  prefer one duplicate over another from this data alone. */
export function mapWikidataStationsByPlc(
  results: SparqlJsonResults,
): Map<string, WikidataStationInfo> {
  const byPlc = new Map<string, WikidataStationInfo>();

  for (const b of results.results.bindings) {
    const plc = b.plc.value;
    if (byPlc.has(plc)) continue;

    const info: WikidataStationInfo = {
      qid: b.station.value.replace("http://www.wikidata.org/entity/", ""),
      sourceUrl: b.station.value,
    };
    if (b.stationLabel) info.label = b.stationLabel.value;
    if (b.accessLabel) info.wheelchairAccessibility = b.accessLabel.value;
    if (b.wifiLabel) info.wifi = b.wifiLabel.value;
    if (b.platforms) info.platformCount = Number(b.platforms.value);

    byPlc.set(plc, info);
  }

  return byPlc;
}
