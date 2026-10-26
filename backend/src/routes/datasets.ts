import type { FastifyInstance } from "fastify";
import type { ApiEnvelope, RinfDataset } from "@carto-rinf/shared-types";
import { loadDatasets } from "../datasets/service.js";
import { replyWithError } from "../errors.js";

export function registerDatasetsRoute(app: FastifyInstance): void {
  app.get("/api/datasets", async (request, reply) => {
    try {
      const data = await loadDatasets();
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
