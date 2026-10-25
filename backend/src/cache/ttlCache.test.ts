import assert from "node:assert/strict";
import { test } from "node:test";
import { datasetCache, lookupCache, TtlCache } from "./ttlCache.js";

test("concurrent misses on one key share a single load", async () => {
  const cache = new TtlCache({ max: 10 });
  let loads = 0;
  const load = async () => {
    loads++;
    await new Promise((r) => setTimeout(r, 5));
    return "v";
  };
  const values = await Promise.all([1, 2, 3].map(() => cache.getOrLoad("k", load)));
  assert.deepEqual(values, ["v", "v", "v"]);
  assert.equal(loads, 1);
});

test("a failed load is not cached", async () => {
  const cache = new TtlCache({ max: 10 });
  await assert.rejects(cache.getOrLoad("k", async () => { throw new Error("x"); }));
  assert.equal(await cache.getOrLoad("k", async () => "ok"), "ok");
});

// Regression for the review finding: 120 unique describe keys evicted a
// country layer from the old single shared 100-entry cache.
test("flooding user-keyed lookups never evicts country data", async () => {
  await datasetCache.getOrLoad("operational-points:LU", async () => "country");
  for (let i = 0; i < 3000; i++) {
    await lookupCache.getOrLoad(`describe:out:http://attacker.example/${i}`, async () => ({ i }));
  }
  assert.equal(datasetCache.has("operational-points:LU"), true);
});

test("the dataset cache fits every country's keys", async () => {
  const { COUNTRIES } = await import("../countries.js");
  const perCountryKeys = 5; // op, sol, tunnels, primary locations, wikidata
  const cache = new TtlCache({ max: 200 });
  for (const c of COUNTRIES) {
    for (let k = 0; k < perCountryKeys; k++) await cache.getOrLoad(`${k}:${c.code}`, async () => k);
  }
  await cache.getOrLoad("datasets", async () => []);
  for (const c of COUNTRIES) assert.equal(cache.has(`0:${c.code}`), true, c.code);
});
