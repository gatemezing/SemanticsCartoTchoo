import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrimaryLocationsCollection, WikidataStationInfo } from "@carto-rinf/shared-types";
import type { SparqlBinding } from "../sparql/client.js";
import { COUNTRIES } from "../countries.js";
import { mapWikidataStations } from "./mapping.js";
import { stationsByOperationalPoint } from "./operationalPoints.js";
import { buildPrimaryLocationsByCodeQuery } from "../sparql/queries.js";
import { buildWifiStationsQuery } from "./queries.js";
import { buildWifiSummary, countStationsByWifi, lookupKeys, partitionWifiStations } from "./wifiSummary.js";

const results = (bindings: SparqlBinding[]) => ({ head: { vars: [] }, results: { bindings } });
const lit = (value: string) => ({ type: "literal" as const, value });
const uri = (value: string) => ({ type: "uri" as const, value });
const wd = (qid: string) => uri(`http://www.wikidata.org/entity/${qid}`);
const FREE = wd("Q1543615");
const NO = wd("Q1814990");

const station = (qid: string, matchedBy: WikidataStationInfo["matchedBy"], wifi?: WikidataStationInfo["wifi"]): WikidataStationInfo => ({
  qid,
  sourceUrl: `http://www.wikidata.org/entity/${qid}`,
  matchedBy,
  matchedValue: "x",
  ...(wifi && { wifi }),
});
const primaryLocations = (...pls: [uopid: string, wikidata?: WikidataStationInfo][]): PrimaryLocationsCollection => ({
  type: "FeatureCollection",
  features: pls.map(([uopid, wikidata], i) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [6, 49] },
    properties: {
      rinfUri: `http://example.org/pl/${i}`,
      primaryLocationCode: `LU${i}`,
      operationalPointUopid: uopid,
      operationalPointName: { status: "value", value: "x" },
      operationalPointRinfUri: `http://example.org/op/${uopid}`,
      positionFrom: "primary-location",
      ...(wikidata && { wikidata }),
    },
  })),
});

test("operational points take their primary locations' stations, else an ERA ID match", () => {
  const index = mapWikidataStations(
    results([
      // ERA ID of a point with no primary location, recording free Wi-Fi.
      { station: wd("Q100"), stationLabel: lit("Halt"), eraId: lit("LU0000002"), wifi: FREE },
      // ERA ID of a point whose primary location already matched by PLC.
      { station: wd("Q200"), eraId: lit("LU0000001"), wifi: NO },
    ]),
    "LU",
    "82",
  );
  const map = stationsByOperationalPoint(
    primaryLocations(["LU0000001", station("Q1", "primary-location-code", "free")], ["LU0000003"]),
    index,
  );
  // The PLC match is stronger than the ERA ID one, whatever their Wi-Fi.
  assert.deepEqual(map.LU0000001, { qid: "Q1", wifi: "free", matchedBy: "primary-location-code", matchedValue: "x" });
  assert.deepEqual(map.LU0000002, { qid: "Q100", label: "Halt", wifi: "free", matchedBy: "era-id", matchedValue: "LU0000002" });
  assert.equal(map.LU0000003, undefined); // a primary location with no match
  assert.equal(Object.getPrototypeOf(map), null);
});

test("between equally strong matches, the one recording Wi-Fi wins", () => {
  const map = stationsByOperationalPoint(
    primaryLocations(
      ["LU0000009", station("Q1", "primary-location-code")],
      ["LU0000009", station("Q2", "primary-location-code", "none")],
      ["LU0000009", station("Q3", "uic-station-code", "free")],
    ),
    mapWikidataStations(results([]), "LU", "82"),
  );
  assert.equal(map.LU0000009.qid, "Q2");
});

test("the Wi-Fi summary counts RINF stations by their matched item's Wi-Fi", () => {
  const countries = COUNTRIES.filter((c) => ["FR", "DE", "LU"].includes(c.code));
  const parts = partitionWifiStations(
    results([
      { station: wd("Q1"), country: wd("Q142"), wifi: FREE, plc: lit("FR02494") },
      { station: wd("Q2"), country: wd("Q142"), wifi: FREE, eraId: lit("FR0000000009") },
      { station: wd("Q3"), country: wd("Q142"), wifi: NO, plc: lit("FR00777") },
      { station: wd("Q4"), country: wd("Q142"), wifi: FREE, plc: lit("FR00888") }, // a junction's: matched, never counted
      // A border item in two countries; and a country outside RINF.
      { station: wd("Q5"), country: wd("Q142"), wifi: FREE, plc: lit("FR00999") },
      { station: wd("Q5"), country: wd("Q183"), wifi: FREE, plc: lit("FR00999") },
      { station: wd("Q6"), country: wd("Q30"), wifi: FREE, plc: lit("US00001") },
    ]),
    countries,
  );
  const fr = parts.get("FR")!;
  assert.deepEqual(lookupKeys(fr.index).uopids, ["FR0000000009"]);
  assert.ok(lookupKeys(fr.index).plCodes.includes("FR02494"));
  assert.equal(parts.get("US"), undefined);

  const station = (plCode: string, uopid: string, type = "10") => ({
    plCode: lit(plCode),
    opUopid: lit(uopid),
    opTypeURI: uri(`http://data.europa.eu/949/concepts/op-types/${type}`),
    wkt: lit("POINT(3.5 50.3)"),
  });
  const rinf = results([
    station("FR02494", "FR0000002651"), // PLC match, free
    station("FR08165", "FR0000000009"), // ERA ID match of its point, free
    station("FR00777", "FR0000000777"), // PLC match, no Wi-Fi
    station("FR00999", "FR0000000999", "70"), // a passenger stop counts as a station
    station("FR00888", "FR0000000888", "80"), // a junction doesn't
    { ...station("FR00555", "FR0000000555"), opTypeURI: uri("http://data.europa.eu/949/concepts/op-types/OperationalPointTypes/10") },
  ]);
  const frStations = countStationsByWifi(rinf, fr.index);
  const summary = buildWifiSummary(
    countries.map((country) => ({
      country,
      stations: country.code === "FR" ? frStations : new Map(),
      wikidata: parts.get(country.code)?.wikidata ?? new Map(),
    })),
    "SELECT …",
    "2026-11-22T00:00:00.000Z",
  );
  assert.deepEqual(
    summary.countries.map((c) => [c.code, c.stations.free, c.stations.none, c.wikidata.free, c.wikidata.none]),
    [
      ["FR", 3, 1, 4, 1],
      ["DE", 0, 0, 1, 0],
      ["LU", 0, 0, 0, 0],
    ],
  );
  // The border item counts once in total.
  assert.deepEqual(summary.total.wikidata, { free: 4, paid: 0, available: 0, none: 1 });
  assert.deepEqual(summary.total.stations, { free: 3, paid: 0, available: 0, none: 1 });
  assert.deepEqual(summary.stationTypes, [
    { code: "10", label: "station" },
    { code: "20", label: "small station" },
    { code: "70", label: "passenger stop" },
  ]);
  assert.match(summary.definition, /“small station” \(op-types\/20\) or “passenger stop” \(op-types\/70\)/);
});

test("the Wi-Fi queries cover every RINF country and only look up code-shaped values", () => {
  const query = buildWifiStationsQuery(COUNTRIES.map((c) => c.wikidataQid));
  for (const c of COUNTRIES) assert.match(query, new RegExp(`wd:${c.wikidataQid}\\b`), c.code);
  assert.match(query, /wdt:P2848/);
  assert.throws(() => buildWifiStationsQuery(["Q1 } DROP"]), /Invalid Wikidata QID/);

  const rinf = buildPrimaryLocationsByCodeQuery("FR", ["FR02494", 'FR1" } DROP'], ["FR0000002651", "x\"y"]);
  assert.ok(rinf);
  assert.match(rinf, /"FR02494"/);
  assert.match(rinf, /"FR0000002651"/);
  assert.doesNotMatch(rinf, /DROP|x"y/);
  assert.equal(buildPrimaryLocationsByCodeQuery("FR", ["not a code"], []), null);
});

test("a primary location shared by two points is a station through its station point only", () => {
  const index = partitionWifiStations(
    results([
      // Each point's ERA ID matches an item recording free Wi-Fi.
      { station: wd("Q10"), country: wd("Q142"), wifi: FREE, eraId: lit("FR0000002651") },
      { station: wd("Q11"), country: wd("Q142"), wifi: NO, eraId: lit("FR0000001897") },
    ]),
    COUNTRIES,
  ).get("FR")!.index;
  const row = (uopid: string, type: string) => ({
    plCode: lit("FR08165"),
    opUopid: lit(uopid),
    opTypeURI: uri(`http://data.europa.eu/949/concepts/op-types/${type}`),
    wkt: lit("POINT(3.52 50.37)"),
  });
  // Valenciennes (a station) and a junction both reference FR08165.
  const counted = countStationsByWifi(results([row("FR0000001897", "80"), row("FR0000002651", "10")]), index);
  assert.deepEqual([...counted].map(([v, codes]) => [v, [...codes]]), [["free", ["FR08165"]]]);
  // Referenced by the junction alone, it isn't a station.
  assert.equal(countStationsByWifi(results([row("FR0000001897", "80")]), index).size, 0);
});
