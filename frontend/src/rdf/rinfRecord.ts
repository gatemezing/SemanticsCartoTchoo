import { safeHref } from "../security/safeHref";

/** ERA's Describe page on its RINF platform. It reads the resource's IRI,
 *  URL-encoded, from the fragment. */
export const RINF_DESCRIBE_URL = "https://rinf.data.era.europa.eu/describe";

/** Where "View RINF record" points: ERA's own page for a RINF resource,
 *  e.g. http://data.europa.eu/949/operationalPoint/99165b390a →
 *  https://rinf.data.era.europa.eu/describe#http%3A%2F%2Fdata.europa.eu%2F949%2FoperationalPoint%2F99165b390a.
 *  The IRI itself stays in the data and exports; dereferencing it directly
 *  doesn't give a browser a readable page. Undefined for a missing or
 *  non-http(s) IRI, so callers render no link. */
export function rinfRecordUrl(iri: string | null | undefined): string | undefined {
  const safe = safeHref(iri);
  return safe ? `${RINF_DESCRIBE_URL}#${encodeURIComponent(safe)}` : undefined;
}
