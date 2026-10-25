import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, useEffect, useState } from "react";
import type { DescribedTriple, RdfTermDto } from "@carto-rinf/shared-types";
import { fetchDescribe } from "../api/client";
import { compactIri } from "../rdf/prefixes";
import { safeHref } from "../security/safeHref";

interface Props {
  /** Where browsing starts; changing it resets the navigation trail. */
  iri: string;
  /** Called with the resource's own label once known, so a parent can use
   *  it as a heading for entities that have no typed detail view. */
  onLabel?: (label: string | undefined) => void;
}

const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label";
const SKOS_PREF_LABEL = "http://www.w3.org/2004/02/skos/core#prefLabel";

function ownLabel(triples: DescribedTriple[]): string | undefined {
  const labels = triples.filter(
    (t) =>
      (t.predicate.uri === RDFS_LABEL || t.predicate.uri === SKOS_PREF_LABEL) &&
      t.node.type === "literal",
  );
  return (
    labels.find((t) => t.node.lang === "en" || !t.node.lang) ?? labels[0]
  )?.node.value;
}

function groupByPredicate(triples: DescribedTriple[]) {
  const groups: { predicate: DescribedTriple["predicate"]; nodes: RdfTermDto[] }[] = [];
  for (const t of triples) {
    const last = groups[groups.length - 1];
    if (last && last.predicate.uri === t.predicate.uri) last.nodes.push(t.node);
    else groups.push({ predicate: t.predicate, nodes: [t.node] });
  }
  return groups;
}

const linkButton: CSSProperties = {
  border: "none",
  background: "none",
  padding: 0,
  color: "#1d4ed8",
  cursor: "pointer",
  textAlign: "left",
  font: "inherit",
  wordBreak: "break-word",
};

function Node({ node, onNavigate }: { node: RdfTermDto; onNavigate: (iri: string) => void }) {
  // Only http(s) IRIs become links (or describable at all — the API
  // rejects anything else); any other scheme is shown as inert text.
  if (node.type === "uri" && !safeHref(node.value)) {
    return <span style={{ wordBreak: "break-all" }}>{node.label ?? node.value}</span>;
  }
  if (node.type === "uri") {
    return (
      <span>
        <button style={linkButton} onClick={() => onNavigate(node.value)} title={node.value}>
          {node.label ?? compactIri(node.value)}
        </button>{" "}
        <a
          href={safeHref(node.value)}
          target="_blank"
          rel="noopener noreferrer"
          title="Open this IRI in a new tab"
          style={{ color: "#6b7280", textDecoration: "none", fontSize: 11 }}
        >
          ↗
        </a>
      </span>
    );
  }
  if (node.type === "bnode") {
    return <span style={{ color: "#6b7280" }}>_:{node.value}</span>;
  }
  const suffix = node.lang
    ? `@${node.lang}`
    : node.datatype
      ? compactIri(node.datatype)
      : undefined;
  return (
    <span style={{ wordBreak: "break-word" }}>
      {node.value}
      {suffix && (
        <span style={{ color: "#9ca3af", fontSize: 11, marginLeft: 4 }}>{suffix}</span>
      )}
    </span>
  );
}

/** Live view of the RINF graph around one resource — every outgoing (or
 *  incoming) triple, not just the fields the typed panels pick out. IRIs
 *  are followed in place, with a trail back, so users can walk from a
 *  section of line to its tracks, its operational points, a SKOS concept,
 *  and so on, all from the same endpoint the map reads. */
export function DescribeView({ iri, onLabel }: Props) {
  const [trail, setTrail] = useState<string[]>([iri]);
  const [direction, setDirection] = useState<"out" | "in">("out");
  useEffect(() => {
    setTrail([iri]);
    setDirection("out");
  }, [iri]);

  const current = trail[trail.length - 1];
  const { data, isLoading, error } = useQuery({
    queryKey: ["describe", current, direction],
    queryFn: () => fetchDescribe(current, direction),
  });

  const label = data && data.direction === "out" ? ownLabel(data.triples) : undefined;
  useEffect(() => {
    if (trail.length === 1 && direction === "out" && data) onLabel?.(label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, data, trail.length, direction]);

  const navigate = (next: string) => {
    setTrail((t) => [...t, next]);
    setDirection("out");
  };

  return (
    <div style={{ fontSize: 13 }}>
      {trail.length > 1 && (
        <button
          style={{ ...linkButton, fontSize: 12, marginBottom: 6 }}
          onClick={() => setTrail((t) => t.slice(0, -1))}
        >
          ← Back ({trail.length - 1})
        </button>
      )}
      <div style={{ color: "#374151", fontSize: 12, wordBreak: "break-all", marginBottom: 8 }}>
        {safeHref(current) ? (
          <a href={safeHref(current)} target="_blank" rel="noopener noreferrer">
            {compactIri(current)}
          </a>
        ) : (
          compactIri(current)
        )}
      </div>

      <div role="tablist" style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {(["out", "in"] as const).map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={direction === d}
            onClick={() => setDirection(d)}
            style={{
              padding: "3px 8px",
              fontSize: 11,
              borderRadius: 4,
              border: "1px solid #d1d5db",
              background: direction === d ? "#1f2937" : "white",
              color: direction === d ? "white" : "#1f2937",
              cursor: "pointer",
            }}
          >
            {d === "out" ? "Outgoing" : "Incoming"}
          </button>
        ))}
      </div>

      {isLoading && <div>Loading from RINF…</div>}
      {error && (
        <div style={{ color: "#b91c1c" }}>
          Couldn't describe this resource: {String((error as Error).message)}
        </div>
      )}
      {data && data.triples.length === 0 && (
        <div style={{ color: "#9ca3af", fontStyle: "italic" }}>
          No {direction === "out" ? "outgoing" : "incoming"} triples in RINF.
        </div>
      )}
      {data &&
        groupByPredicate(data.triples).map(({ predicate, nodes }) => (
          <div key={predicate.uri} style={{ marginBottom: 8 }}>
            <div
              title={predicate.uri}
              style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 }}
            >
              {direction === "in" && "← "}
              {predicate.label ?? compactIri(predicate.uri)}
            </div>
            {nodes.map((n, i) => (
              <div key={`${n.value}-${i}`}>
                <Node node={n} onNavigate={navigate} />
              </div>
            ))}
          </div>
        ))}
      {data?.truncated && (
        <div style={{ color: "#92400e", fontSize: 12 }}>
          Showing the first {data.triples.length} triples only.
        </div>
      )}
    </div>
  );
}
