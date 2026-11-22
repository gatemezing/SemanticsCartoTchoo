import type { WikidataStructureInfo } from "@carto-rinf/shared-types";
import type { SparqlBinding, SparqlJsonResults } from "../sparql/client.js";

export type StructureFacts = Omit<WikidataStructureInfo, "matchedBy" | "distanceMetres">;

export interface StructureCandidate {
  facts: StructureFacts;
  /** [lon, lat] (P625). */
  coord: [number, number];
}

/** How far Wikidata's coordinates may be from RINF's geometry. A tunnel's
 *  coordinates are often at one portal, so it gets more room than a bridge. */
export const STRUCTURE_MATCH_MAX_METRES = { tunnel: 300, bridge: 150 } as const;

function parsePoint(wkt: string): [number, number] | undefined {
  const m = /^Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/i.exec(wkt.trim());
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

const year = (xsdDate: string | undefined) => (xsdDate ? /^-?\d{1,4}/.exec(xsdDate.replace(/^\+/, ""))?.[0] : undefined);

/** One item per Wikidata structure: OPTIONALs with several values (two
 *  crossings, two materials) arrive as several rows. */
export function mapWikidataStructures(results: SparqlJsonResults): StructureCandidate[] {
  const rowsByItem = new Map<string, SparqlBinding[]>();
  for (const b of results.results.bindings) {
    const rows = rowsByItem.get(b.item.value) ?? [];
    rows.push(b);
    rowsByItem.set(b.item.value, rows);
  }
  const candidates: StructureCandidate[] = [];
  for (const [iri, rows] of rowsByItem) {
    const first = (key: string) => rows.find((r) => r[key])?.[key]?.value;
    const all = (key: string) => {
      const values = [...new Set(rows.map((r) => r[key]?.value).filter((v): v is string => Boolean(v)))];
      return values.length > 0 ? values : undefined;
    };
    const number = (key: string) => {
      const v = first(key);
      return v !== undefined && Number.isFinite(Number(v)) ? Number(v) : undefined;
    };
    const coord = parsePoint(first("coord") ?? "");
    if (!coord) continue;
    const qid = iri.replace("http://www.wikidata.org/entity/", "");
    const label = first("itemLabel");
    const facts: StructureFacts = {
      qid,
      sourceUrl: iri,
      ...(label && label !== qid && { label }),
      ...(number("lengthM") !== undefined && { lengthMetres: number("lengthM") }),
      ...(number("heightM") !== undefined && { heightMetres: number("heightM") }),
      ...(number("spans") !== undefined && { spans: number("spans") }),
      ...(number("spanM") !== undefined && { longestSpanMetres: number("spanM") }),
      ...((year(first("opened")) ?? year(first("inception"))) && {
        opened: year(first("opened")) ?? year(first("inception")),
      }),
      ...(all("carriesLabel") && { carries: all("carriesLabel") }),
      ...(all("crossesLabel") && { crosses: all("crossesLabel") }),
      ...(first("operatorLabel") && { operator: first("operatorLabel") }),
      ...(first("heritageLabel") && { heritage: first("heritageLabel") }),
      ...(all("materialLabel") && { material: all("materialLabel")!.join(", ") }),
      ...(first("image") && { image: first("image") }),
    };
    candidates.push({ facts, coord });
  }
  return candidates;
}

/** Every vertex sequence of a geometry: lines as-is, points as one-vertex
 *  "lines", polygon rings as lines. */
function paths(geometry: GeoJSON.Geometry): GeoJSON.Position[][] {
  switch (geometry.type) {
    case "Point":
      return [[geometry.coordinates]];
    case "MultiPoint":
    case "LineString":
      return geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates.map((c) => [c]);
    case "MultiLineString":
    case "Polygon":
      return geometry.coordinates;
    case "MultiPolygon":
      return geometry.coordinates.flat();
    case "GeometryCollection":
      return geometry.geometries.flatMap(paths);
  }
}

/** Metres from a point to a geometry, in a local equirectangular frame
 *  around the point: exact enough at a few hundred metres. */
export function distanceMetres([lon, lat]: [number, number], geometry: GeoJSON.Geometry): number {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110_574;
  const local = ([x, y]: GeoJSON.Position) => [(x - lon) * kx, (y - lat) * ky] as const;
  let best = Infinity;
  for (const path of paths(geometry)) {
    const pts = path.map(local);
    if (pts.length === 1) best = Math.min(best, Math.hypot(pts[0][0], pts[0][1]));
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

function bbox(geometry: GeoJSON.Geometry): [number, number, number, number] {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const path of paths(geometry)) {
    for (const [x, y] of path) {
      w = Math.min(w, x);
      s = Math.min(s, y);
      e = Math.max(e, x);
      n = Math.max(n, y);
    }
  }
  return [w, s, e, n];
}

/** The nearest Wikidata structure within `maxMetres` of a RINF feature's
 *  geometry. When both sides give a length, they must agree within a
 *  factor of 2, which keeps a short tunnel from taking its long
 *  neighbour's facts. Several RINF records (one per track, say) can match
 *  the same item: they describe the same structure. */
export function matchStructure(
  candidates: readonly StructureCandidate[],
  geometry: GeoJSON.Geometry,
  rinfLengthMetres: number | undefined,
  maxMetres: number,
): WikidataStructureInfo | undefined {
  const [w, s, e, n] = bbox(geometry);
  if (!Number.isFinite(w)) return undefined;
  // A cheap pre-filter in degrees before the exact distance.
  const padLat = maxMetres / 110_574;
  const padLon = maxMetres / (111_320 * Math.max(0.1, Math.cos((((s + n) / 2) * Math.PI) / 180)));
  let best: { candidate: StructureCandidate; metres: number } | undefined;
  for (const c of candidates) {
    const [x, y] = c.coord;
    if (x < w - padLon || x > e + padLon || y < s - padLat || y > n + padLat) continue;
    const wdLength = c.facts.lengthMetres;
    if (rinfLengthMetres && wdLength) {
      const ratio = wdLength / rinfLengthMetres;
      if (ratio < 0.5 || ratio > 2) continue;
    }
    const metres = distanceMetres(c.coord, geometry);
    if (metres <= maxMetres && (!best || metres < best.metres)) best = { candidate: c, metres };
  }
  return best && { ...best.candidate.facts, matchedBy: "position", distanceMetres: Math.round(best.metres) };
}
