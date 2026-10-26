import assert from "node:assert/strict";
import { test } from "node:test";
import { NOT_ELECTRIFIED } from "@carto-rinf/shared-types";
import type { SparqlBinding } from "../sparql/client.js";
import { mapInfrastructure } from "./infrastructure.js";
import { mapSectionsOfLine } from "./sectionsOfLine.js";
import { buildSectionParameters, mapConceptLabels, mapParameterRows } from "./trackParameters.js";

const results = (bindings: SparqlBinding[]) => ({ head: { vars: [] }, results: { bindings } });
const lit = (value: string) => ({ type: "literal" as const, value });
const uri = (value: string) => ({ type: "uri" as const, value });
const ERAC = "http://data.europa.eu/949/concepts/";

test("parameter rows roll up per section; categories count sections", () => {
  const { bySection, conceptIris } = mapParameterRows(results([
    { sol: uri("s1"), param: lit("maxSpeed"), min: lit("80"), max: lit("120") },
    { sol: uri("s1"), param: lit("electrification"), values: lit(`${ERAC}energy-supply-systems/AC10|${NOT_ELECTRIFIED}`) },
    { sol: uri("s2"), param: lit("electrification"), values: lit(`${ERAC}energy-supply-systems/AC10`) },
    { sol: uri("s3"), param: lit("bogus"), values: lit("x") },
    { sol: uri("s4"), param: lit("maxSpeed"), min: lit("n/a"), max: lit("n/a") },
  ]));
  assert.deepEqual(bySection.get("s1")?.maxSpeed, { kind: "numeric", min: 80, max: 120 });
  assert.equal(bySection.has("s3"), false); // unknown parameter ignored
  assert.equal(bySection.has("s4"), false); // unparseable number = no data
  // The synthetic value never needs a label lookup.
  assert.deepEqual([...conceptIris], [`${ERAC}energy-supply-systems/AC10`]);

  const labels = mapConceptLabels(results([
    { c: uri(`${ERAC}energy-supply-systems/AC10`), enLabel: lit("AC 25kV-50Hz") },
  ]));
  const p = buildSectionParameters("electrification", bySection, labels);
  assert.deepEqual(p.categories, [
    { value: `${ERAC}energy-supply-systems/AC10`, sections: 2, label: "AC 25kV-50Hz" },
    { value: NOT_ELECTRIFIED, sections: 1, label: "Not electrified" },
  ]);
});

test("concept codes RINF doesn't label stay unlabelled, not invented", () => {
  const labels = mapConceptLabels(results([{ c: uri(`${ERAC}etcs-levels/10`) }]));
  assert.equal(labels[`${ERAC}etcs-levels/10`], undefined);
});

test("sections are 'approximate' only when they're a bare two-point line", () => {
  const c = mapSectionsOfLine(results([
    { sol: uri("a"), opStartUopid: lit("A"), opEndUopid: lit("B"), wkt: lit("LINESTRING(1 1, 2 2)") },
    { sol: uri("b"), opStartUopid: lit("B"), opEndUopid: lit("C"), wkt: lit("LINESTRING(2 2, 2.5 2.7, 3 3)") },
    { sol: uri("c"), opStartUopid: lit("C"), opEndUopid: lit("D"), wkt: lit("broken") },
  ]));
  assert.deepEqual(c.features.map((f) => [f.properties.rinfUri, f.properties.geometryIsApproximate]), [["a", true], ["b", false]]);
});

test("infrastructure: bad geometry is skipped and counted, labels fall back", () => {
  const { collection, skipped } = mapInfrastructure("signals", results([
    { s: uri("x"), wkt: lit("POINT(1 2)"), labelAny: lit("HSA(347)"), subtype: uri(`${ERAC}signal-types/06`), subtypeLabel: lit("Block Signal") },
    { s: uri("y"), wkt: lit("POLYGON((0 0, 1 0, 1 1, 0 0))") },
    { s: uri("z"), wkt: lit("garbage") },
  ]));
  assert.equal(skipped, 1);
  assert.deepEqual(collection.features[0].properties.label, { status: "value", value: "HSA(347)" });
  assert.equal(collection.features[1].geometry.type, "Polygon");
  assert.deepEqual(collection.features[1].properties.label, { status: "not_available_in_rinf" });
});
