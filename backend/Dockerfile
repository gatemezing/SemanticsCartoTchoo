# Build from the repository root: docker build -f backend/Dockerfile .
# This is an npm-workspaces monorepo — backend depends on the sibling
# @carto-rinf/shared-types package, so the build needs the whole repo,
# not just backend/.
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY packages/shared-types packages/shared-types
COPY backend backend
RUN npm run build --workspace=@carto-rinf/shared-types
RUN npm run build --workspace=backend
RUN npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/packages/shared-types/package.json packages/shared-types/package.json
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist
COPY --from=build /app/backend/package.json backend/package.json
COPY --from=build /app/backend/dist backend/dist

EXPOSE 3001
CMD ["node", "backend/dist/server.js"]
