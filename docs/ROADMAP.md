# Roadmap: gap analysis against RINF Atlas

[RINF Atlas](https://github.com/Matdata-eu/rinf-atlas) (Matdata, MIT) and
Carto RINF are both maps of ERA's RINF register, but they are built on
opposite foundations:

| | RINF Atlas | Carto RINF |
|---|---|---|
| Data access | A worker mirrors every RINF named graph (about 40 M triples for PROD) into Oxigraph, then indexes it into PostGIS. Only "describe" goes live to ERA. | Every request goes **live** to ERA's SPARQL endpoint, behind a 6-hour cache. Nothing is mirrored. |
| Stack | Python worker, FastAPI, PostGIS, nginx, TypeScript/MapLibre | Node/Fastify, React/MapLibre |
| Disk and RAM | About 21 GB of disk for PROD and UAT, 4 GB RAM | Negligible |
| Scope | Every `era:InfrastructureElement` subclass, PROD and UAT | Operational points, sections of line, tunnels, primary locations, PROD |

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

## Not implemented yet: candidates that fit live SPARQL

In rough order of value against cost:

1. **More infrastructure classes as layers**: level crossings, bridges,
   platforms, sidings, signals. Each needs its own country-scoped query,
   with `validNow()` and a geometry strategy, because many of these have no
   geometry of their own and RINF Atlas derives it through
   `era:isPartOf`/`^era:hasPart`. Heavy for Germany.
2. **Typed section-of-line detail** (length, nature, national line, IM) as a
   Properties tab next to Describe, mirroring the operational-point DTO and
   its `FieldValue` states.
3. **"Colour by" a parameter** (maximum speed, electrification, gauge,
   ETCS level). These live on tracks, not sections, so they need a
   per-country track-parameter query rolled up per section. Feasible as an
   optional layer with the same graceful-failure handling as primary
   locations.
4. **Line profile**: lay a national line (`era:nationalLine`) out as a strip
   of track parameters along distance. Chaining sections through
   `era:opStart`/`era:opEnd` can be done in the backend from the
   sections-of-line result that's already cached.
5. **UAT environment switch**: the SPARQL endpoint is already configurable
   (`RINF_SPARQL_ENDPOINT`). This needs a per-request environment parameter
   and per-environment cache keys.
6. **Turtle export of a described resource** (`CONSTRUCT` on the same
   pattern as describe)
7. **Dark theme and phone bottom sheet**: the UI uses inline styles, so the
   first step is moving colours to CSS custom properties.
8. **End-to-end tests** (Playwright at desktop and phone sizes, as RINF
   Atlas does)

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
