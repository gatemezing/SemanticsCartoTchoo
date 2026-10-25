import assert from "node:assert/strict";
import { test } from "node:test";
import type { OperationalPointsCollection } from "@carto-rinf/shared-types";
import { csvCell, operationalPointsCsv } from "./download";

test("csv cells are quoted only when needed", () => {
  assert.equal(csvCell("Gare du Nord"), "Gare du Nord");
  assert.equal(csvCell("Limite SNCF, EuroTunnel"), '"Limite SNCF, EuroTunnel"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(2.5), "2.5");
});

test("formula-like text is neutralised, numbers are not", () => {
  assert.equal(csvCell("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");
  assert.equal(csvCell('=HYPERLINK("http://evil.example","x")'), '"\'=HYPERLINK(""http://evil.example"",""x"")"');
  for (const lead of ["+", "-", "@", "\t", "\r"]) {
    assert.equal(csvCell(`${lead}1`).replace(/^"/, "").startsWith("'"), true, JSON.stringify(lead));
  }
  assert.equal(csvCell(-2.5), "-2.5");
  assert.equal(csvCell("Gare-du-Nord"), "Gare-du-Nord");
});

test("operational point rows keep the three field states apart", () => {
  const c: OperationalPointsCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [2.35, 48.88] },
        properties: {
          uopid: "FR0001",
          rinfUri: "http://data.europa.eu/949/operationalPoint/x",
          name: { status: "value", value: "Paris, Nord" },
          opType: { status: "not_applicable" },
          country: { status: "not_available_in_rinf" },
        },
      },
    ],
  };
  const [header, row] = operationalPointsCsv(c).split("\r\n");
  assert.equal(header.split(",")[0], "uopid");
  assert.equal(
    row,
    'FR0001,"Paris, Nord",Not applicable,Not applicable,Not available in RINF,2.35,48.88,http://data.europa.eu/949/operationalPoint/x',
  );
});
