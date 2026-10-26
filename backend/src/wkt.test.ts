import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWkt, wktToLineal, wktToPoint } from "./wkt.js";

test("wktToPoint keeps points and reduces footprints to their mean vertex", () => {
  assert.deepEqual(wktToPoint("POINT(2.35 48.85)"), { type: "Point", coordinates: [2.35, 48.85] });
  // Norway-style operational-point footprint: a collection of track lines.
  assert.deepEqual(
    wktToPoint("GEOMETRYCOLLECTION(LINESTRING(10 59, 12 59), LINESTRING(10 61, 12 61))"),
    { type: "Point", coordinates: [11, 60] },
  );
  assert.equal(wktToPoint("POINT EMPTY"), null);
  assert.equal(wktToPoint("not wkt"), null);
});

test("wktToLineal keeps lines and collects multi-part lines", () => {
  assert.deepEqual(wktToLineal(" LINESTRING ( 1 2 , 3   4 ) "), { type: "LineString", coordinates: [[1, 2], [3, 4]] });
  assert.equal(wktToLineal("MULTILINESTRING((1 2, 3 4), (5 6, 7 8))")?.type, "MultiLineString");
  assert.deepEqual(
    wktToLineal("GEOMETRYCOLLECTION(POINT(0 0), LINESTRING(1 2, 3 4))"),
    { type: "LineString", coordinates: [[1, 2], [3, 4]] },
  );
  assert.equal(wktToLineal("POINT(1 2)"), null);
  assert.equal(wktToLineal("LINESTRING(1 2"), null);
});

// Real RINF samples (2026-10) for the infrastructure layers.
test("parseWkt: point variants seen in RINF", () => {
  assert.deepEqual(parseWkt("POINT(6.109064 60.647214)"), { type: "Point", coordinates: [6.109064, 60.647214] });
  assert.deepEqual(parseWkt("POINT (+23.157951 55.972107)"), { type: "Point", coordinates: [23.157951, 55.972107] });
  assert.deepEqual(parseWkt("POINT Z (1 2 3)"), { type: "Point", coordinates: [1, 2] });
  assert.deepEqual(parseWkt("<http://www.opengis.net/def/crs/OGC/1.3/CRS84> POINT(1 2)"), { type: "Point", coordinates: [1, 2] });
});

test("parseWkt: polygon footprint (Austrian switches)", () => {
  const g = parseWkt("POLYGON ((16.08 47.04, 16.09 47.04, 16.09 47.05, 16.08 47.04))");
  assert.equal(g?.type, "Polygon");
  assert.equal((g as GeoJSON.Polygon).coordinates[0].length, 4);
});

test("parseWkt: collections and multis", () => {
  const gc = parseWkt("GEOMETRYCOLLECTION(POINT(11.48361 63.793588), POINT(11.483613 63.793575))");
  assert.equal(gc?.type, "GeometryCollection");
  assert.equal((gc as GeoJSON.GeometryCollection).geometries.length, 2);
  assert.deepEqual(parseWkt("MULTIPOINT ((1 2), (3 4))"), { type: "MultiPoint", coordinates: [[1, 2], [3, 4]] });
  assert.deepEqual(parseWkt("MULTIPOINT (1 2, 3 4)"), { type: "MultiPoint", coordinates: [[1, 2], [3, 4]] });
  assert.equal(parseWkt("MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)))")?.type, "MultiPolygon");
  assert.equal(parseWkt("LINESTRING(10.659121 59.918028, 10.65903 59.917988)")?.type, "LineString");
});

test("parseWkt: empty is null, garbage throws", () => {
  assert.equal(parseWkt("POINT EMPTY"), null);
  assert.deepEqual(parseWkt("GEOMETRYCOLLECTION(POINT EMPTY, POINT(1 2))"), {
    type: "GeometryCollection",
    geometries: [{ type: "Point", coordinates: [1, 2] }],
  });
  for (const bad of ["POINT(1)", "POINT(1 2", "CIRCLE(1 2)", "POINT(1 2) x", "POINT(a b)"]) {
    assert.throws(() => parseWkt(bad), /Malformed WKT/, bad);
  }
});
