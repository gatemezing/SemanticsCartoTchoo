import assert from "node:assert/strict";
import { test } from "node:test";
import { compactIri } from "./prefixes";

test("longest namespace wins", () => {
  assert.equal(
    compactIri("http://data.europa.eu/949/concepts/sol-natures/10"),
    "erac:sol-natures/10",
  );
  assert.equal(compactIri("http://data.europa.eu/949/opStart"), "era:opStart");
});

test("unknown namespaces and bare namespaces are left as-is", () => {
  assert.equal(compactIri("https://example.org/x"), "https://example.org/x");
  assert.equal(compactIri("http://data.europa.eu/949/"), "http://data.europa.eu/949/");
});
