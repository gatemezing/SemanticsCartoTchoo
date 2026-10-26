import type {
  InfrastructureCollection,
  InfrastructureKind,
} from "@carto-rinf/shared-types";
import type { MapLibreMap } from "maplibre-gl";

/** Each extra infrastructure class is told apart by marker *shape* (not
 *  hue — see dataColors.ts), drawn as an SDF icon so MapLibre can tint it
 *  per theme and add a halo. The same shapes are drawn in the legend. */
export const INFRA_SHAPES: Record<InfrastructureKind, "square" | "triangle" | "diamond" | "bar"> = {
  "level-crossings": "square",
  signals: "triangle",
  switches: "diamond",
  bridges: "bar",
};

export const INFRA_LABELS: Record<InfrastructureKind, string> = {
  "level-crossings": "Level crossings",
  bridges: "Bridges",
  signals: "Signals",
  switches: "Switches",
};

/** SVG path (24×24 box) per shape — shared by the map icons and legend. */
export const SHAPE_PATHS: Record<(typeof INFRA_SHAPES)[InfrastructureKind], string> = {
  square: "M5 5h14v14H5z",
  triangle: "M12 3l9 17H3z",
  diamond: "M12 2l10 10-10 10L2 12z",
  bar: "M2 8h20v8H2z",
};

const ICON_PX = 48; // drawn at 2× and registered with pixelRatio 2

export function iconId(kind: InfrastructureKind): string {
  return `infra-icon-${kind}`;
}

/** Registers one SDF icon per kind (white shape on transparent, which
 *  MapLibre recolours through icon-color). Idempotent. */
export function addInfrastructureIcons(map: MapLibreMap): void {
  for (const kind of Object.keys(INFRA_SHAPES) as InfrastructureKind[]) {
    if (map.hasImage(iconId(kind))) continue;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = ICON_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.scale(ICON_PX / 24, ICON_PX / 24);
    ctx.fillStyle = "#ffffff";
    ctx.fill(new Path2D(SHAPE_PATHS[INFRA_SHAPES[kind]]));
    map.addImage(iconId(kind), ctx.getImageData(0, 0, ICON_PX, ICON_PX), {
      sdf: true,
      pixelRatio: 2,
    });
  }
}

function meanPosition(geometry: GeoJSON.Geometry): GeoJSON.Position | null {
  const positions: GeoJSON.Position[] = [];
  const collect = (g: GeoJSON.Geometry) => {
    switch (g.type) {
      case "Point": positions.push(g.coordinates); break;
      case "MultiPoint": case "LineString": positions.push(...g.coordinates); break;
      case "MultiLineString": case "Polygon": positions.push(...g.coordinates.flat()); break;
      case "MultiPolygon": positions.push(...g.coordinates.flat(2)); break;
      case "GeometryCollection": g.geometries.forEach(collect); break;
    }
  };
  collect(geometry);
  if (positions.length === 0) return null;
  const sum = positions.reduce(([x, y], [px, py]) => [x + px, y + py], [0, 0]);
  return [sum[0] / positions.length, sum[1] / positions.length];
}

/** One marker point per feature (a footprint's or line's mean vertex), so
 *  every feature is visible and clickable at any zoom — an Austrian switch
 *  footprint is a few metres across. */
export function markerPoints(collection: InfrastructureCollection): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: collection.features.flatMap((f) => {
      const at = meanPosition(f.geometry);
      return at
        ? [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: at }, properties: f.properties }]
        : [];
    }),
  };
}

/** The real shapes worth drawing beyond the marker: lines and polygons. */
export function shapeFeatures(collection: InfrastructureCollection): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: collection.features.filter((f) => f.geometry.type !== "Point" && f.geometry.type !== "MultiPoint"),
  };
}
