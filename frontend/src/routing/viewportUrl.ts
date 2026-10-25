/** URL scheme mirrors carto.tchoo.net's `/lat,lon,zoom,bearing,pitch/id`
 *  pattern, extended with a leading country segment and simplified to
 *  `/country/lat,lon,zoom/uopid` — this map never exposes bearing/pitch
 *  controls, so encoding them would be fabricated precision. Older links
 *  from before multi-country support (`/lat,lon,zoom/uopid`, no country
 *  segment) still parse — they just default to France.
 *
 *  View state that isn't a place goes in the query string, all optional so
 *  every older link still opens unchanged:
 *  - `sel=<IRI>`: a selected entity that has no uopid (a section of line,
 *    a tunnel, any resource reached from the Describe view). Ignored when
 *    the path already names an operational point.
 *  - `hide=<layer>,<layer>`: map layers switched off (see LAYER_IDS).
 *  - `orm=1`: the OpenRailwayMap overlay is on. */
import { safeHref } from "../security/safeHref";

export interface ViewportState {
  lat: number;
  lon: number;
  zoom: number;
}

export const LAYER_IDS = [
  "operational-points",
  "sections-of-line",
  "tunnels",
  "primary-locations",
] as const;

export type LayerId = (typeof LAYER_IDS)[number];

/** Real uopids contain spaces, `+` and non-ASCII letters (e.g. Swedish
 *  "SE Ög"), so the path segment is percent-encoded on the way out and
 *  decoded on the way in. */
function decodeSegment(segment: string | undefined): string | null {
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export interface RouteState {
  /** null means "not specified in the URL" — caller decides the default. */
  country: string | null;
  viewport: ViewportState | null;
  uopid: string | null;
  selectedIri: string | null;
  hiddenLayers: LayerId[];
  openRailwayMap: boolean;
}

export const DEFAULT_VIEWPORT: ViewportState = { lat: 46.6, lon: 2.5, zoom: 5 };
export const DEFAULT_COUNTRY = "FR";

const VIEWPORT_SEGMENT = /^(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*)$/;
const COUNTRY_SEGMENT = /^[A-Z]{2}$/;

function parseQuery(search: string): Pick<
  RouteState,
  "selectedIri" | "hiddenLayers" | "openRailwayMap"
> {
  const params = new URLSearchParams(search);
  const hide = params.get("hide");
  return {
    // Share links are attacker-craftable: only http(s) IRIs are accepted.
    selectedIri: safeHref(params.get("sel")) ?? null,
    // Unknown ids are dropped rather than rejected, so a link made by a
    // later version with more layers still opens.
    hiddenLayers: hide
      ? LAYER_IDS.filter((id) => hide.split(",").includes(id))
      : [],
    openRailwayMap: params.get("orm") === "1",
  };
}

export function parseRoute(pathname: string, search = ""): RouteState {
  const query = parseQuery(search);
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return { country: null, viewport: null, uopid: null, ...query };
  }

  let index = 0;
  let country: string | null = null;
  if (COUNTRY_SEGMENT.test(segments[0])) {
    country = segments[0];
    index = 1;
  }

  const match = VIEWPORT_SEGMENT.exec(segments[index] ?? "");
  if (!match) {
    const uopid = decodeSegment(segments[index]);
    return {
      country,
      viewport: null,
      uopid,
      ...query,
      selectedIri: uopid ? null : query.selectedIri,
    };
  }

  const uopid = decodeSegment(segments[index + 1]);
  return {
    country,
    viewport: {
      lat: Number(match[1]),
      lon: Number(match[2]),
      zoom: Number(match[3]),
    },
    uopid,
    ...query,
    selectedIri: uopid ? null : query.selectedIri,
  };
}

export interface FormatRouteOptions {
  selectedIri?: string | null;
  hiddenLayers?: readonly LayerId[];
  openRailwayMap?: boolean;
}

export function formatRoute(
  country: string,
  viewport: ViewportState,
  uopid: string | null,
  options: FormatRouteOptions = {},
): string {
  const vp = `${viewport.lat.toFixed(5)},${viewport.lon.toFixed(5)},${viewport.zoom.toFixed(2)}`;
  const path = `/${country}/${vp}${uopid ? `/${encodeURIComponent(uopid)}` : "/"}`;

  const params = new URLSearchParams();
  if (!uopid && options.selectedIri) params.set("sel", options.selectedIri);
  if (options.hiddenLayers && options.hiddenLayers.length > 0) {
    // Canonical order, so the same view always yields the same URL.
    params.set(
      "hide",
      LAYER_IDS.filter((id) => options.hiddenLayers!.includes(id)).join(","),
    );
  }
  if (options.openRailwayMap) params.set("orm", "1");
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
