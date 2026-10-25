/** The only gate for putting a URI from data into an `href`. RINF IRIs,
 *  Describe-view nodes and the `?sel=` share-link parameter are all
 *  third-party or attacker-reachable, and RDF allows any IRI scheme — a
 *  `javascript:` IRI rendered as a link runs in this app's origin on
 *  click (reproduced in the security review, even with target=_blank).
 *  Returns the URI only if it's absolute http(s); callers render plain
 *  text otherwise. */
export function safeHref(uri: string | null | undefined): string | undefined {
  if (!uri) return undefined;
  try {
    const { protocol } = new URL(uri);
    return protocol === "http:" || protocol === "https:" ? uri : undefined;
  } catch {
    return undefined;
  }
}
