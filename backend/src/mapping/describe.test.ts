import assert from "node:assert/strict";
import { test } from "node:test";
import type { SparqlBinding } from "../sparql/client.js";
import { mapDescribe } from "./describe.js";

const ERA = "http://data.europa.eu/949/";

function results(bindings: SparqlBinding[]) {
  return { head: { vars: [] }, results: { bindings } };
}

test("maps terms, labels, lang and datatype", () => {
  const out = mapDescribe(
    `${ERA}sol/1`,
    "out",
    results([
      {
        p: { type: "uri", value: `${ERA}lengthOfSectionOfLine` },
        pLabel: { type: "literal", value: "Length of section of line" },
        node: {
          type: "literal",
          value: "1.85",
          datatype: "http://www.w3.org/2001/XMLSchema#double",
        },
      },
      {
        p: { type: "uri", value: `${ERA}inCountry` },
        node: {
          type: "uri",
          value: "http://publications.europa.eu/resource/authority/country/SWE",
        },
        nodeLabel: { type: "literal", value: "Sweden", "xml:lang": "en" },
      },
      {
        p: { type: "uri", value: "http://www.w3.org/2000/01/rdf-schema#label" },
        node: { type: "literal", value: "Arlanda", "xml:lang": "sv" },
      },
    ]),
    10,
  );

  assert.equal(out.truncated, false);
  // Sorted by predicate IRI.
  assert.deepEqual(
    out.triples.map((t) => t.predicate.uri),
    [
      `${ERA}inCountry`,
      `${ERA}lengthOfSectionOfLine`,
      "http://www.w3.org/2000/01/rdf-schema#label",
    ],
  );
  assert.deepEqual(out.triples[0].node, {
    type: "uri",
    value: "http://publications.europa.eu/resource/authority/country/SWE",
    label: "Sweden",
  });
  assert.equal(out.triples[1].predicate.label, "Length of section of line");
  assert.equal(out.triples[1].node.datatype, "http://www.w3.org/2001/XMLSchema#double");
  assert.equal(out.triples[2].node.lang, "sv");
  assert.equal(out.triples[2].predicate.label, undefined);
});

test("flags truncation when the endpoint returned more than the limit", () => {
  const bindings = Array.from({ length: 3 }, (_, i) => ({
    p: { type: "uri" as const, value: `${ERA}hasPart` },
    node: { type: "uri" as const, value: `${ERA}track/${i}` },
  }));
  const out = mapDescribe(`${ERA}sol/1`, "out", results(bindings), 2);
  assert.equal(out.truncated, true);
  assert.equal(out.triples.length, 2);
});
