import assert from "node:assert/strict";
import { test } from "node:test";
import type { SparqlBinding } from "../sparql/client.js";
import { getCountry } from "../countries.js";
import { buildStationsQuery } from "./queries.js";
import { mapWikidataStations, matchWikidataStation, uicKey } from "./mapping.js";

const results = (bindings: SparqlBinding[]) => ({ head: { vars: [] }, results: { bindings } });
const lit = (value: string) => ({ type: "literal" as const, value });
const uri = (value: string) => ({ type: "uri" as const, value });
const wd = (qid: string) => uri(`http://www.wikidata.org/entity/${qid}`);

test("UIC codes map to this country's primary location code, check digit or not", () => {
  assert.equal(uicKey("8507000", "CH", "85"), "CH07000");
  assert.equal(uicKey("85070003", "CH", "85"), "CH07000");
  assert.equal(uicKey("8003000", "CH", "85"), undefined); // another country's
  assert.equal(uicKey("85070", "CH", "85"), undefined);
});

test("stations match on PLC first, then ERA ID, then a nearby UIC code", () => {
  const index = mapWikidataStations(
    results([
      // Zürich HB has a PLC; it also has a UIC code, which never overrides it.
      { station: wd("Q224494"), stationLabel: lit("Zürich Hauptbahnhof"), plc: lit("CH03000"), coord: lit("Point(8.54 47.378)") },
      { station: wd("Q224494"), stationLabel: lit("Zürich Hauptbahnhof"), uic: lit("8503000"), coord: lit("Point(8.54 47.378)") },
      // Bern has only a UIC code.
      { station: wd("Q28870"), stationLabel: lit("Bern railway station"), uic: lit("8507000"), coord: lit("Point(7.439 46.949)"), platforms: lit("12") },
      // An item matched by ERA ID (a uopid), with no usable label.
      { station: wd("Q116337072"), stationLabel: lit("Q116337072"), eraId: lit("CH0001234") },
      // A UIC match far from RINF's position.
      { station: wd("Q1"), uic: lit("8509000"), coord: lit("Point(6.0 46.0)") },
    ]),
    "CH",
    "85",
  );

  const zurich = matchWikidataStation(index, { primaryLocationCode: "CH03000", operationalPointUopid: "CH03000", point: [8.54, 47.378] });
  assert.equal(zurich?.matchedBy, "primary-location-code");
  assert.equal(zurich?.matchedValue, "CH03000");

  const bern = matchWikidataStation(index, { primaryLocationCode: "CH07000", operationalPointUopid: "CH07000", point: [7.4395, 46.9488] });
  assert.equal(bern?.matchedBy, "uic-station-code");
  assert.equal(bern?.matchedValue, "8507000");
  assert.equal(bern?.qid, "Q28870");
  assert.equal(bern?.sourceUrl, "http://www.wikidata.org/entity/Q28870");
  assert.equal(bern?.platformCount, 12);

  const byEraId = matchWikidataStation(index, { primaryLocationCode: "CH99999", operationalPointUopid: "CH0001234", point: [8, 47] });
  assert.equal(byEraId?.matchedBy, "era-id");
  assert.equal(byEraId?.label, undefined); // the bare QID isn't a name

  // Chur's UIC code is on an item 100+ km away: not accepted.
  assert.equal(matchWikidataStation(index, { primaryLocationCode: "CH09000", operationalPointUopid: "CH09000", point: [9.529, 46.853] }), undefined);
});

test("the nearest of several UIC candidates wins", () => {
  const index = mapWikidataStations(
    results([
      { station: wd("Q10"), uic: lit("5507013"), coord: lit("Point(19.0010 47.0)") },
      { station: wd("Q11"), uic: lit("5507013"), coord: lit("Point(19.0002 47.0)") },
    ]),
    "HU",
    "55",
  );
  const m = matchWikidataStation(index, { primaryLocationCode: "HU07013", operationalPointUopid: "HU5507013", point: [19.0, 47.0] });
  assert.equal(m?.qid, "Q11");
});

test("the stations query keys on code prefixes, not on one station class", () => {
  const q = buildStationsQuery(getCountry("EL")!, "GR");
  assert.match(q, /wdt:P12783 \?plc \. FILTER\(STRSTARTS\(\?plc, "GR"\)\)/);
  assert.match(q, /wdt:P11631 \?eraId \. FILTER\(STRSTARTS\(\?eraId, "GR"\)\)/);
  assert.match(q, /wdt:P722 \?uic \. FILTER\(STRSTARTS\(\?uic, "73"\)\)/);
  assert.doesNotMatch(q, /wd:Q55488/);
  // Liechtenstein has no UIC country code of its own: no UIC branch.
  assert.doesNotMatch(buildStationsQuery(getCountry("LI")!, "LI"), /P722/);
  assert.throws(() => buildStationsQuery(getCountry("CH")!, 'CH") } #'));
});
