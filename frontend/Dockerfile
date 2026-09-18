# Build from the repository root: docker build -f frontend/Dockerfile .
FROM node:22-slim AS build
WORKDIR /app

# Empty default = relative /api/... calls, proxied to the backend service
# by nginx.conf below. Override at build time for a standalone static
# deployment (e.g. GitHub Pages) pointed at a separately-hosted backend.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY packages/shared-types packages/shared-types
COPY frontend frontend
RUN npm run build --workspace=@carto-rinf/shared-types
RUN npm run build --workspace=frontend

FROM nginx:alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
