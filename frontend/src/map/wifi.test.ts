import assert from "node:assert/strict";
import { test } from "node:test";
import type { OperationalPointWikidataMap } from "@carto-rinf/shared-types";
import { isWifiKey, tallyWifi, wifiFilterExpression, withWifiKey } from "./wifi";

const points = (...uopids: string[]) => ({
  type: "FeatureCollection" as const,
  features: uopids.map((uopid) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [6, 49] },
    properties: { uopid },
  })),
});
const stations: OperationalPointWikidataMap = {
  LU1: { qid: "Q1", wifi: "free", matchedBy: "era-id", matchedValue: "LU1" },
  LU2: { qid: "Q2", wifi: "none", matchedBy: "primary-location-code", matchedValue: "LU02" },
  LU3: { qid: "Q3", matchedBy: "uic-station-code", matchedValue: "8200003" },
};

test("points get the Wi-Fi of their matched station, else no-data", () => {
  const keys = withWifiKey(points("LU1", "LU2", "LU3", "LU4"), stations).features.map((f) => f.properties.wifiKey);
  assert.deepEqual(keys, ["free", "none", "no-data", "no-data"]);
  assert.deepEqual(
    withWifiKey(points("LU1"), undefined).features.map((f) => f.properties.wifiKey),
    ["no-data"],
  );
});

test("the tally counts each point once and tells matched from recorded", () => {
  const tally = tallyWifi(points("LU1", "LU1", "LU2", "LU3", "LU4"), stations);
  assert.deepEqual(tally.counts, { free: 1, paid: 0, available: 0, none: 1, "no-data": 2 });
  assert.equal(tally.matched, 3);
  assert.equal(tally.total, 4);
});

test("the filter keeps one Wi-Fi key, or everything", () => {
  assert.deepEqual(wifiFilterExpression("free"), ["==", ["get", "wifiKey"], "free"]);
  assert.deepEqual(wifiFilterExpression(null), ["boolean", true]);
  assert.ok(isWifiKey("no-data"));
  assert.ok(!isWifiKey("gratis"));
  assert.ok(!isWifiKey(null));
});
