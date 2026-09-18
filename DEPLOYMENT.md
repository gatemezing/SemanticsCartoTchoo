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

## GitHub Pages (frontend only)

GitHub Pages serves static files only — it cannot run the Node/Fastify
backend. `.github/workflows/deploy-pages.yml` builds and publishes the
frontend there, but for the deployed page to actually load data, a backend
needs to be reachable somewhere first (e.g. the Docker image above, run on
any host you control).

Once you have a backend URL:

1. Repo Settings → Secrets and variables → Actions → **Variables** → add
   `VITE_API_BASE_URL` = your backend's URL (e.g. `https://api.example.com`).
   The backend already sends permissive CORS headers, so a cross-origin
   call from `*.github.io` works without further changes.
2. Repo Settings → **Pages** → Build and deployment → Source: **GitHub
   Actions** (one-time, if not already set).
3. Push to `main` (touching `frontend/` or `packages/shared-types/`) or run
   the "Deploy frontend to GitHub Pages" workflow manually from the Actions
   tab.

Without step 1, the deployed page defaults to relative `/api/...` calls,
which have no same-origin backend on Pages and will fail.
