import assert from "node:assert/strict";
import { test } from "node:test";
import { opTypeFieldValue } from "./opType.js";

const uri = (value: string) => ({ type: "uri" as const, value });
const lit = (value: string) => ({ type: "literal" as const, value });
const ERAC = "http://data.europa.eu/949/concepts/op-types/";

test("Croatian provider concepts get ERA's canonical label, keeping their IRI", () => {
  const hr = `${ERAC}OperationalPointTypes/10`;
  assert.deepEqual(opTypeFieldValue(uri(hr), lit("Station"), undefined), {
    status: "value",
    value: { uri: hr, label: "station", providerConcept: true, providerLabel: "Station" },
  });
  for (const [code, label, typo] of [
    ["100", "shunting yard", "Shuting yard"],
    ["110", "technical change", "Tehnical change"],
    ["120", "switch", "Switch\r\n"],
  ]) {
    const f = opTypeFieldValue(uri(`${ERAC}OperationalPointTypes/${code}`), lit(typo), undefined);
    assert.equal(f.status === "value" && f.value.label, label);
  }
});

test("ERA concepts and unknown ones pass through (trimmed)", () => {
  const era = opTypeFieldValue(uri(`${ERAC}80`), lit("junction"), undefined);
  assert.equal(era.status === "value" && era.value.label, "junction");
  assert.equal(era.status === "value" && era.value.providerConcept, undefined);
  const odd = opTypeFieldValue(uri(`${ERAC}OperationalPointTypes/999`), lit("Odd \r\n"), undefined);
  assert.equal(odd.status === "value" && odd.value.label, "Odd");
  assert.deepEqual(opTypeFieldValue(undefined, undefined, undefined), { status: "not_available_in_rinf" });
});
