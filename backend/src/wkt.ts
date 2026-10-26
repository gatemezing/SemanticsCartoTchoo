/** Minimal WKT parsing for the two shapes RINF actually emits via
 *  GeoSPARQL's geo:asWKT: `POINT(lon lat)` and `LINESTRING(lon lat, ...)`.
 *  Not a general WKT parser — intentionally narrow to what's observed on
 *  the live endpoint. */

export type Lineal = GeoJSON.LineString | GeoJSON.MultiLineString;

/** A point for a feature drawn as a dot (operational points, primary
 *  locations): the point itself, or — when a provider gives a footprint
 *  instead (Norway's operational points carry track-line collections as
 *  well as a point) — the mean of its vertices. Null if unusable. */
export function wktToPoint(wkt: string): GeoJSON.Point | null {
  const geometry = tryParseWkt(wkt);
  if (!geometry) return null;
  if (geometry.type === "Point") return geometry;
  const positions = allPositions(geometry);
  if (positions.length === 0) return null;
  const [lon, lat] = positions.reduce(([x, y], [px, py]) => [x + px, y + py], [0, 0]);
  return { type: "Point", coordinates: [lon / positions.length, lat / positions.length] };
}

/** Line geometry for sections of line and tunnels: a LineString, or a
 *  MultiLineString when the provider gives several parts (directly or as
 *  a collection of lines). Null when there are no lines at all. */
export function wktToLineal(wkt: string): Lineal | null {
  const geometry = tryParseWkt(wkt);
  if (!geometry) return null;
  if (geometry.type === "LineString" || geometry.type === "MultiLineString") return geometry;
  if (geometry.type !== "GeometryCollection") return null;
  const lines = geometry.geometries.flatMap((g) =>
    g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [],
  );
  if (lines.length === 0) return null;
  return lines.length === 1
    ? { type: "LineString", coordinates: lines[0] }
    : { type: "MultiLineString", coordinates: lines };
}

function tryParseWkt(wkt: string): GeoJSON.Geometry | null {
  try {
    return parseWkt(wkt);
  } catch {
    return null;
  }
}

function allPositions(geometry: GeoJSON.Geometry): GeoJSON.Position[] {
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates];
    case "MultiPoint":
    case "LineString":
      return geometry.coordinates;
    case "MultiLineString":
    case "Polygon":
      return geometry.coordinates.flat();
    case "MultiPolygon":
      return geometry.coordinates.flat(2);
    case "GeometryCollection":
      return geometry.geometries.flatMap(allPositions);
  }
}

/** Full (2D) WKT → GeoJSON for the infrastructure classes beyond
 *  operational points and sections of line, whose geometry varies by
 *  provider (surveyed live, 2026-10): POINT (with or without a space
 *  before the parenthesis, and with a leading `+` on some coordinates),
 *  LINESTRING, POLYGON (Austria models switches and level crossings as
 *  footprints) and GEOMETRYCOLLECTION. MULTI* types are accepted too. An
 *  optional `<crs-IRI>` prefix (GeoSPARQL) is skipped; none was seen in
 *  RINF, and RINF coordinates are WGS84 lon/lat. Z/M ordinates are dropped.
 *  Returns null for EMPTY geometries; throws on malformed input. */
export function parseWkt(wkt: string): GeoJSON.Geometry | null {
  const parser = new WktParser(wkt.trim().replace(/^<[^>]*>\s*/, ""));
  const geometry = parser.geometry();
  parser.expectEnd();
  return geometry;
}

class WktParser {
  private pos = 0;
  constructor(private readonly text: string) {}

  geometry(): GeoJSON.Geometry | null {
    const type = this.word().toUpperCase();
    const dims = this.peekWord();
    if (dims === "Z" || dims === "M" || dims === "ZM") this.word();
    if (this.peekWord().toUpperCase() === "EMPTY") {
      this.word();
      return null;
    }
    switch (type) {
      case "POINT":
        return { type: "Point", coordinates: this.wrapped(() => this.position()) };
      case "LINESTRING":
        return { type: "LineString", coordinates: this.positionList() };
      case "POLYGON":
        return { type: "Polygon", coordinates: this.list(() => this.positionList()) };
      case "MULTIPOINT":
        // Both "MULTIPOINT (1 2, 3 4)" and "MULTIPOINT ((1 2), (3 4))".
        return {
          type: "MultiPoint",
          coordinates: this.list(() =>
            this.peek() === "(" ? this.wrapped(() => this.position()) : this.position(),
          ),
        };
      case "MULTILINESTRING":
        return { type: "MultiLineString", coordinates: this.list(() => this.positionList()) };
      case "MULTIPOLYGON":
        return {
          type: "MultiPolygon",
          coordinates: this.list(() => this.list(() => this.positionList())),
        };
      case "GEOMETRYCOLLECTION":
        return {
          type: "GeometryCollection",
          geometries: this.list(() => this.geometry()).filter(
            (g): g is GeoJSON.Geometry => g !== null,
          ),
        };
      default:
        throw this.error(`unsupported geometry type "${type}"`);
    }
  }

  expectEnd(): void {
    this.skipSpace();
    if (this.pos !== this.text.length) throw this.error("trailing characters");
  }

  private position(): GeoJSON.Position {
    const numbers: number[] = [];
    this.skipSpace();
    while (/[-+0-9.]/.test(this.peek())) {
      const match = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(this.text.slice(this.pos));
      if (!match) throw this.error("malformed number");
      numbers.push(Number(match[0]));
      this.pos += match[0].length;
      this.skipSpace();
    }
    if (numbers.length < 2) throw this.error("expected a coordinate pair");
    return [numbers[0], numbers[1]];
  }

  private positionList(): GeoJSON.Position[] {
    return this.list(() => this.position());
  }

  private list<T>(item: () => T): T[] {
    return this.wrapped(() => {
      const items = [item()];
      while (this.consumeIf(",")) items.push(item());
      return items;
    });
  }

  private wrapped<T>(inner: () => T): T {
    this.expect("(");
    const value = inner();
    this.expect(")");
    return value;
  }

  private word(): string {
    this.skipSpace();
    const match = /^[A-Za-z]+/.exec(this.text.slice(this.pos));
    if (!match) throw this.error("expected a keyword");
    this.pos += match[0].length;
    return match[0];
  }

  private peekWord(): string {
    this.skipSpace();
    return /^[A-Za-z]+/.exec(this.text.slice(this.pos))?.[0] ?? "";
  }

  private peek(): string {
    this.skipSpace();
    return this.text[this.pos] ?? "";
  }

  private expect(char: string): void {
    if (!this.consumeIf(char)) throw this.error(`expected "${char}"`);
  }

  private consumeIf(char: string): boolean {
    if (this.peek() !== char) return false;
    this.pos++;
    return true;
  }

  private skipSpace(): void {
    while (/\s/.test(this.text[this.pos] ?? "")) this.pos++;
  }

  private error(message: string): Error {
    return new Error(`Malformed WKT (${message} at ${this.pos}): "${this.text.slice(0, 80)}"`);
  }
}
