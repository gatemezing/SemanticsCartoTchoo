import { test as base, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

export const SECTION_IRI = "http://data.europa.eu/949/sectionOfLine/4d4082fe2b";
export const LINE_IRI = "http://data.europa.eu/949/lrs/26ab78ce5c";

/** A point on the section's real alignment (its middle vertex), for
 *  centring the map on it. */
export function sectionMidpoint(): { lon: number; lat: number } {
  const sections = JSON.parse(fixture("sections-of-line.json")).data.features as {
    properties: { rinfUri: string };
    geometry: { coordinates: number[][] };
  }[];
  const coords = sections.find((f) => f.properties.rinfUri === SECTION_IRI)!.geometry.coordinates;
  const [lon, lat] = coords[Math.floor(coords.length / 2)];
  return { lon, lat };
}

// 1×1 transparent PNG for the raster basemap and overlay tiles.
const EMPTY_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const json = (body: string, status = 200) => ({ status, contentType: "application/json", body });
const notFound = (message: string) => json(JSON.stringify({ status: "error", message }), 404);
const EMPTY_COLLECTION = JSON.stringify({ status: "ok", data: { type: "FeatureCollection", features: [] } });

/** Replays recorded API responses; nothing leaves the machine. Routes run
 *  in reverse registration order, so the catch-all goes first. */
async function mockNetwork(page: Page): Promise<void> {
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
  await page.route(/tile\.openstreetmap\.org|tiles\.openrailwaymap\.org/, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: EMPTY_TILE }),
  );
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams;
    const path = url.pathname;
    if (path === "/api/countries") return route.fulfill(json(fixture("countries.json")));
    if (path === "/api/operational-points") return route.fulfill(json(fixture("operational-points.json")));
    if (path.startsWith("/api/operational-points/")) return route.fulfill(notFound("not in fixtures"));
    if (path === "/api/sections-of-line") return route.fulfill(json(fixture("sections-of-line.json")));
    if (path === "/api/sections-of-line/detail") {
      return q.get("iri") === SECTION_IRI
        ? route.fulfill(json(fixture("section-detail.json")))
        : route.fulfill(notFound("not in fixtures"));
    }
    if (path === "/api/tunnels") return route.fulfill(json(fixture("tunnels.json")));
    if (path === "/api/primary-locations") return route.fulfill(json(fixture("primary-locations.json")));
    if (path === "/api/section-parameters") {
      const param = q.get("param");
      return param === "maxSpeed" || param === "electrification"
        ? route.fulfill(json(fixture(`section-parameters-${param}.json`)))
        : route.fulfill(notFound("not in fixtures"));
    }
    if (path === "/api/lines") return route.fulfill(json(fixture("lines.json")));
    if (path === "/api/line-profile") return route.fulfill(json(fixture("line-profile.json")));
    if (path === "/api/describe") {
      return route.fulfill(json(fixture(q.get("direction") === "in" ? "describe-in.json" : "describe-out.json")));
    }
    if (path === "/api/describe.ttl") {
      return route.fulfill({
        status: 200,
        contentType: "text/turtle; charset=utf-8",
        headers: { "content-disposition": 'attachment; filename="4d4082fe2b.ttl"' },
        body: `<${SECTION_IRI}> a <http://data.europa.eu/949/SectionOfLine> .\n`,
      });
    }
    if (path === "/api/datasets") return route.fulfill(json(fixture("datasets.json")));
    if (path === "/api/infrastructure/signals") return route.fulfill(json(fixture("signals.json")));
    if (path.startsWith("/api/infrastructure/")) return route.fulfill(json(EMPTY_COLLECTION));
    return route.fulfill(notFound(`no fixture for ${path}`));
  });
}

/** `page` with the network replayed, and a check that the page logged no
 *  errors (a broken worker or a CSP violation shows up there first). */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error" && !/favicon|ERR_FAILED|net::/.test(m.text())) errors.push(m.text());
    });
    await use(errors);
  },
  page: async ({ page }, use) => {
    await mockNetwork(page);
    await use(page);
  },
});

test.afterEach(({ consoleErrors }) => {
  expect(consoleErrors, "console errors").toEqual([]);
});

export { expect };
