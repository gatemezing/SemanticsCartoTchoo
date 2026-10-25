# Carto RINF

Carto RINF is an interactive map of European railway infrastructure, inspired by [carto.tchoo.net](https://carto.tchoo.net/)'s map-first, click-for-detail style but built on a different foundation: instead of real-time train positions, it renders the static infrastructure register itself, sourced live from the [RINF/ERA Knowledge Graph](https://rinf.data.era.europa.eu/) (the EU Agency for Railways' Register of Infrastructure, published as RDF and queried live via SPARQL — nothing is scraped or pre-baked). Every field pulled from RINF is explicitly tagged as a real value, "not applicable," or "not available in RINF" rather than silently left blank, and every entity links back to its own RINF record.

The map covers any country present in the register — pick one from the selector and it loads that country's operational points (stations, junctions, borders), sections of line, and tunnels, color-coded by type with a detail panel, text search, and shareable URLs that encode the current viewport and selected station. Where a station's RINF `primaryLocationCode` matches a Wikidata railway-station entry, its accessibility data (wheelchair accessibility, Wi-Fi, platform count) is shown too — only when Wikidata actually has it, always visually separated from the RINF-sourced fields, and always linked back to the source Wikidata item so its provenance is never ambiguous.

The stack is a Node.js/Fastify backend (SPARQL querying, response caching, RDF-to-JSON mapping) and a React/MapLibre GL frontend, organized as an npm workspace (`backend/`, `frontend/`, `packages/shared-types/`). To run it locally: `npm install`, then `npm run dev:backend` and `npm run dev:frontend` in separate terminals, and open the printed frontend URL. See [DEPLOYMENT.md](DEPLOYMENT.md) for running it with Docker or publishing the frontend to GitHub Pages.

## Features

- **Map** of operational points (coloured by type), sections of line, tunnels and primary locations for any of the 28 countries in RINF, with search by name or uopid.
- **Describe**: click any point, section of line, tunnel or primary location to browse every RDF triple RINF holds for it, outgoing or incoming, and follow links (to tracks, SKOS concepts, linear positioning systems and so on), all read live over SPARQL.
- **Datasets**: the latest dataset each infrastructure manager published to RINF (ERA's dataset explorer), filtered to the current country.
- **Layers**: switch layers on and off, and add the OpenRailwayMap overlay.
- **Export** what's loaded for the current country as CSV (operational points, sections of line, tunnels) or as one GeoJSON file.
- **Shareable links**: the URL holds the country, viewport and selection (`/{country}/{lat},{lon},{zoom}/{uopid}`, or `?sel=<IRI>` for other entities), plus hidden layers (`?hide=`) and the overlay (`?orm=1`). Back and Forward move between selections.

See [docs/ROADMAP.md](docs/ROADMAP.md) for how this compares with [RINF Atlas](https://github.com/Matdata-eu/rinf-atlas) and what isn't implemented yet.

## Tests

`npm test` runs the backend and frontend unit tests with Node's built-in test runner (via `tsx`, with no extra dependencies).

## Licence

Code: [MIT](LICENSE). The data, map tiles and libraries keep their own terms. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) lists each one (RINF terms of use, OpenStreetMap ODbL, OpenRailwayMap CC-BY-SA 2.0, Wikidata CC0, and the npm packages with their licences). Each frontend build also ships the full licence texts of the bundled packages as `THIRD_PARTY_LICENSES.txt`.
