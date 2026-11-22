import assert from "node:assert/strict";
import { test } from "node:test";
import type { SparqlBinding } from "../sparql/client.js";
import { enrichTunnels, mapTunnels } from "../mapping/tunnels.js";
import { buildStructuresQuery } from "./queries.js";
import { wifiAccess } from "./mapping.js";
import { distanceMetres, mapWikidataStructures, matchStructure } from "./structures.js";

const results = (bindings: SparqlBinding[]) => ({ head: { vars: [] }, results: { bindings } });
const lit = (value: string) => ({ type: "literal" as const, value });
const uri = (value: string) => ({ type: "uri" as const, value });
const wd = (qid: string) => uri(`http://www.wikidata.org/entity/${qid}`);

test("point-to-line distance is measured to the segment, not just its vertices", () => {
  const line: GeoJSON.LineString = { type: "LineString", coordinates: [[8.0, 47.0], [8.02, 47.0]] };
  assert.ok(distanceMetres([8.01, 47.001], line) < 115); // ~111 m north of the middle
  assert.ok(distanceMetres([8.01, 47.001], line) > 105);
});

test("structures collect multi-valued facts per item and keep the year only", () => {
  const [c] = mapWikidataStructures(results([
    { item: wd("Q1"), itemLabel: lit("Karawanken Tunnel"), coord: lit("Point(14.0 46.45)"), lengthM: lit("7976"),
      opened: lit("1906-10-01T00:00:00Z"), crossesLabel: lit("Karawanks"), image: uri("http://commons.wikimedia.org/wiki/Special:FilePath/Karawankentunnel.jpg") },
    { item: wd("Q1"), itemLabel: lit("Karawanken Tunnel"), coord: lit("Point(14.0 46.45)"), lengthM: lit("7976"),
      opened: lit("1906-10-01T00:00:00Z"), crossesLabel: lit("Austria–Slovenia border") },
    { item: wd("Q2"), itemLabel: lit("no coordinates") },
  ]));
  assert.equal(c.facts.lengthMetres, 7976);
  assert.equal(c.facts.opened, "1906");
  assert.deepEqual(c.facts.crosses, ["Karawanks", "Austria–Slovenia border"]);
  assert.equal(c.facts.image, "http://commons.wikimedia.org/wiki/Special:FilePath/Karawankentunnel.jpg");
});

test("the nearest structure within range matches, unless the lengths disagree", () => {
  const candidates = mapWikidataStructures(results([
    { item: wd("Q10"), coord: lit("Point(8.010 47.0005)"), lengthM: lit("1500") },
    { item: wd("Q11"), coord: lit("Point(8.010 47.0020)"), lengthM: lit("200") }, // ~220 m away
  ]));
  const line: GeoJSON.LineString = { type: "LineString", coordinates: [[8.0, 47.0], [8.02, 47.0]] };
  assert.equal(matchStructure(candidates, line, 1520, 300)?.qid, "Q10");
  assert.equal(matchStructure(candidates, line, 1520, 300)?.matchedBy, "position");
  // A 210 m RINF tunnel can't be the 1.5 km one, even though it's nearer.
  assert.equal(matchStructure(candidates, line, 210, 300)?.qid, "Q11");
  assert.equal(matchStructure(candidates, line, 5000, 300), undefined);
  assert.equal(matchStructure(candidates, { type: "Point", coordinates: [9, 48] }, undefined, 300), undefined);
});

test("Austrian tunnels without geometry are drawn portal to portal, then enriched", () => {
  const tunnels = mapTunnels(results([
    { t: uri("t1"), label: lit("KARAWANKEN"), length: lit("7975.27"), startWkt: lit("POINT (14.0 46.44)"), endWkt: lit("POINT (14.01 46.51)") },
    { t: uri("t2"), label: lit("only one portal"), startWkt: lit("POINT (14.0 46.4)") },
  ]));
  assert.equal(tunnels.features.length, 1);
  assert.deepEqual(tunnels.features[0].geometry, { type: "LineString", coordinates: [[14.0, 46.44], [14.01, 46.51]] });
  const enriched = enrichTunnels(tunnels, mapWikidataStructures(results([
    { item: wd("Q1"), coord: lit("Point(14.005 46.475)"), lengthM: lit("7976") },
  ])));
  assert.equal(enriched.features[0].properties.wikidata?.qid, "Q1");
});

test("Wi-Fi access reads the value item, never guesses", () => {
  assert.equal(wifiAccess("http://www.wikidata.org/entity/Q1543615"), "free");
  assert.equal(wifiAccess("http://www.wikidata.org/entity/Q1814990"), "none");
  assert.equal(wifiAccess("http://www.wikidata.org/entity/Q24202480"), "paid");
  assert.equal(wifiAccess("http://www.wikidata.org/entity/Q6452715"), "available");
  assert.equal(wifiAccess("http://www.wikidata.org/entity/Q42"), undefined);
});

test("structure queries pick the class, normalise quantities and reject bad QIDs", () => {
  const tunnel = buildStructuresQuery("tunnel", "Q40");
  assert.match(tunnel, /wdt:P31 wd:Q1311958 ;\s+wdt:P17 wd:Q40/);
  assert.match(tunnel, /p:P2043\/psv:P2043\/wikibase:quantityNormalized/);
  assert.doesNotMatch(tunnel, /P1314/); // spans are a bridge fact
  assert.match(buildStructuresQuery("bridge", "Q20"), /wd:Q1210334[\s\S]*P1314/);
  assert.throws(() => buildStructuresQuery("tunnel", "Q40 } #"));
});
