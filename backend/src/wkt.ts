/** Minimal WKT parsing for the two shapes RINF actually emits via
 *  GeoSPARQL's geo:asWKT: `POINT(lon lat)` and `LINESTRING(lon lat, ...)`.
 *  Not a general WKT parser — intentionally narrow to what's observed on
 *  the live endpoint. */

function parseCoordinatePair(text: string): GeoJSON.Position {
  const [lon, lat] = text
    .trim()
    .split(/\s+/)
    .map((n) => Number.parseFloat(n));
  if (Number.isNaN(lon) || Number.isNaN(lat)) {
    throw new Error(`Malformed WKT coordinate pair: "${text}"`);
  }
  return [lon, lat];
}

export function parseWktPoint(wkt: string): GeoJSON.Point {
  const match = /^POINT\s*\(([^)]+)\)$/i.exec(wkt.trim());
  if (!match) throw new Error(`Not a WKT POINT: "${wkt}"`);
  return { type: "Point", coordinates: parseCoordinatePair(match[1]) };
}

export function parseWktLineString(wkt: string): GeoJSON.LineString {
  const match = /^LINESTRING\s*\(([^)]+)\)$/i.exec(wkt.trim());
  if (!match) throw new Error(`Not a WKT LINESTRING: "${wkt}"`);
  const coordinates = match[1].split(",").map(parseCoordinatePair);
  return { type: "LineString", coordinates };
}
