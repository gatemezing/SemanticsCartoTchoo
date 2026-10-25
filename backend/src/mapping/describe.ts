import type {
  DescribeResult,
  DescribedTriple,
  RdfTermDto,
} from "@carto-rinf/shared-types";
import type { SparqlJsonResults, SparqlTerm } from "../sparql/client.js";

function toTermDto(term: SparqlTerm, label: SparqlTerm | undefined): RdfTermDto {
  const dto: RdfTermDto = { type: term.type, value: term.value };
  if (term.datatype) dto.datatype = term.datatype;
  if (term["xml:lang"]) dto.lang = term["xml:lang"];
  if (label) dto.label = label.value;
  return dto;
}

/** Sorted by predicate then node so the UI can group consecutive rows
 *  without re-sorting, and so the same resource always lists the same way
 *  (GROUP BY output order is otherwise store-defined). `limit` is the cap
 *  the query was built with — it fetched one more row than that to detect
 *  truncation. */
export function mapDescribe(
  iri: string,
  direction: "out" | "in",
  results: SparqlJsonResults,
  limit: number,
): DescribeResult {
  const bindings = results.results.bindings;
  const triples: DescribedTriple[] = bindings.map((b) => {
    const predicate: DescribedTriple["predicate"] = { uri: b.p.value };
    if (b.pLabel) predicate.label = b.pLabel.value;
    return { predicate, node: toTermDto(b.node, b.nodeLabel) };
  });
  triples.sort(
    (a, b) =>
      a.predicate.uri.localeCompare(b.predicate.uri) ||
      a.node.value.localeCompare(b.node.value),
  );
  return {
    iri,
    direction,
    triples: triples.slice(0, limit),
    truncated: triples.length > limit,
  };
}
