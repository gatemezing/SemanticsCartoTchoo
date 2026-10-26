import assert from "node:assert/strict";
import { test } from "node:test";
import { categoricalScale, categoryLabel, numericScale } from "./dataColors";

test("speed bins by the section's highest permitted speed", () => {
  const s = numericScale("light");
  assert.equal(s.colourOf({ kind: "numeric", min: 60, max: 80 }).key, "bin:0");
  assert.equal(s.colourOf({ kind: "numeric", min: 100, max: 81 }).key, "bin:1");
  assert.equal(s.colourOf({ kind: "numeric", min: 200, max: 320 }).key, "bin:4");
  assert.equal(s.colourOf(undefined).key, "__nodata__");
  assert.equal(s.entries.at(-1)?.style, "dashed");
});

test("only the top three categories get a hue; the rest fold", () => {
  const cats = ["a", "b", "c", "d"].map((value) => ({ value, label: value.toUpperCase() }));
  const s = categoricalScale(cats, "dark");
  assert.deepEqual(s.entries.map((e) => e.key), ["a", "b", "c", "__other__", "__nodata__"]);
  assert.equal(s.colourOf({ kind: "categorical", values: ["b"] }).color, "#d95926");
  assert.equal(s.colourOf({ kind: "categorical", values: ["d"] }).key, "__other__");
  assert.equal(s.colourOf({ kind: "categorical", values: ["a", "b"] }).key, "__other__");
  assert.equal(s.colourOf({ kind: "numeric", min: 1, max: 1 }).key, "__nodata__");
});

test("the same value keeps its colour whatever else is present", () => {
  const one = categoricalScale([{ value: "x" }, { value: "y" }], "light");
  assert.equal(one.colourOf({ kind: "categorical", values: ["x"] }).color, "#2a78d6");
  assert.equal(one.entries.find((e) => e.key === "__other__")?.label, "Mixed (several values)");
});

test("unlabelled codes show the code, never an invented meaning", () => {
  assert.equal(categoryLabel("http://data.europa.eu/949/concepts/etcs-levels/10", undefined), "code 10 (no label in RINF)");
  assert.equal(categoryLabel("x", "AC 25kV-50Hz"), "AC 25kV-50Hz");
});

test("parameter values read the same everywhere", async () => {
  const { parameterValueText } = await import("./dataColors");
  assert.equal(parameterValueText("maxSpeed", { kind: "numeric", min: 80, max: 120 }, {}), "80–120 km/h");
  assert.equal(parameterValueText("maxSpeed", { kind: "numeric", min: 160, max: 160 }, {}), "160 km/h");
  assert.equal(parameterValueText("gauge", { kind: "categorical", values: ["g/30"] }, { "g/30": "1435" }), "1435");
  assert.equal(parameterValueText("etcsLevel", undefined, {}), null);
});
