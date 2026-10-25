import type { FastifyInstance } from "fastify";
import type { ApiEnvelope, RinfDataset } from "@carto-rinf/shared-types";
import { datasetCache } from "../cache/ttlCache.js";
import { DATASETS_CACHE_TTL_MS } from "../config.js";
import { fetchPublishedDatasets } from "../datasets/client.js";
import { mapDatasets } from "../datasets/mapping.js";
import { replyWithError } from "../errors.js";

export function registerDatasetsRoute(app: FastifyInstance): void {
  app.get("/api/datasets", async (request, reply) => {
    try {
      const data = await datasetCache.getOrLoad<RinfDataset[]>(
        "datasets",
        async () => mapDatasets(await fetchPublishedDatasets()),
        DATASETS_CACHE_TTL_MS,
      );
      const body: ApiEnvelope<RinfDataset[]> = { status: "ok", data };
      return body;
    } catch (err) {
      return replyWithError(
        request,
        reply,
        err,
        "Unexpected server error while loading the dataset list",
      );
    }
  });
}
