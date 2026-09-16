import type { FieldValue, RinfLink } from "@carto-rinf/shared-types";

/** MapLibre GeoJSON sources JSON.stringify any non-primitive property
 *  value internally, so nested FieldValue objects come back as strings
 *  from click/query-feature events and must be parsed back out. */
export function parseMaybeJson<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

export const NOT_AVAILABLE_LABEL = "Not available in RINF";
export const NOT_APPLICABLE_LABEL = "Not applicable";

/** Renders any FieldValue<T> to display text, given how to format a
 *  present value — the "not applicable"/"not available" cases are always
 *  the same regardless of T. */
export function describeFieldValue<T>(
  field: FieldValue<T>,
  formatValue: (value: T) => string,
): string {
  switch (field.status) {
    case "value":
      return formatValue(field.value);
    case "not_applicable":
      return NOT_APPLICABLE_LABEL;
    case "not_available_in_rinf":
      return NOT_AVAILABLE_LABEL;
  }
}

export function fieldValueLabel(field: FieldValue<string>): string {
  return describeFieldValue(field, (v) => v);
}

export function linkFieldValueLabel(field: FieldValue<RinfLink>): string {
  return describeFieldValue(field, (v) => v.label ?? v.uri);
}
