import assert from "node:assert/strict";
import { test } from "node:test";
import { chainSections, type ChainSection } from "./chain.js";

const s = (id: string, a: string, b: string, km: number | null = 1): ChainSection => ({
  rinfUri: id, startUopid: a, endUopid: b, lengthKm: km,
});
const order = (run: { section: ChainSection; reversed: boolean }[]) =>
  run.map((x) => `${x.section.rinfUri}${x.reversed ? "'" : ""}`).join(" ");

test("orders a shuffled, mixed-direction line end to end", () => {
  // A - B - C - D, given out of order and with the middle one reversed.
  const runs = chainSections([s("bc", "C", "B", 2), s("cd", "C", "D", 3), s("ab", "A", "B", 1)]);
  assert.equal(runs.length, 1);
  assert.match(order(runs[0]), /^(ab|cd)'? bc'? (cd|ab)'?$/, "middle section in the middle");
  // Starts at a terminus and walks through every section once.
  const uopids = runs[0].map((x) => (x.reversed ? [x.section.endUopid, x.section.startUopid] : [x.section.startUopid, x.section.endUopid]));
  for (let i = 1; i < uopids.length; i++) assert.equal(uopids[i][0], uopids[i - 1][1], "consecutive segments share an OP");
  assert.ok(["A", "D"].includes(uopids[0][0]));
  assert.deepEqual(runs[0].map((x) => [x.startKm, x.endKm]).at(-1)?.[1], 6);
});

test("a branch becomes its own shorter run; nothing is dropped", () => {
  // Main A-B-C-D (10 km) with a 1 km spur B-X.
  const runs = chainSections([s("ab", "A", "B", 3), s("bc", "B", "C", 3), s("cd", "C", "D", 4), s("bx", "B", "X", 1)]);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].at(-1)?.endKm, 10);
  assert.equal(order(runs[1]).replace("'", ""), "bx");
  assert.equal(runs.flat().length, 4);
});

test("disconnected groups give separate runs, longest first", () => {
  const runs = chainSections([s("ab", "A", "B", 1), s("xy", "X", "Y", 5), s("yz", "Y", "Z", 5)]);
  assert.deepEqual(runs.map((r) => r.at(-1)?.endKm), [10, 1]);
});

test("unknown lengths use the median and are flagged", () => {
  const runs = chainSections([s("ab", "A", "B", 2), s("bc", "B", "C", null), s("cd", "C", "D", 4)]);
  const bc = runs[0].find((x) => x.section.rinfUri === "bc")!;
  assert.equal(bc.lengthKnown, false);
  assert.equal(bc.endKm - bc.startKm, 3);
});

test("loops and duplicates terminate and keep every section once", () => {
  const runs = chainSections([
    s("ab", "A", "B"), s("bc", "B", "C"), s("ca", "C", "A"), s("ab", "A", "B"), s("aa", "A", "A"),
  ]);
  assert.deepEqual(runs.flat().map((x) => x.section.rinfUri).sort(), ["aa", "ab", "bc", "ca"]);
});

test("a 1000-section line chains in linear time without recursion limits", () => {
  const line = Array.from({ length: 1000 }, (_, i) => s(`s${i}`, `P${i}`, `P${i + 1}`, 1));
  const started = Date.now();
  const runs = chainSections(line.reverse());
  assert.equal(runs.length, 1);
  assert.equal(runs[0].length, 1000);
  assert.ok(Date.now() - started < 1000);
});
