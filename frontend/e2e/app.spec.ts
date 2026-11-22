import { expect, LINE_IRI, SECTION_IRI, sectionMidpoint, test } from "./fixtures";

const sel = (iri: string) => encodeURIComponent(iri);
const atSection = (zoom = 14) => {
  const { lon, lat } = sectionMidpoint();
  return `/LU/${lat.toFixed(5)},${lon.toFixed(5)},${zoom.toFixed(2)}/`;
};

test.describe("map", () => {
  test("renders RINF layers in the production build (a click hits a section)", async ({ page }) => {
    // Only works if MapLibre's worker loaded and rendered the GeoJSON:
    // a broken worker leaves just the basemap, and the click hits nothing.
    await page.goto(atSection());
    await expect(page.getByText("Operational point type")).toBeVisible();
    await page.waitForTimeout(1500);
    const box = (await page.locator("canvas").first().boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByText("Track parameters (across its running tracks)")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`sel=${sel(SECTION_IRI)}`));
  });

  test("primary locations that arrive before the map has loaded are still drawn", async ({ page }) => {
    // Basemap tiles are held, which delays MapLibre's load event. Primary
    // locations are answered after the core layers, so they arrive after
    // the map component exists but before it has loaded. In that window
    // the layer used to be seeded empty and never filled.
    const later = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    await page.route(/tile\.openstreetmap\.org/, async (route) => {
      await later(2500);
      await route.fallback();
    });
    await page.route("**/api/primary-locations**", async (route) => {
      await later(800);
      await route.fallback();
    });
    // LU11210 is 1.3 km from any operational point, so a click there can
    // only hit its ring.
    await page.goto("/LU/50.10893,6.00560,14.00/");
    await expect(page.getByText("Operational point type")).toBeVisible();
    const box = (await page.locator("canvas").first().boundingBox())!;
    await expect(async () => {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.getByText("Primary location LU11210")).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 15_000 });
  });

  test("a primary location's Wikidata link is the entity IRI, shown as such", async ({ page }) => {
    // LU11030 (Heisdorf) is 26 m from its operational point: at zoom 18
    // a click on it hits only its ring.
    await page.goto("/LU/49.67550,6.13931,18.00/");
    await expect(page.getByText("Operational point type")).toBeVisible();
    const box = (await page.locator("canvas").first().boundingBox())!;
    await expect(async () => {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.getByText("Primary location LU11030")).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 15_000 });
    const entity = page.getByRole("link", { name: "wd:Q2609517" });
    await expect(entity).toHaveAttribute("href", "http://www.wikidata.org/entity/Q2609517");
    await expect(entity).toHaveAttribute("title", "http://www.wikidata.org/entity/Q2609517");

    // "View RINF record" opens ERA's Describe page, with the IRI encoded in the fragment.
    const record = page.getByRole("link", { name: "View RINF record →" });
    const iri = await record.getAttribute("title");
    expect(iri).toMatch(/^http:\/\/data\.europa\.eu\/949\//);
    await expect(record).toHaveAttribute("href", `https://rinf.data.era.europa.eu/describe#${encodeURIComponent(iri!)}`);
    const opRecord = page.getByRole("link", { name: "View operational point's RINF record →" });
    await expect(opRecord).toHaveAttribute("href", /^https:\/\/rinf\.data\.era\.europa\.eu\/describe#http%3A%2F%2Fdata\.europa\.eu%2F949%2F/);
  });

  test("the Wi-Fi filter keeps points with free Wi-Fi, and the Europe count answers the question", async ({ page, isMobile }) => {
    test.skip(isMobile, "legend checked on desktop");
    await page.goto("/LU/49.50000,5.95000,11.00/");
    // Belval-Université is the one Luxembourg point whose Wikidata station
    // records free Wi-Fi (fixture recorded live, 2026-11-22).
    const freeRow = page.getByRole("button", { name: /^Free Wi-Fi\s*1$/ });
    await expect(freeRow).toBeVisible();
    await expect(page.getByText("Points matched to Wikidata: 71 of 99", { exact: false })).toBeVisible();
    await freeRow.click();
    await expect(freeRow).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/[?&]wifi=free/);
    await page.reload();
    await expect(page.getByRole("button", { name: /^Free Wi-Fi\s*1$/ })).toHaveAttribute("aria-pressed", "true");

    // It isn't typed "station" in RINF, so Luxembourg counts no station.
    await expect(page.getByText("Stations with free Wi-Fi: 0 in Luxembourg", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "114 in Europe ›" }).click();
    await expect(page.getByText("114 RINF stations")).toBeVisible();
    await expect(page.getByRole("cell", { name: "France" })).toBeVisible();
  });

  test("the Layers menu says why primary locations aren't visible yet", async ({ page, isMobile }) => {
    test.skip(isMobile, "toolbar menus checked on desktop");
    await page.goto("/LU/49.62000,6.10000,6.00/");
    await page.getByRole("button", { name: "Layers" }).click();
    const row = page.locator("label", { hasText: "Primary locations" });
    await expect(row).toContainText("99 · zoom in to see");
    await expect(page.locator("label", { hasText: "Tunnels" })).toContainText("22");
  });

  test("legend tells real alignments from straight-line stand-ins", async ({ page, isMobile }) => {
    test.skip(isMobile, "legend detail checked on desktop");
    await page.goto("/LU/49.62000,6.10000,10.00/");
    await expect(page.getByText("Section of line", { exact: true })).toBeVisible();
  });
});

test.describe("section of line", () => {
  test("properties, describe and Turtle export", async ({ page }) => {
    await page.goto(`${atSection(12)}?sel=${sel(SECTION_IRI)}`);
    await expect(page.getByRole("heading", { name: "Berchem Est <-> Syren" })).toBeVisible();
    await expect(page.getByText("100 km/h")).toBeVisible();
    await expect(page.getByText("AC 25kV-50Hz")).toBeVisible();
    await expect(page.getByText("Luxembourg - Berchem - Oetrange")).toBeVisible();
    const record = page.getByRole("link", { name: "View RINF record →" });
    await expect(record).toHaveAttribute("href", `https://rinf.data.era.europa.eu/describe#${encodeURIComponent(SECTION_IRI)}`);
    await expect(record).toHaveAttribute("title", SECTION_IRI);

    await page.getByRole("tab", { name: "Describe" }).click();
    await expect(page.getByText("Length of section of line", { exact: false })).toBeVisible();
    const turtle = page.getByRole("link", { name: "Download Turtle" });
    await expect(turtle).toHaveAttribute("href", `/api/describe.ttl?iri=${sel(SECTION_IRI)}`);
  });

  test("a javascript: share link opens nothing and renders no script link", async ({ page }) => {
    const dialogs: string[] = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    await page.goto(`/LU/49.62000,6.10000,10.00/?sel=${sel("javascript:alert(document.domain)")}`);
    await expect(page.getByText("Operational point type")).toBeVisible();
    await expect(page.locator("a[href^='javascript:']")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Describe" })).toHaveCount(0);
    expect(dialogs).toEqual([]);
  });
});

test.describe("colour by", () => {
  test("maximum speed, with counts, kept in the URL across a reload", async ({ page, isMobile }) => {
    await page.goto("/LU/49.62000,6.10000,10.00/");
    if (isMobile) {
      await page.getByRole("button", { name: "☰ Tools" }).click();
      await page.getByLabel("Maximum speed").check();
      await page.getByRole("button", { name: "Close tools" }).click();
    } else {
      await page.getByRole("button", { name: "Colour by" }).click();
      await page.getByLabel("Maximum speed").check();
    }
    const legend = page.getByRole("region", { name: "Sections coloured by Maximum speed" });
    await expect(legend).toBeVisible();
    await expect(legend.getByText("81–120 km/h")).toBeVisible();
    await expect(page).toHaveURL(/col=maxSpeed/);
    await page.reload();
    await expect(page.getByRole("region", { name: "Sections coloured by Maximum speed" })).toBeVisible();
  });
});

test.describe("line profile", () => {
  test("opens from a section: chart, hover, table and CSV", async ({ page, isMobile }) => {
    test.skip(isMobile, "the chart is exercised on desktop; phone checks the sheets");
    await page.goto(`${atSection(12)}?sel=${sel(SECTION_IRI)}`);
    await page.getByRole("button", { name: "Show line profile →" }).click();
    const chart = page.locator("svg[aria-label^='Profile of line']");
    await expect(chart).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`lp=${sel(LINE_IRI)}`));

    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + 60);
    await expect(page.getByRole("tooltip")).toContainText("Maximum speed");

    await page.getByRole("button", { name: "Table" }).click();
    await expect(page.locator("table tbody tr")).toHaveCount(7);

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSV" }).click();
    expect((await download).suggestedFilename()).toMatch(/^rinf-line-.*\.csv$/);
  });
});

test.describe("more infrastructure", () => {
  test("signals layer shows its count in the legend", async ({ page, isMobile }) => {
    test.skip(isMobile, "toggle covered on desktop");
    await page.goto("/LU/49.62000,6.10000,10.00/");
    await page.getByRole("button", { name: "Layers" }).click();
    await page.getByLabel("Signals").check();
    await expect(page.getByText("Signals (12)")).toBeVisible();
    await expect(page).toHaveURL(/show=signals/);
  });
});

test.describe("theme", () => {
  test("dark theme applies and survives a reload", async ({ page, isMobile }) => {
    await page.goto("/LU/49.62000,6.10000,10.00/");
    if (isMobile) {
      await page.getByRole("button", { name: "☰ Tools" }).click();
    } else {
      await page.getByRole("button", { name: "Theme" }).click();
    }
    await page.getByLabel("Dark").check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});

test.describe("phone layout", () => {
  test("details open as a bottom sheet and tools sit behind one button", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone only");
    await page.goto(`${atSection(12)}?sel=${sel(SECTION_IRI)}`);
    const panel = page.locator(".detail-panel");
    await expect(panel).toBeVisible();
    const viewport = page.viewportSize()!;
    const box = (await panel.boundingBox())!;
    expect(box.y).toBeGreaterThan(viewport.height * 0.3);
    expect(box.width).toBeGreaterThan(viewport.width * 0.95);

    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "☰ Tools" }).click();
    await expect(page.getByRole("dialog", { name: "Map tools" })).toBeVisible();
  });
});
