import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWktLineString, parseWktPoint } from "./wkt.js";

test("parses POINT as lon/lat", () => {
  assert.deepEqual(parseWktPoint("POINT(2.35 48.85)").coordinates, [2.35, 48.85]);
});

test("parses LINESTRING with extra whitespace", () => {
  assert.deepEqual(
    parseWktLineString(" LINESTRING ( 1 2 , 3   4 ) ").coordinates,
    [
      [1, 2],
      [3, 4],
    ],
  );
});

test("rejects other geometry types and bad numbers", () => {
  assert.throws(() => parseWktPoint("LINESTRING(1 2, 3 4)"));
  assert.throws(() => parseWktPoint("POINT(a b)"));
});
