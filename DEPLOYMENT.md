# Deployment

## Docker (recommended — runs the full app, backend included)

```
docker compose up --build
```

Open http://localhost:8080. The frontend container (nginx, serving the Vite
build) proxies `/api/*` to the backend container, so no extra configuration
is needed. This image pair can be deployed to any host that runs Docker
(a VPS, Fly.io, Railway, Render, etc.) — `docker-compose.yml` is a working
reference for that, not just local dev.

Both containers run as non-root users with a read-only filesystem and no
Linux capabilities. Only the frontend publishes a port; the backend is
reachable only through nginx.

### Put HTTPS in front

The stack serves plain HTTP on port 8080 and expects a TLS-terminating
reverse proxy in front (Caddy, Traefik, a cloud load balancer, etc.).
Configure that proxy to:

- serve HTTPS only, redirecting HTTP;
- send `Strict-Transport-Security: max-age=31536000; includeSubDomains`;
- forward `X-Forwarded-For`, so per-client rate limiting keeps working.

nginx already sets the page's other security headers (Content-Security-Policy,
X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy).
See `frontend/nginx.conf`.

### Backend settings

All are optional environment variables on the backend service.

| Variable | Default | Purpose |
|---|---|---|
| `TRUST_PROXY` | unset (`true` in `docker-compose.yml`) | Take the client IP from `X-Forwarded-For`. Use `true` only when clients can't reach the backend directly, or give a comma-separated list of proxy IPs/CIDRs. |
| `CORS_ORIGINS` | unset, so no CORS | Comma-separated origins allowed to call the API cross-origin (see GitHub Pages below). Same-origin setups don't need it. |
| `RATE_LIMIT_PER_MINUTE` | `300` | Requests per client per minute across the API |
| `LOOKUP_RATE_LIMIT_PER_MINUTE` | `60` | Tighter budget for `/api/describe` and `/api/operational-points/:uopid`, where every cache miss is a live upstream query |
| `SPARQL_LOOKUP_MAX_CONCURRENT` / `SPARQL_LOOKUP_MAX_QUEUED` | `4` / `50` | Upstream concurrency and wait queue for those lookups. Beyond the queue, the API answers 503 instead of passing the load on to ERA's shared endpoint. |
| `RINF_SPARQL_ENDPOINT`, `RINF_DATASETS_API` | ERA production | Upstream endpoints |

## GitHub Pages (frontend only)

GitHub Pages serves static files only — it cannot run the Node/Fastify
backend. `.github/workflows/deploy-pages.yml` builds and publishes the
frontend there, but for the deployed page to actually load data, a backend
needs to be reachable somewhere first (e.g. the Docker image above, run on
any host you control).

Once you have a backend URL:

1. Repo Settings → Secrets and variables → Actions → **Variables** → add
   `VITE_API_BASE_URL` = your backend's URL (e.g. `https://api.example.com`).
   On the backend, set `CORS_ORIGINS` to the Pages origin (e.g.
   `CORS_ORIGINS=https://<user>.github.io`). The backend sends no CORS
   headers by default, so cross-origin calls fail until this is set.
2. Repo Settings → **Pages** → Build and deployment → Source: **GitHub
   Actions** (one-time, if not already set).
3. Push to `main` (touching `frontend/` or `packages/shared-types/`) or run
   the "Deploy frontend to GitHub Pages" workflow manually from the Actions
   tab.

Without step 1, the deployed page defaults to relative `/api/...` calls,
which have no same-origin backend on Pages and will fail.

GitHub Pages can't set response headers, so a Pages deployment doesn't get
the Content-Security-Policy and other page headers from `frontend/nginx.conf`.
Prefer the Docker deployment for production. A backend exposed directly
(without the nginx container in front) still sends its own baseline headers
on API responses, but it needs its own TLS proxy, and `TRUST_PROXY` must be
left unset unless that proxy is the only way in.

## Privacy

If you run a public instance, publish a privacy notice. The app has no
accounts and sets no cookies. It keeps two display preferences in the
browser's local storage (whether the legend is collapsed, and the chosen
colour theme), which never leave the device. It does process personal data:

- **Server logs:** nginx access logs and the backend's request logs record
  client IP addresses and requested URLs (which include selected entities).
- **Third-party map tiles:** the browser loads basemap tiles from
  OpenStreetMap's tile servers, and OpenRailwayMap's when that overlay is on.
  Those operators receive the visitor's IP address. With the Docker
  deployment, only the site origin is sent as the referrer (nginx's
  Referrer-Policy).
- **Upstream queries:** the backend, not the browser, queries ERA's RINF
  endpoints and Wikidata, so visitors' IP addresses are not sent to them.
