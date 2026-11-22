import assert from "node:assert/strict";
import { test } from "node:test";
import type { SparqlBinding } from "../sparql/client.js";
import { mapWikidataStations } from "../wikidata/mapping.js";
import { enrichPrimaryLocations, mapPrimaryLocations } from "./primaryLocations.js";

const results = (bindings: SparqlBinding[]) => ({ head: { vars: [] }, results: { bindings } });
const lit = (value: string) => ({ type: "literal" as const, value });
const uri = (value: string) => ({ type: "uri" as const, value });

const row = (code: string, geometry: { wkt?: string; opWkt?: string }): SparqlBinding => ({
  pl: uri(`pl/${code}`),
  plCode: lit(code),
  op: uri(`op/${code}`),
  opUopid: lit(`OP${code}`),
  opName: lit(`Station ${code}`),
  ...(geometry.wkt && { wkt: lit(geometry.wkt) }),
  ...(geometry.opWkt && { opWkt: lit(geometry.opWkt) }),
});

test("a primary location's own geometry wins over its operational point's", () => {
  const { features } = mapPrimaryLocations(
    results([row("LU1", { wkt: "POINT(6.1 49.6)", opWkt: "POINT(6.0 49.0)" })])
  );
  assert.deepEqual(features[0].geometry.coordinates, [6.1, 49.6]);
  assert.equal(features[0].properties.positionFrom, "primary-location");
});

test("without its own geometry it sits at its operational point, flagged", () => {
  const { features } = mapPrimaryLocations(
    results([
      row("CH1", { opWkt: "POINT(8.5 47.4)" }),
      // Unparseable own geometry falls back the same way.
      row("CH2", { wkt: "POINT EMPTY", opWkt: "POINT(7.4 46.9)" }),
      // Nothing to place it with: skipped, not thrown.
      row("CH3", {}),
    ])
  );
  assert.deepEqual(
    features.map((f) => [f.properties.primaryLocationCode, f.geometry.coordinates, f.properties.positionFrom]),
    [
      ["CH1", [8.5, 47.4], "operational-point"],
      ["CH2", [7.4, 46.9], "operational-point"],
    ],
  );
});

test("Wikidata is joined onto cached RINF data, leaving unmatched features alone", () => {
  const rinf = mapPrimaryLocations(
    results([row("CH07000", { opWkt: "POINT(7.4395 46.9488)" }), row("CH99999", { opWkt: "POINT(8 47)" })]),
  );
  const index = mapWikidataStations(
    results([{ station: uri("http://www.wikidata.org/entity/Q28870"), uic: lit("8507000"), coord: lit("Point(7.439 46.949)"), wifi: uri("http://www.wikidata.org/entity/Q1543615") }]),
    "CH",
    "85",
  );
  const [bern, other] = enrichPrimaryLocations(rinf, index).features;
  assert.equal(bern.properties.wikidata?.matchedBy, "uic-station-code");
  assert.equal(bern.properties.wikidata?.wifi, "free");
  assert.equal(other, rinf.features[1]); // untouched, same object
  assert.equal(rinf.features[0].properties.wikidata, undefined); // the cached input isn't mutated
});
