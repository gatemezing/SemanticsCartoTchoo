import type { RinfDataset } from "@carto-rinf/shared-types";
import { datasetCache } from "../cache/ttlCache.js";
import { DATASETS_CACHE_TTL_MS } from "../config.js";
import { fetchPublishedDatasets } from "./client.js";
import { mapDatasets } from "./mapping.js";

/** The published-dataset list, shared by GET /api/datasets and by
 *  anything that needs to know which infrastructure managers (and so which
 *  named graphs) belong to a country. */
export function loadDatasets(): Promise<RinfDataset[]> {
  return datasetCache.getOrLoad(
    "datasets",
    async () => mapDatasets(await fetchPublishedDatasets()),
    DATASETS_CACHE_TTL_MS,
  );
}
