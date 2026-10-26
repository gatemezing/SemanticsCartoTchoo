/** A section of line as input to chaining: identified by its IRI, joined
 *  to others through its endpoint operational points' uopids (stable
 *  across versions, unlike the operational points' own IRIs). */
export interface ChainSection {
  rinfUri: string;
  startUopid: string;
  endUopid: string;
  /** km; null when RINF has no length for the section. */
  lengthKm: number | null;
}

export interface ChainedSegment<S extends ChainSection> {
  section: S;
  reversed: boolean;
  startKm: number;
  endKm: number;
  lengthKnown: boolean;
}

/** Orders a national line's sections into runs a profile can be drawn
 *  along. Each run is the longest chain through what's left of one
 *  connected group (longest first); branches and stray sections become
 *  further, shorter runs, so every section appears exactly once.
 *
 *  Longest path is found with the classic two-sweep method (farthest node
 *  from any start, then farthest from that), exact on trees and a sound
 *  approximation where a line has loops — and linear, which matters for
 *  lines like France's 830000 with 700+ sections. Unknown lengths count
 *  as the median known length (1 km if none), flagged on the segment. */
export function chainSections<S extends ChainSection>(sections: S[]): ChainedSegment<S>[][] {
  const unique = [...new Map(sections.map((s) => [s.rinfUri, s])).values()];
  const known = unique.map((s) => s.lengthKm).filter((l): l is number => l !== null && l > 0);
  const nominal = known.length ? median(known) : 1;
  const weight = (s: S) => (s.lengthKm !== null && s.lengthKm > 0 ? s.lengthKm : nominal);

  const remaining = new Set(unique);
  const runs: ChainedSegment<S>[][] = [];
  while (remaining.size > 0) {
    const adjacency = buildAdjacency(remaining);
    const path = longestPath(adjacency, weight);
    for (const step of path) remaining.delete(step.section);
    let km = 0;
    runs.push(
      path.map(({ section, reversed }) => {
        const startKm = km;
        km += weight(section);
        return {
          section,
          reversed,
          startKm,
          endKm: km,
          lengthKnown: section.lengthKm !== null && section.lengthKm > 0,
        };
      }),
    );
  }
  return runs.sort((a, b) => runLength(b) - runLength(a));
}

interface Edge<S> {
  section: S;
  to: string;
  reversed: boolean;
}

function buildAdjacency<S extends ChainSection>(sections: Set<S>): Map<string, Edge<S>[]> {
  const adjacency = new Map<string, Edge<S>[]>();
  const add = (from: string, edge: Edge<S>) => {
    const list = adjacency.get(from);
    if (list) list.push(edge);
    else adjacency.set(from, [edge]);
  };
  // Insertion order follows the input, so results are deterministic.
  for (const s of sections) {
    add(s.startUopid, { section: s, to: s.endUopid, reversed: false });
    add(s.endUopid, { section: s, to: s.startUopid, reversed: true });
  }
  return adjacency;
}

/** Farthest node from `start` along a DFS tree (each node visited once),
 *  with the edge path that reaches it. Iterative, so deep lines can't
 *  overflow the stack. */
function farthest<S extends ChainSection>(
  adjacency: Map<string, Edge<S>[]>,
  start: string,
  weight: (s: S) => number,
): { node: string; path: { section: S; reversed: boolean }[] } {
  const best = { node: start, distance: 0, path: [] as { section: S; reversed: boolean }[] };
  const visited = new Set([start]);
  const stack: { node: string; distance: number; path: { section: S; reversed: boolean }[] }[] = [
    { node: start, distance: 0, path: [] },
  ];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.distance > best.distance) Object.assign(best, current);
    for (const edge of adjacency.get(current.node) ?? []) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      stack.push({
        node: edge.to,
        distance: current.distance + weight(edge.section),
        path: [...current.path, { section: edge.section, reversed: edge.reversed }],
      });
    }
  }
  return best;
}

function longestPath<S extends ChainSection>(
  adjacency: Map<string, Edge<S>[]>,
  weight: (s: S) => number,
): { section: S; reversed: boolean }[] {
  // Start from a dead end when there is one, so a simple line reads from
  // one of its termini rather than from the middle.
  const nodes = [...adjacency.keys()];
  const start = nodes.find((n) => adjacency.get(n)!.length === 1) ?? nodes[0];
  const end = farthest(adjacency, start, weight).node;
  const { path } = farthest(adjacency, end, weight);
  if (path.length > 0) return path;
  // A loop of a single section (start = end) — still part of the line.
  const edge = adjacency.get(start)![0];
  return [{ section: edge.section, reversed: false }];
}

function runLength(run: { endKm: number }[]): number {
  return run.length ? run[run.length - 1].endKm : 0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
