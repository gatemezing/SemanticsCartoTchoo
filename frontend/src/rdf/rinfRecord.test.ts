import assert from "node:assert/strict";
import { test } from "node:test";
import { rinfRecordUrl } from "./rinfRecord";

test("a RINF IRI opens on ERA's Describe page, URL-encoded in the fragment", () => {
  assert.equal(
    rinfRecordUrl("http://data.europa.eu/949/operationalPoint/99165b390a"),
    "https://rinf.data.era.europa.eu/describe#http%3A%2F%2Fdata.europa.eu%2F949%2FoperationalPoint%2F99165b390a",
  );
});

test("characters that would break the fragment are encoded", () => {
  assert.equal(
    rinfRecordUrl("http://data.europa.eu/949/functionalInfrastructure/tunnels/a b#c?d"),
    "https://rinf.data.era.europa.eu/describe#http%3A%2F%2Fdata.europa.eu%2F949%2FfunctionalInfrastructure%2Ftunnels%2Fa%20b%23c%3Fd",
  );
});

test("no link for a missing or non-http(s) IRI", () => {
  assert.equal(rinfRecordUrl(undefined), undefined);
  assert.equal(rinfRecordUrl(""), undefined);
  assert.equal(rinfRecordUrl("javascript:alert(1)"), undefined);
  assert.equal(rinfRecordUrl("urn:uuid:1234"), undefined);
});
