# Third-party notices

Carto RINF's own source code is released under the [MIT License](LICENSE).
That licence covers this repository's code only. It does not cover the
libraries the code depends on, the data the app displays, or the services it
calls at runtime, which keep their own terms (listed below).

## Data and services used at runtime

| Source | Used for | Terms |
|---|---|---|
| [RINF knowledge graph](https://rinf.data.era.europa.eu/), European Union Agency for Railways (ERA), SPARQL endpoint `graph.data.era.europa.eu` | All infrastructure data: operational points, sections of line, tunnels, primary locations, and the Describe view | Published under Directive (EU) 2016/797 and Regulation (EU) 2019/777. ERA's [RINF terms of use](https://www.era.europa.eu/system/files/2022-11/rinf_terms_of_use_en.pdf) apply. The infrastructure managers who submit the data remain responsible for it. This project is not affiliated with ERA. |
| ERA dataset explorer API (`rinf.data.era.europa.eu/api/v1`) | The **Datasets** dialog | Same as above. The backend forwards only non-personal fields; submitter contact details in the upstream response are never stored or forwarded. |
| [ERA vocabulary](https://data-interop.era.europa.eu/era-vocabulary/) | Class and property IRIs and labels shown in the Describe view | Published by ERA under the EUPL-1.2, as stated in its ontology repository |
| [Wikidata](https://www.wikidata.org/), via `query.wikidata.org` | Station accessibility enrichment (wheelchair access, Wi-Fi, platform count) | Data under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); query service use per the [Wikimedia user-agent policy](https://meta.wikimedia.org/wiki/User-Agent_policy) |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) raster tiles | Basemap | Map data © OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/); tiles served under the [OSMF tile usage policy](https://operations.osmfoundation.org/policies/tiles/). A busy deployment should use its own or a commercial tile server. |
| [OpenRailwayMap](https://www.openrailwaymap.org/) raster tiles (optional overlay, off by default) | Rail overlay | Tiles under [CC-BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/), data ODbL. Free only for light, public, non-commercial use ([conditions](https://wiki.openstreetmap.org/wiki/OpenRailwayMap/API)). |

The attribution these sources require is shown in the map's attribution
control and in the app's **About** dialog.

## Software shipped with the app

### Frontend (bundled into the JavaScript served to browsers)

| Package | Licence |
|---|---|
| [maplibre-gl](https://github.com/maplibre/maplibre-gl-js) | BSD-3-Clause |
| [react](https://github.com/facebook/react), react-dom | MIT |
| [@tanstack/react-query](https://github.com/TanStack/query) | MIT |

Their transitive dependencies are under MIT, ISC, BSD-2-Clause,
BSD-3-Clause and MIT OR Apache-2.0. Every frontend build writes the full
licence text of each bundled package to `THIRD_PARTY_LICENSES.txt` next
to the app (`npm run licenses --workspace=frontend`,
[script](frontend/scripts/third-party-licenses.mjs)). The **About** dialog
links to it.

### Backend (Node.js server)

| Package | Licence |
|---|---|
| [fastify](https://github.com/fastify/fastify), [@fastify/cors](https://github.com/fastify/fastify-cors), [@fastify/rate-limit](https://github.com/fastify/fastify-rate-limit) | MIT |
| [lru-cache](https://github.com/isaacs/node-lru-cache) | BlueOak-1.0.0 |

Their transitive dependencies are under MIT, ISC and BSD-3-Clause. The
backend container image ships `node_modules` unmodified, so each package's
own licence file is included there.

### Container base images (Docker deployment)

| Image | Contents and licence |
|---|---|
| `node:22-slim` | Node.js (MIT, with bundled third-party components under their own licences) on Debian (packages under their respective licences) |
| `nginxinc/nginx-unprivileged:alpine` | nginx (BSD-2-Clause), built to run as a non-root user, on Alpine Linux (packages under their respective licences) |

These images are pulled from Docker Hub unmodified. This repository does
not redistribute them.

## Development and build tools

These are used to build and test the app. None of their code ends up in
what is deployed.

| Tool | Licence |
|---|---|
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 |
| [Vite](https://github.com/vitejs/vite), @vitejs/plugin-react | MIT |
| [lightningcss](https://github.com/parcel-bundler/lightningcss) (CSS minifier, a Vite dependency) | MPL-2.0, used unmodified at build time |
| [tsx](https://github.com/privatenumber/tsx) (TypeScript runner for dev and tests) | MIT |
| [Playwright Test](https://github.com/microsoft/playwright) (end-to-end tests) | Apache-2.0 |
| @types/node, @types/react, @types/react-dom, @types/geojson | MIT |

## Acknowledgements

Several features (the live Describe view, the Datasets dialog, layer and
overlay toggles, exports and the About dialog) were inspired by
[RINF Atlas](https://github.com/Matdata-eu/rinf-atlas) (MIT). No code was
copied from it.
