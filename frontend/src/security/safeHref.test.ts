import assert from "node:assert/strict";
import { test } from "node:test";
import { safeHref } from "./safeHref";

test("allows absolute http(s) IRIs unchanged", () => {
  for (const iri of [
    "http://data.europa.eu/949/sectionOfLine/a10bfd42c5",
    "https://www.wikidata.org/entity/Q42",
  ]) {
    assert.equal(safeHref(iri), iri);
  }
});

test("blocks script-capable and non-web schemes, however they're written", () => {
  for (const bad of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "urn:uuid:1234",
    "//evil.example/x",
    "/relative",
    "",
    null,
    undefined,
  ]) {
    assert.equal(safeHref(bad), undefined, String(bad));
  }
});
