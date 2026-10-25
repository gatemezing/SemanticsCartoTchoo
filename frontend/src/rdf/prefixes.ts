/** Namespaces seen in the RINF graph, for showing IRIs compactly when a
 *  resource has no label. Longest namespace wins, so `erac:` (ERA's SKOS
 *  concepts) beats the `era:` namespace it sits inside. Display only —
 *  links and API calls always use the full IRI. */
const PREFIXES: [prefix: string, namespace: string][] = [
  ["erac", "http://data.europa.eu/949/concepts/"],
  ["era", "http://data.europa.eu/949/"],
  ["cty", "http://publications.europa.eu/resource/authority/country/"],
  ["eu", "http://publications.europa.eu/resource/authority/"],
  ["rdf", "http://www.w3.org/1999/02/22-rdf-syntax-ns#"],
  ["rdfs", "http://www.w3.org/2000/01/rdf-schema#"],
  ["owl", "http://www.w3.org/2002/07/owl#"],
  ["xsd", "http://www.w3.org/2001/XMLSchema#"],
  ["skos", "http://www.w3.org/2004/02/skos/core#"],
  ["dcterms", "http://purl.org/dc/terms/"],
  ["geo", "http://www.opengis.net/ont/geosparql#"],
  ["time", "http://www.w3.org/2006/time#"],
  ["wd", "http://www.wikidata.org/entity/"],
].sort((a, b) => b[1].length - a[1].length) as [string, string][];

export function compactIri(iri: string): string {
  for (const [prefix, namespace] of PREFIXES) {
    if (iri.startsWith(namespace) && iri.length > namespace.length) {
      return `${prefix}:${iri.slice(namespace.length)}`;
    }
  }
  return iri;
}
