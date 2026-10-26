import assert from "node:assert/strict";
import { test } from "node:test";
import { formatRoute, parseRoute } from "./viewportUrl";

const vp = { lat: 50.85, lon: 4.35, zoom: 8 };

test("older links without a query string still parse", () => {
  assert.deepEqual(parseRoute("/48.85000,2.35000,10.00/FR0001"), {
    country: null,
    viewport: { lat: 48.85, lon: 2.35, zoom: 10 },
    uopid: "FR0001",
    selectedIri: null,
    hiddenLayers: [],
    openRailwayMap: false,
    shownInfrastructure: [],
    colourBy: null,
    lineProfile: null,
  });
});

test("round-trips selection, hidden layers and overlay", () => {
  const iri = "http://data.europa.eu/949/sectionOfLine/a10bfd42c5";
  const url = formatRoute("BE", vp, null, {
    selectedIri: iri,
    hiddenLayers: ["tunnels", "operational-points"],
    openRailwayMap: true,
  });
  const [path, search] = url.split("?");
  const parsed = parseRoute(path, `?${search}`);
  assert.equal(parsed.country, "BE");
  assert.equal(parsed.selectedIri, iri);
  // Canonical layer order regardless of input order.
  assert.deepEqual(parsed.hiddenLayers, ["operational-points", "tunnels"]);
  assert.equal(parsed.openRailwayMap, true);
});

test("a uopid in the path wins over ?sel=", () => {
  assert.equal(
    formatRoute("FR", vp, "FR0001", { selectedIri: "http://x/y" }),
    "/FR/50.85000,4.35000,8.00/FR0001",
  );
  assert.equal(parseRoute("/FR/50.85,4.35,8/FR0001", "?sel=http://x/y").selectedIri, null);
});

test("?sel= only accepts http(s) IRIs", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "nope"]) {
    assert.equal(parseRoute("/FR/", `?sel=${encodeURIComponent(bad)}`).selectedIri, null, bad);
  }
});

test("uopids with spaces, + and non-ASCII letters round-trip through the path", () => {
  for (const uopid of ["SE Ög", "IE+12", "LUPf-K", "NOØst"]) {
    const url = formatRoute("SE", vp, uopid);
    assert.doesNotMatch(url, / /);
    // The browser hands pathname back percent-encoded, as formatted.
    assert.equal(parseRoute(new URL(url, "http://x").pathname).uopid, uopid);
  }
});

test("unknown layer ids in ?hide= are dropped", () => {
  assert.deepEqual(parseRoute("/FR/", "?hide=tunnels,bogus").hiddenLayers, ["tunnels"]);
});

test("round-trips infrastructure layers, colouring and line profile", () => {
  const line = "http://data.europa.eu/949/lrs/3d5c54deb2";
  const url = formatRoute("LU", vp, null, {
    shownInfrastructure: ["switches", "level-crossings"],
    colourBy: "electrification",
    lineProfile: line,
  });
  const [path, search] = url.split("?");
  const parsed = parseRoute(path, `?${search}`);
  assert.deepEqual(parsed.shownInfrastructure, ["level-crossings", "switches"]);
  assert.equal(parsed.colourBy, "electrification");
  assert.equal(parsed.lineProfile, line);
});

test("unknown colour parameters and non-http line IRIs are ignored", () => {
  const parsed = parseRoute("/LU/", "?col=voltage&lp=javascript:alert(1)&show=tunnels,signals");
  assert.equal(parsed.colourBy, null);
  assert.equal(parsed.lineProfile, null);
  assert.deepEqual(parsed.shownInfrastructure, ["signals"]);
});
