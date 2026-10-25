import assert from "node:assert/strict";
import { test } from "node:test";
import { mapDatasets } from "./mapping.js";

const upstream = [
  {
    id: "e3a9",
    fileName: "RINF_NL_20261016_1153_hand1.ttl",
    url: "s3://bucket/e3a9/RINF_NL.ttl",
    contact_info: { name: "Someone", mails: ["someone@example.org"] },
    account: {
      code: "0084",
      name: "ProRail",
      country: { code: "NL", name: "Netherlands" },
    },
    type: "RDF_FULL",
    status: "PUBLISHED",
    size: 25475040,
    datePublished: 1792166710898,
  },
  {
    id: "b1",
    fileName: "x.xml",
    account: { code: "0088", name: "Infrabel", country: { code: "BE", name: "Belgium" } },
    type: "XML_FULL",
    status: "PUBLISHED_KG_OK",
  },
  { fileName: "no id — dropped" },
];

test("keeps only allow-listed, non-personal fields", () => {
  const out = mapDatasets(upstream);
  const serialized = JSON.stringify(out);
  assert.doesNotMatch(serialized, /someone|example\.org|s3:\/\//);
  assert.deepEqual(Object.keys(out[1]).sort(), [
    "countryCode",
    "countryName",
    "fileName",
    "id",
    "imCode",
    "imName",
    "publishedAt",
    "sizeBytes",
    "status",
    "type",
  ]);
});

test("sorts by country then IM, drops entries without an id", () => {
  const out = mapDatasets(upstream);
  assert.deepEqual(out.map((d) => d.imName), ["Infrabel", "ProRail"]);
});

test("converts epoch-ms publication dates and tolerates missing ones", () => {
  const [be, nl] = mapDatasets(upstream);
  assert.equal(nl.publishedAt, new Date(1792166710898).toISOString());
  assert.equal(be.publishedAt, null);
  assert.equal(be.sizeBytes, null);
});

test("a non-array payload maps to an empty list", () => {
  assert.deepEqual(mapDatasets({ error: "nope" }), []);
});
