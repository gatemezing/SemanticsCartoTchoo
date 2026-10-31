# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Carto RINF is an interactive map of European railway infrastructure built on live SPARQL queries against the [RINF/ERA Knowledge Graph](https://rinf.data.era.europa.eu/). The stack is a Node.js/Fastify backend (SPARQL querying, response caching, RDF-to-JSON mapping) and a React/MapLibre GL frontend, organized as an npm workspace with three packages: `backend/`, `frontend/`, and `packages/shared-types/`.

Key architectural principles:
- Every field from RINF is explicitly tagged as `value`, `not_applicable`, or `not_available_in_rinf` (see `FieldValue<T>` type in shared-types)
- RINF data is cached with a 6-hour TTL; Wikidata enrichment is cached for 24 hours
- SPARQL queries handle RINF's temporal versioning with two strategies: `range` (validity window contains today) and `annual-begin` (validity begins in current year) — configured per country
- The backend uses request deduplication: concurrent cache misses share a single upstream SPARQL fetch via the `inFlight` map in `backend/src/cache/ttlCache.ts`. There are two caches: `datasetCache` (country layers, Wikidata, dataset list — keys only from the fixed registry, sized so nothing is evicted early) and `lookupCache` (user-keyed: uopid detail, describe). Never put a user-derived key in `datasetCache`

## Development Commands

### Local development
```bash
# Install dependencies (run from root)
npm install

# Run backend dev server (port 3001)
npm run dev:backend

# Run frontend dev server (Vite, separate terminal)
npm run dev:frontend
```

### Building
```bash
# Build all workspaces (shared-types → backend → frontend)
npm run build

# Start production backend (requires build first)
npm start --workspace=backend
```

### Docker deployment
```bash
# Build and run full stack (backend + frontend via nginx on port 8080)
docker compose up --build
```

## Code Architecture

### Backend (`backend/src/`)

**SPARQL querying pipeline:**
1. `routes/*.ts` — Fastify route handlers (e.g., `operationalPoints.ts`)
2. `sparql/queries.ts` — SPARQL query construction with `validNow()` temporal filtering and `sampleOptional()` for handling duplicate literals
3. `sparql/client.ts` — HTTP client for RINF and Wikidata endpoints
4. `cache/ttlCache.ts` — `TtlCache` (LRU + TTL + in-flight dedup) and its two instances, `datasetCache` / `lookupCache`
5. `mapping/*.ts` — Transform SPARQL JSON bindings to typed GeoJSON/DTO objects

**Key files:**
- `config.ts` — Environment variables, SPARQL endpoints, timeout values, country authority URIs
- `countries.ts` — Registry of all 28 countries in RINF with their ISO codes, default viewports, and validity strategies
- `wkt.ts` — Parse WKT (Well-Known Text) geometry strings from RINF into GeoJSON coordinates

**Data flow:** Route handler → `datasetCache`/`lookupCache.getOrLoad()` cache check → SPARQL query builder → `runSparqlSelect()` → mapping function → GeoJSON/typed response → `ApiEnvelope<T>` wrapper

### Frontend (`frontend/src/`)

**Component structure:**
- `App.tsx` — Root component: manages country selection, viewport state, URL routing (`routing/viewportUrl.ts`), and coordinates React Query data fetching
- `components/` — UI components (CountrySelector, DetailPanel, SearchBox, Legend, etc.)
- `map/MapView.tsx` — MapLibre GL map wrapper with layer management
- `api/client.ts` — Fetch functions for backend endpoints, all returning `ApiEnvelope<T>`

**URL routing:** The app uses client-side routing with `window.history` API (no React Router). Format: `/{country}/{lat},{lon},{zoom}` or `/{country}/{lat},{lon},{zoom}/{uopid}`, plus optional query params `sel=<IRI>` (non-OP selection), `hide=<layers>`, `orm=1`. Viewport changes use `replaceState` (avoid flooding history), selection changes use `pushState`.

**Layer handling:** Core layers (operational points, sections of line) must succeed; optional layers (tunnels, primary locations) can fail gracefully with a warning banner (`OptionalLayerWarning`). Some countries' primary-locations queries exceed the RINF endpoint's server-side timeout — these are marked `retry: false` in React Query.

### Shared Types (`packages/shared-types/src/`)

TypeScript types shared between backend and frontend:
- `FieldValue<T>` — Three-state wrapper for RINF data (value, not_applicable, not_available_in_rinf)
- `RinfLink` — Dereferenceable URI with optional label (`providerConcept`/`providerLabel` flag a provider's own concept whose label was normalised to ERA's)
- `CountryInfo` — Country registry entry with `validityStrategy`
- GeoJSON feature types for operational points, sections of line, tunnels, primary locations
- `WikidataStationInfo` — Optional enrichment data (wheelchair accessibility, WiFi, platform count)
- `DescribeResult` / `RinfDataset` — Live graph neighbourhood of an IRI (`/api/describe`) and ERA's published-dataset list (`/api/datasets`, personal fields stripped)
- `InfrastructureCollection`, `SectionParameters`, `SectionOfLineDetail`, `NationalLine`, `LineProfile` — opt-in layers, per-section track-parameter rollups, typed section detail, and the chained line profile
- `ApiEnvelope<T>` — Wrapper distinguishing success/error responses

## Frontend conventions

- **Colours**: UI chrome uses CSS tokens from `frontend/src/theme/theme.css` (never raw hex in components; light and dark both defined). Data colours live only in `frontend/src/map/dataColors.ts` and were validated with the dataviz skill's validator against the map surface in both themes — re-run it before changing any. Categorical colouring on the map is capped at 3 hues (all-pairs); more fold into "Other / mixed". New map layer classes get a marker *shape* (`map/infrastructureMarkers.ts`), not a new hue.
- **MapLibre** can't read CSS variables: theme-dependent paint goes through `applyPaint()` in `map/MapView.tsx`.
- **End-to-end tests**: `frontend/e2e/` (Playwright, production build, desktop + phone). The API is replayed from `frontend/e2e/fixtures/` (recorded live from the Luxembourg data); add a fixture route in `e2e/fixtures.ts` for any new endpoint the UI calls.

## Security conventions

Established by a security review (evidence-based, 2026-10); keep them when adding routes or UI:
- **Errors:** routes catch with `replyWithError()` (`backend/src/errors.ts`): `BadRequestError` → 400, `UpstreamBusyError` → 503, upstream failures → 502, anything else → 500 with a generic message. Query builders throw `BadRequestError` on unsafe input.
- **Upstream load:** user-keyed lookups run through `lookupLimiter` (`sparql/client.ts`) and get the tighter `LOOKUP_RATE_LIMIT_PER_MINUTE` route config. `buildApp()` in `backend/src/app.ts` wires rate limiting, opt-in CORS (`CORS_ORIGINS`), `TRUST_PROXY` and API security headers; `server.ts` only listens.
- **Links:** any URI from data or the URL goes through `safeHref()` (`frontend/src/security/safeHref.ts`) before it becomes an `href` — RDF allows `javascript:` IRIs. No `innerHTML`/`dangerouslySetInnerHTML`.
- **CSV:** `csvCell()` neutralises formula-leading text cells.
- **Deployment:** nginx sets the CSP and page headers (`frontend/nginx.conf`) — a new external origin (tiles, API) must be added to its CSP. Containers run non-root, read-only. CI (`.github/workflows/ci.yml`) runs build, tests and `npm audit --omit=dev`.

## SPARQL Query Construction

RINF data varies a lot by provider. These rules were each measured live (2026-10, see docs/ROADMAP.md "Data issues found and fixed"); keep them:
- **Validity** (`validNow()`): no `era:validity` = unversioned = current; open-ended windows (no end) are current; instants may be `time:inXSDDate`, `inXSDDateTimeStamp` or `inXSDDateTime`. It's a correlated FILTER (never a GROUP BY subquery).
- **Geometry** (`geometryOf()`): `era:netReference/geo:hasGeometry` first, else `geo:hasGeometry` on the subject. Mappers reduce footprints to a point (`wktToPoint`) or accept multi-part lines (`wktToLineal`) and skip, never throw on, unusable records.
- **Country scope**: filter uopids with `uopidPrefixFor(code)` — Greece is registry code `EL` but uopid prefix `GR`. Non-OP classes are scoped by the country's provider named graphs (`graph/{IM code}`), not `era:inCountry`.
- **Performance**: helper subqueries are uncorrelated, so always scope them (`sampleOptional(..., subjectScope)`); for single-entity lookups, pin the scope to that entity or use one implicit-group aggregate (`buildSectionDetailQuery`). An unscoped `era:inCountry` subquery cost ~70 s for any country.
- **Labels**: shared concepts can carry provider-added labels (Greece labels its country "GRC"); sample labels, preferring ERA's vocabulary graphs (`graph/rinf/...`).
- **Provider-minted op types**: Croatia (`graph/0078`) publishes its own concepts under `concepts/op-types/OperationalPointTypes/<code>` with its own spellings ("Station", "Shuting yard", "Switch\r\n"), not ERA's `concepts/op-types/<code>`. `mapping/opType.ts` maps the numeric code to ERA's label (colours and legend key on ERA's lowercase labels), keeps the provider IRI, and sets `RinfLink.providerConcept`/`providerLabel`, which the detail panel shows as a note under Type. Any new op-type consumer must go through `opTypeFieldValue()`, not `linkFieldValue()`.

When modifying queries in `backend/src/sparql/queries.ts`:
- Use `validNow(subjectVar, suffix, strategy)` to filter RINF's temporal versions (see comment in queries.ts:30-86 for full rationale)
- Use `sampleOptional(subjectVar, predicate, filterLang, outVar)` when a literal might have duplicates in the same language
- Always validate user input with `assertSafeUopid()`, `assertSafeIri()` or `assertSafeCountryPrefix()`. uopids are not just `[A-Z0-9]`: real ones contain spaces, `+`, `-` and non-ASCII letters
- SPARQL timeout is 180 seconds (`SPARQL_TIMEOUT_MS`) to handle Germany's 28k operational points

## Wikidata Integration

Primary locations can be enriched with Wikidata data via `era:primaryLocationCode` matching Wikidata's `wdt:P12783`:
- Queries go to `https://query.wikidata.org/sparql` with a custom User-Agent (`WIKIDATA_USER_AGENT`)
- Results are cached for 24 hours (longer than RINF's 6 hours due to Wikidata's rate limits)
- Implementation: `backend/src/wikidata/enrichPrimaryLocations.ts` and `backend/src/wikidata/sparql.ts`
- Wikidata failures are non-blocking: the UI shows primary locations without enrichment

## Deployment

See DEPLOYMENT.md for full details. Two main options:
1. **Docker** (recommended): `docker compose up --build` runs the full stack
2. **GitHub Pages** (frontend only): Requires a separately-hosted backend and `VITE_API_BASE_URL` environment variable

## Testing

`npm test` (root) runs both workspaces' unit tests with Node's built-in test runner via `tsx` — no test framework dependency:
- Backend: `backend/src/**/*.test.ts` (excluded from the `tsc` build in `backend/tsconfig.json`)
- Frontend: `frontend/src/**/*.test.ts` — pure modules (routing, export, RDF helpers, colour scales, line-profile layout)
- End-to-end: `npm run test:e2e --workspace=frontend` — Playwright on the production build, desktop + phone, API replayed from fixtures (see Frontend conventions)

## Licensing

Code is MIT; data, tiles and dependencies are listed in `THIRD_PARTY_NOTICES.md`. The frontend build (`npm run licenses --workspace=frontend`) generates `frontend/public/THIRD_PARTY_LICENSES.txt` (gitignored) with the full licence texts of bundled packages — update `THIRD_PARTY_NOTICES.md` when adding a runtime dependency, data source or tile service.
