import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../app.js";
import { turtleFileName } from "./describe.js";

// All rejected before any upstream query is sent.
test("new routes validate their input with 400s", async () => {
  const app = await buildApp({ logger: false, rateLimitPerMinute: 1000 });
  const cases: [string, RegExp][] = [
    ["/api/infrastructure/tunnels?country=AT", /Unknown infrastructure kind/],
    ["/api/infrastructure/switches?country=XX", /Unknown country code/],
    ["/api/section-parameters?country=FR&param=voltage", /must be one of/],
    ["/api/section-parameters?country=FR", /must be one of/],
    ["/api/sections-of-line/detail", /Missing \?iri=/],
    [`/api/sections-of-line/detail?iri=${encodeURIComponent("javascript:x")}`, /Invalid IRI/],
    ["/api/line-profile?country=LU", /Missing \?line=/],
    [`/api/line-profile?country=LU&line=${encodeURIComponent("http://x/> }")}`, /Invalid IRI/],
    [`/api/describe.ttl?iri=${encodeURIComponent("data:text/turtle,x")}`, /Invalid IRI/],
  ];
  for (const [url, message] of cases) {
    const res = await app.inject(url);
    assert.equal(res.statusCode, 400, url);
    assert.match(res.json().message, message, url);
  }
  await app.close();
});

test("turtle download names are safe for Content-Disposition", () => {
  assert.equal(turtleFileName("http://data.europa.eu/949/sectionOfLine/4d4082fe2b"), "4d4082fe2b.ttl");
  assert.equal(turtleFileName('http://x/a"b\r\nc'), "a_b_c.ttl");
  assert.equal(turtleFileName("http://x/"), "x.ttl");
  assert.equal(turtleFileName("http://x/#"), "x.ttl");
});
