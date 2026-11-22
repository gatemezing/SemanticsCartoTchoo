import type { OperationalPointWikidataMap, WifiAccess } from "@carto-rinf/shared-types";

/** What the Wi-Fi filter keys on: the Wi-Fi access recorded in Wikidata for
 *  the station matched to a point, or "no-data" when no station matched or
 *  the station records none. The two are told apart in the counts
 *  (`matched`), not on the map. */
export type WifiKey = WifiAccess | "no-data";

export const WIFI_KEYS: readonly WifiKey[] = ["free", "paid", "available", "none", "no-data"];

export const WIFI_LABELS: Record<WifiKey, string> = {
  free: "Free Wi-Fi",
  paid: "Paid Wi-Fi",
  available: "Wi-Fi, cost not stated",
  none: "No Wi-Fi",
  "no-data": "No Wi-Fi data",
};

export function isWifiKey(value: string | null | undefined): value is WifiKey {
  return (WIFI_KEYS as readonly string[]).includes(value ?? "");
}

export function wifiKeyOf(uopid: string, stations: OperationalPointWikidataMap | undefined): WifiKey {
  return stations?.[uopid]?.wifi ?? "no-data";
}

/** Adds the flat `wifiKey` property a MapLibre filter can read (nested
 *  objects reach MapLibre as JSON strings). */
export function withWifiKey<P extends { uopid: string }>(
  collection: GeoJSON.FeatureCollection<GeoJSON.Point, P>,
  stations: OperationalPointWikidataMap | undefined,
): GeoJSON.FeatureCollection<GeoJSON.Point, P & { wifiKey: WifiKey }> {
  return {
    type: "FeatureCollection",
    features: collection.features.map((f) => ({
      ...f,
      properties: { ...f.properties, wifiKey: wifiKeyOf(f.properties.uopid, stations) },
    })),
  };
}

/** A MapLibre filter keeping only points with this Wi-Fi key; null keeps all. */
export function wifiFilterExpression(wifi: WifiKey | null): unknown[] {
  return wifi ? ["==", ["get", "wifiKey"], wifi] : ["boolean", true];
}

export interface WifiTally {
  counts: Record<WifiKey, number>;
  /** Points matched to a Wikidata station, whether or not it records Wi-Fi. */
  matched: number;
  total: number;
}

/** Counts a country's operational points by Wi-Fi key. Each point counts
 *  once, however many primary locations it has. */
export function tallyWifi(
  points: GeoJSON.FeatureCollection<GeoJSON.Point, { uopid: string }>,
  stations: OperationalPointWikidataMap | undefined,
): WifiTally {
  const counts = Object.fromEntries(WIFI_KEYS.map((k) => [k, 0])) as Record<WifiKey, number>;
  let matched = 0;
  const seen = new Set<string>();
  for (const f of points.features) {
    const uopid = f.properties.uopid;
    if (seen.has(uopid)) continue;
    seen.add(uopid);
    counts[wifiKeyOf(uopid, stations)]++;
    if (stations?.[uopid]) matched++;
  }
  return { counts, matched, total: seen.size };
}
