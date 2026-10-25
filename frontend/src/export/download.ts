import type {
  FieldValue,
  OperationalPointsCollection,
  RinfLink,
  SectionOfLineCollection,
  TunnelsCollection,
} from "@carto-rinf/shared-types";
import {
  NOT_APPLICABLE_LABEL,
  NOT_AVAILABLE_LABEL,
} from "../components/fieldValueText";

/** RFC 4180 quoting: a cell is quoted when it holds a comma, quote or line
 *  break, with inner quotes doubled.
 *
 *  Text cells starting with = + - @ (or a tab / carriage return) get a
 *  leading `'` so spreadsheets show them as text rather than evaluate them
 *  as formulas (OWASP "CSV injection") — names come from third-party
 *  RINF data. Numbers (e.g. negative longitudes) are never prefixed. */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: (string | number)[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** Keeps the three FieldValue states distinguishable in a flat file, using
 *  the same wording as the UI rather than collapsing both "missing" states
 *  into an empty cell. */
function fieldText<T>(field: FieldValue<T>, format: (v: T) => string): string {
  switch (field.status) {
    case "value":
      return format(field.value);
    case "not_applicable":
      return NOT_APPLICABLE_LABEL;
    case "not_available_in_rinf":
      return NOT_AVAILABLE_LABEL;
  }
}

const linkLabel = (l: RinfLink) => l.label ?? l.uri;
const linkUri = (l: RinfLink) => l.uri;

export function operationalPointsCsv(c: OperationalPointsCollection): string {
  return toCsv(
    ["uopid", "name", "type", "type_uri", "country", "longitude", "latitude", "rinf_uri"],
    c.features.map((f) => {
      const p = f.properties;
      const [lon, lat] = f.geometry.coordinates;
      return [
        p.uopid,
        fieldText(p.name, (v) => v),
        fieldText(p.opType, linkLabel),
        fieldText(p.opType, linkUri),
        fieldText(p.country, linkLabel),
        lon,
        lat,
        p.rinfUri,
      ];
    }),
  );
}

export function sectionsOfLineCsv(c: SectionOfLineCollection): string {
  return toCsv(
    ["rinf_uri", "op_start_uopid", "op_start_name", "op_end_uopid", "op_end_name"],
    c.features.map((f) => {
      const p = f.properties;
      return [
        p.rinfUri,
        p.opStartUopid,
        fieldText(p.opStartName, (v) => v),
        p.opEndUopid,
        fieldText(p.opEndName, (v) => v),
      ];
    }),
  );
}

export function tunnelsCsv(c: TunnelsCollection): string {
  return toCsv(
    ["rinf_uri", "name", "length_m"],
    c.features.map((f) => {
      const p = f.properties;
      return [
        p.rinfUri,
        fieldText(p.name, (v) => v),
        fieldText(p.lengthMetres, (v) => String(v)),
      ];
    }),
  );
}

/** One FeatureCollection with a `layer` property on every feature, so the
 *  file opens as a single layer in a desktop GIS and can still be split. */
export function combinedGeoJson(
  layers: Record<string, GeoJSON.FeatureCollection>,
): string {
  return JSON.stringify({
    type: "FeatureCollection",
    features: Object.entries(layers).flatMap(([layer, c]) =>
      c.features.map((f) => ({ ...f, properties: { layer, ...f.properties } })),
    ),
  });
}

export function downloadText(fileName: string, mime: string, text: string): void {
  // Leading BOM so Excel opens UTF-8 CSV (station names with accents)
  // correctly; harmless for every other consumer.
  const body = mime === "text/csv" ? `﻿${text}` : text;
  const url = URL.createObjectURL(new Blob([body], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
