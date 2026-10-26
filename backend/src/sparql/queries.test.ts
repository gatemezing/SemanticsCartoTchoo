import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestError } from "../errors.js";
import {
  buildDescribeQuery,
  buildOperationalPointDetailQuery,
  buildOperationalPointsQuery,
  buildPrimaryLocationsQuery,
  buildSectionsOfLineQuery,
} from "./queries.js";

const SOL = "http://data.europa.eu/949/sectionOfLine/a10bfd42c5";

test("describe: outgoing puts the IRI in subject position", () => {
  const q = buildDescribeQuery(SOL, "out");
  assert.match(q, new RegExp(`<${SOL}> \\?p \\?node`));
});

test("describe: incoming puts the IRI in object position", () => {
  const q = buildDescribeQuery(SOL, "in");
  assert.match(q, new RegExp(`\\?node \\?p <${SOL}>`));
});

test("describe: caps rows in the inner subquery, one past the limit", () => {
  assert.match(buildDescribeQuery(SOL, "out", 50), /LIMIT 51 \}/);
});

test("describe: rejects IRIs that could break out of <...>", () => {
  for (const bad of [
    "http://x/> } ; DROP ALL ; <http://y",
    "http://x/a b",
    'http://x/"',
    "http://x/{",
    "urn:not-http",
    "javascript:alert(1)",
    "",
  ]) {
    assert.throws(() => buildDescribeQuery(bad, "out"), BadRequestError, bad);
  }
});

test("describe: rejects over-long IRIs", () => {
  assert.throws(() =>
    buildDescribeQuery(`http://x/${"a".repeat(2000)}`, "out"),
  );
});

test("detail: accepts the uopid shapes RINF really uses", () => {
  // Real examples / shapes from the live register (SE, LU, NO, NL, IE).
  for (const uopid of ["FR0000007913", "LUPf-K", "SEArne", "SE Ög", "NOØst", "IE+12", "DE0UVIU"]) {
    assert.doesNotThrow(() => buildOperationalPointDetailQuery(uopid), uopid);
    assert.match(buildOperationalPointDetailQuery(uopid), new RegExp(`era:uopid "${uopid.replace("+", "\\+")}"`));
  }
});

test("detail: rejects anything that could leave the string literal", () => {
  for (const bad of ['FR1" } #', "FR1\\", "FR1\nX", "FR1}", "FR1'", "", "A".repeat(21)]) {
    assert.throws(() => buildOperationalPointDetailQuery(bad), BadRequestError, JSON.stringify(bad));
  }
});

test("operational points: only accepts a two-letter country prefix", () => {
  assert.throws(() => buildOperationalPointsQuery("FRA"));
  assert.match(buildOperationalPointsQuery("FR"), /STRSTARTS\(\?uopid, "FR"\)/);
});

test("germany uses the annual-begin validity strategy", () => {
  assert.match(buildOperationalPointsQuery("DE"), /YEAR\(\?beginOp\) = YEAR\(NOW\(\)\)/);
  assert.doesNotMatch(buildOperationalPointsQuery("FR"), /YEAR\(\?beginOp\)/);
});

// Regression tests for the 2026-10 data fixes (see validNow / geometryOf).
test("validity: open-ended windows and unversioned subjects are kept", () => {
  const q = buildOperationalPointsQuery("CH");
  // Any XSD time property is read (Austrian IMs use inXSDDateTimeStamp)...
  assert.match(q, /time:hasBeginning\/\(time:inXSDDate\|time:inXSDDateTimeStamp\|time:inXSDDateTime\) \?beginRawOp/);
  // ...and the end is optional.
  assert.match(q, /OPTIONAL \{\s*\?validityOp time:hasEnd\//);
  assert.match(q, /!BOUND\(\?endOp\) \|\| \?endOp >= xsd:date\(NOW\(\)\)/);
  assert.match(q, /FILTER\(NOT EXISTS \{ \?op era:validity \?anyValidityOp \} \|\| EXISTS \{/);
});

test("geometry: read from the net reference or directly from the subject", () => {
  const q = buildSectionsOfLineQuery("NO");
  assert.match(q, /COALESCE\(SAMPLE\(\?netWkt\), SAMPLE\(\?directWkt\)\)/); // net reference preferred
  assert.match(q, /OPTIONAL \{ \?sol geo:hasGeometry\/geo:asWKT \?directWkt \. \}/);
});

test("helper subqueries are scoped, never store-wide", () => {
  // era:inCountry is on 800k+ subjects; an unscoped subquery cost ~70s.
  assert.match(buildOperationalPointsQuery("LU"), /\?op a era:OperationalPoint ; era:inCountry \?countryURIx/);
  // Detail lookups pin every subquery to the uopid (12s -> 0.1s).
  const detail = buildOperationalPointDetailQuery("LUPf-K");
  for (const p of ["era:opName", "era:opType", "era:inCountry", "era:hasPart", "era:primaryLocation/"]) {
    assert.match(detail, new RegExp(`a era:OperationalPoint ; era:uopid "LUPf-K" ; ${p}`), p);
  }
});

test("primary locations: one correlated aggregate per location", () => {
  const q = buildPrimaryLocationsQuery("DE");
  assert.match(q, /GROUP BY \?pl$/);
  assert.doesNotMatch(q, /SELECT \?\w+ \(SAMPLE\(\?\w+\) AS \?\w+\) WHERE/); // no per-subject subqueries
  assert.match(q, /YEAR\(\?beginOp\) = YEAR\(NOW\(\)\)/); // Germany keeps annual-begin
});

test("greece filters on its RINF uopid prefix GR, not its registry code EL", () => {
  assert.match(buildOperationalPointsQuery("EL"), /STRSTARTS\(\?uopid, "GR"\)/);
  assert.match(buildSectionsOfLineQuery("EL"), /STRSTARTS\(\?opStartUopid, "GR"\)/);
  assert.match(buildPrimaryLocationsQuery("EL"), /STRSTARTS\(\?opUopidX, "GR"\)/);
  assert.doesNotThrow(() => buildOperationalPointDetailQuery("GR1234"));
});
