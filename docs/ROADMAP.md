# Roadmap: gap analysis against RINF Atlas

[RINF Atlas](https://github.com/Matdata-eu/rinf-atlas) (Matdata, MIT) and
Carto RINF are both maps of ERA's RINF register, but they are built on
opposite foundations:

| | RINF Atlas | Carto RINF |
|---|---|---|
| Data access | A worker mirrors every RINF named graph (about 40 M triples for PROD) into Oxigraph, then indexes it into PostGIS. Only "describe" goes live to ERA. | Every request goes **live** to ERA's SPARQL endpoint, behind a 6-hour cache. Nothing is mirrored. |
| Stack | Python worker, FastAPI, PostGIS, nginx, TypeScript/MapLibre | Node/Fastify, React/MapLibre |
| Disk and RAM | About 21 GB of disk for PROD and UAT, 4 GB RAM | Negligible |
| Scope | Every `era:InfrastructureElement` subclass, PROD and UAT | Operational points, sections of line (with running-track parameters), tunnels, primary locations, level crossings, bridges, signals, switches; PROD |

So features that depend on a local index (faceted search over every class,
vector tiles, Europe-wide joins) don't port directly. Features that are live
in RINF Atlas too, or that work on one country's data in the browser, do.

## Implemented here (inspired by RINF Atlas)

| Feature | Notes |
|---|---|
| **Describe view**: outgoing and incoming triples of any IRI, with link-following | `GET /api/describe?iri=&direction=out\|in`. The row cap is applied in an inner subquery, so IRIs with a huge in-degree (countries, SKOS concepts) stay fast. The IRI is validated against SPARQL's IRIREF rules before it is interpolated. |
| **Sections of line are clickable** | Open on the Describe view. Click handling uses an invisible, wider hit layer. |
| **Tunnels and primary locations** open in the Describe view | "Explore in RINF graph" in their popups |
| **Datasets dialog** | `GET /api/datasets` proxies ERA's dataset explorer API and keeps only an allow-list of non-personal fields (the upstream response includes submitter names and e-mail addresses). |
| **Layer toggles and OpenRailwayMap overlay** | Stored in the URL (`?hide=`, `?orm=1`) |
| **Export** | CSV per layer and one combined GeoJSON file, built in the browser from what's loaded. The three field states (value / not applicable / not available) stay distinct. |
| **Shareable state and Back/Forward** | `?sel=<IRI>` for non-operational-point selections. Back and Forward now restore the selection, which they didn't before. |
| **About dialog, licence and attribution** | See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) |
| **Unit tests** | `npm test`: query builders (including injection guards), mappers, WKT, URL routing, CSV |

## Implemented in the second round

| Feature | Notes |
|---|---|
| **More infrastructure layers**: level crossings, bridges, signals, switches | `GET /api/infrastructure/:kind`. Opt-in (`?show=`). RINF only has these for a few providers (Austria, Norway, Greece, Lithuania, surveyed 2026-10), so an empty layer is a normal answer and the toolbar says "none in RINF for this country". Scoped by the country's infrastructure managers' named graphs, not `era:inCountry`, which is missing on about half of them. Geometry varies by provider (points, lines, Austrian polygon footprints, collections), so a general WKT parser feeds a marker at each feature's representative point, plus the real shape when zoomed in. Classes are told apart by marker **shape**, since the operational-point palette already uses all eight hues. Platforms and sidings are left out: they have no geometry of their own and would sit exactly on their station. |
| **Typed section-of-line detail** | `GET /api/sections-of-line/detail`. A Properties tab next to Describe: length, nature, national line, infrastructure manager, validity, running-track count, and the four track parameters below. Every field uses the three-state `FieldValue`. |
| **Colour by a track parameter**: maximum speed, electrification, gauge, ETCS level | `GET /api/section-parameters`. Rolled up per section from its running tracks, one parameter per request (8–17 s cold for Germany or France, cached 6 h; all four at once took 77 s). Electrification distinguishes "not electrified" (contact-line type `40`) from "no data" (no contact-line system at all), never treating one as the other. Colours come from the dataviz skill's validator, run against the map surface in both themes. Speed uses a five-step one-hue ordinal ramp (six steps failed the checks). Categories use only three hues, the most that validates when any two lines can be neighbours, and the rest fold into "Other / mixed". Every coloured section has a legend entry with counts and a hover value. |
| **Line profile** | `GET /api/lines`, `GET /api/line-profile`. A national line's sections are chained through their endpoint uopids (two-sweep longest path, linear for France's 707-section line 830000). Branches and disconnected parts become separate runs, shown with a visible break. The strip chart shares one km axis: speed bars plus electrification, gauge and ETCS bands, station names thinned to avoid collisions, sections without a length hatched at 45°. It has a hover crosshair synced with the map, a table view and CSV download, and is shareable as `?lp=`. |
| **Turtle export** | `GET /api/describe.ttl`, a `CONSTRUCT` of the described resource's outgoing triples, linked from the Describe view. |
| **Dark theme and phone layout** | Colour tokens in `frontend/src/theme/theme.css` (OS preference, or an explicit choice that wins both ways). The OSM basemap is dimmed for dark, and data colours have their own validated dark steps. Below 640 px, details open as a bottom sheet and all tools sit behind one button. |
| **End-to-end tests** | Playwright on the production build (`vite preview`), desktop and phone. API and tiles are replayed from fixtures recorded live, so the tests are deterministic and offline. The render test was checked to fail without the MapLibre-worker fix. Runs in CI. |

### Data issues found and fixed on the way

Building these surfaced problems in how the existing layers read RINF.
Each was measured live (2026-10) and is covered by a regression test:

- **Open-ended validity was treated as expired.** Switzerland showed 2 of its 3,310 operational points and none of its 1,875 sections, Spain nothing, Norway 11 points and no sections. `validNow()` now treats a window with no end as still running.
- **Unversioned records were dropped**: all 2,520 Spanish sections, and 656 French "technical change" points. A subject with no `era:validity` at all now counts as current.
- **Some validity dates were unreadable**: three Austrian managers write `time:inXSDDateTimeStamp` instead of `time:inXSDDate`, hiding 93 points, 83 sections and 128 signals.
- **Greece was empty**: its uopids start with `GR`, while the registry (and ERA's dataset explorer) use `EL`. A `uopidPrefix` override fixes this.
- **Greece showed every point twice**: its provider graph labels the EU country concept "GRC"@en next to ERA's "Greece". Labels are now sampled, preferring ERA's vocabulary graphs.
- **Norway's sections had no geometry**: they carry it directly on the section rather than on `era:netReference`. Both are now read, net reference first, and an unparseable record no longer fails a whole country.
- **The primary-locations layer timed out for every country** at the endpoint's 120 s limit, even Luxembourg. It's now one correlated aggregate, taking about 8 s for France or Germany.
- **Operational points took about 70 s for any country**, because an uncorrelated `era:inCountry` subquery scanned 800k+ subjects. Scoping it brought this to about 12 s, and point detail lookups from 12 s to 0.1 s.
- **"Approximate" geometry was a blanket claim**: every section was drawn dashed, but many providers (Luxembourg, for instance) give real alignments. Only two-vertex straight lines are now marked approximate.
- **Primary locations were missing for four countries** (measured 2026-11). The query kept only primary locations with geometry of their own. None of Switzerland's 3,310, Hungary's 1,808 or Sweden's 1,098 have one, and only 1 of Spain's 2,276 does. They're now placed at their operational point's position, and the popup says so. This also brings 670 Hungarian Wikidata matches onto the map.
- **Tunnels were missing for six countries** (measured 2026-11). The query scoped tunnels by `era:inCountry`, which 5,700+ of them lack: all of Spain's 3,152, Sweden's 560, Ireland's 549, Austria's 458 and Switzerland's 251. Tunnels are now scoped by provider graph, like the other infrastructure layers. Spain now shows 1,835 tunnels. Austria gives tunnels no geometry, only portals, so 219 are drawn portal to portal. Switzerland's tunnels and graph 3915's 649 have no position at all and stay off the map.
- **Wikidata matched 12% of primary locations.** The query required the exact class "railway station" and only the PLC. It now matches on the PLC with any station type, on Wikidata's ERA ID (P11631, a uopid), and on UIC station codes (P722) where the code is the country prefix plus the 5-digit station number, accepted only within 1 km of RINF's position. That gives Switzerland 1,846 matches instead of 3, Czechia 2,832 instead of 1, and Hungary 1,525 instead of 670. The popup says which key matched. Tunnels and bridges are matched to Wikidata railway tunnels and bridges by position (300 m and 150 m), with lengths that must agree within a factor of 2 where both are known.
- **One Wikidata failure stripped enrichment for 6 hours.** A failed call returned an empty result that was cached with the RINF layer (France showed 0 matches instead of 1,653). RINF layers and Wikidata are now cached separately and joined per request, and a failed Wikidata call is retried after 5 minutes.

## Still not implemented

- **UAT environment switch** (deliberately left out of this round). The SPARQL endpoint is already configurable (`RINF_SPARQL_ENDPOINT`); a switch needs a per-request environment parameter and per-environment cache keys.

## Out of scope for this architecture

These depend on a local index of the whole register and would mean adopting
RINF Atlas's mirror-and-index design rather than adding a feature:

- **Faceted search driven by SHACL shapes** across every class
  (`shapes/*.ttl` with `atlas:facet` annotations)
- **Data-quality validation** against ERA's published SHACL shapes per
  dataset, and rings around features with issues
- **Vehicle compatibility check** (rules in SHACL, compiled to SQL over
  indexed facets)
- **OGC API – Features and vector tiles** for QGIS and ArcGIS
- **Route-based line profiles** (Dijkstra over every section in an
  environment)

If those become requirements, the better path is probably to run RINF Atlas
itself, or to use its HTTP API as a backend, rather than rebuild its index.
