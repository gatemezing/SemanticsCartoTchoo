import { DATASETS_TIMEOUT_MS, RINF_DATASETS_API } from "../config.js";

export class DatasetsApiError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DatasetsApiError";
  }
}

/** Raw JSON from the dataset explorer API, untyped on purpose: it's a
 *  third-party payload whose shape is only checked field by field in
 *  ./mapping.ts, never trusted wholesale. */
export async function fetchPublishedDatasets(): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DATASETS_TIMEOUT_MS);
  try {
    const response = await fetch(RINF_DATASETS_API, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new DatasetsApiError(
        `RINF dataset explorer API returned HTTP ${response.status}`,
      );
    }
    return await response.json();
  } catch (err) {
    if (err instanceof DatasetsApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new DatasetsApiError(
        `RINF dataset explorer API timed out after ${DATASETS_TIMEOUT_MS}ms`,
        err,
      );
    }
    throw new DatasetsApiError(
      "Failed to reach the RINF dataset explorer API",
      err,
    );
  } finally {
    clearTimeout(timeout);
  }
}
