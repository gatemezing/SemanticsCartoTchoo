import assert from "node:assert/strict";
import { test } from "node:test";
import type { LineProfile, LineProfileSegment } from "@carto-rinf/shared-types";
import { layoutProfile, lineCategories, profileCsv, speedAxisMax, stationLabels } from "./layout";

const seg = (id: string, a: string, b: string, start: number, end: number, extra: Partial<LineProfileSegment> = {}): LineProfileSegment => ({
  rinfUri: `http://x/${id}`, startKm: start, endKm: end, lengthKnown: true, reversed: false,
  from: { uopid: a, name: { status: "value", value: a } },
  to: { uopid: b, name: { status: "value", value: b } },
  parameters: {}, ...extra,
});

const profile: LineProfile = {
  line: { iri: "http://x/line", label: "L" },
  runs: [
    [
      seg("ab", "A", "B", 0, 10, { parameters: { maxSpeed: { kind: "numeric", min: 100, max: 140 }, electrification: { kind: "categorical", values: ["e1"] } } }),
      seg("bc", "B", "C", 10, 30, { parameters: { electrification: { kind: "categorical", values: ["e1", "e2"] } } }),
    ],
    [seg("xy", "X", "Y", 0, 5, { lengthKnown: false })],
  ],
  categoryLabels: { e1: "AC 25kV-50Hz" },
};

test("runs are laid end to end with a gap between them", () => {
  const l = layoutProfile(profile);
  assert.equal(l.lineKm, 35);
  assert.equal(l.gaps.length, 1);
  assert.deepEqual(l.gaps[0], { x0: 30, x1: 30.7 });
  assert.deepEqual(l.segments.map((s) => [s.x0, s.x1]), [[0, 10], [10, 30], [30.7, 35.7]]);
  assert.equal(l.totalKm, 35.7);
});

test("station labels never collide and always keep run ends", () => {
  const l = layoutProfile(profile);
  // At 200 px/km every name fits (the 0.7 km run gap is 140 px).
  assert.deepEqual(stationLabels(l, 200, 72).map((s) => s.uopid), ["A", "B", "C", "X", "Y"]);
  // At 100 px/km the gap is 70 px: C (end of run 1) wins over X.
  assert.deepEqual(stationLabels(l, 100, 72).map((s) => s.uopid), ["A", "B", "C", "Y"]);
  // At 3 px/km, only ends of runs fit ≥72 px apart.
  const tight = stationLabels(l, 3, 72).map((s) => s.uopid);
  assert.ok(tight.includes("A"));
  for (const [i, s] of stationLabels(l, 3, 72).entries()) {
    const next = stationLabels(l, 3, 72)[i + 1];
    if (next) assert.ok((next.x - s.x) * 3 >= 72, `${s.uopid}->${next.uopid}`);
  }
});

test("speed axis rounds up to a multiple of 40", () => {
  assert.equal(speedAxisMax(layoutProfile(profile)), 160);
});

test("line categories rank by segments; unlabelled codes say so", () => {
  const cats = lineCategories(layoutProfile(profile), "electrification", profile.categoryLabels);
  assert.deepEqual(cats.map((c) => c.value), ["e1", "e2"]);
  assert.equal(cats[0].label, "AC 25kV-50Hz");
  assert.match(cats[1].label, /no label in RINF/);
});

test("CSV keeps empty cells for missing data and flags unknown lengths", () => {
  const rows = profileCsv(profile, layoutProfile(profile)).split("\r\n");
  assert.equal(rows.length, 4);
  assert.match(rows[1], /^1,0,10,yes,A,A,B,B,100-140,AC 25kV-50Hz,,,http:\/\/x\/ab$/);
  assert.match(rows[3], /^2,0,5,no,X,X,Y,Y,,,,,/);
});
