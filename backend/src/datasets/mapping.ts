import type { RinfDataset } from "@carto-rinf/shared-types";

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Copies an explicit allow-list of fields only. The upstream entries also
 *  carry `contact_info` (named submitters and their e-mail addresses) and
 *  internal S3 URLs; neither is needed to say what was published when, so
 *  neither ever leaves this function. */
export function mapDatasets(raw: unknown): RinfDataset[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): RinfDataset => {
      const e = asObject(entry);
      const account = asObject(e.account);
      const country = asObject(account.country);
      return {
        id: asString(e.id),
        fileName: asString(e.fileName),
        type: asString(e.type),
        status: asString(e.status),
        sizeBytes: typeof e.size === "number" ? e.size : null,
        publishedAt:
          typeof e.datePublished === "number"
            ? new Date(e.datePublished).toISOString()
            : null,
        imCode: asString(account.code),
        imName: asString(account.name),
        countryCode: asString(country.code),
        countryName: asString(country.name),
      };
    })
    .filter((d) => d.id !== "")
    .sort(
      (a, b) =>
        a.countryName.localeCompare(b.countryName) ||
        a.imName.localeCompare(b.imName),
    );
}
