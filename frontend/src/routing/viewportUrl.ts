/** URL scheme mirrors carto.tchoo.net's `/lat,lon,zoom,bearing,pitch/id`
 *  pattern, extended with a leading country segment and simplified to
 *  `/country/lat,lon,zoom/uopid` — this map never exposes bearing/pitch
 *  controls, so encoding them would be fabricated precision. Older links
 *  from before multi-country support (`/lat,lon,zoom/uopid`, no country
 *  segment) still parse — they just default to France. */
export interface ViewportState {
  lat: number;
  lon: number;
  zoom: number;
}

export interface RouteState {
  /** null means "not specified in the URL" — caller decides the default. */
  country: string | null;
  viewport: ViewportState | null;
  uopid: string | null;
}

export const DEFAULT_VIEWPORT: ViewportState = { lat: 46.6, lon: 2.5, zoom: 5 };
export const DEFAULT_COUNTRY = "FR";

const VIEWPORT_SEGMENT = /^(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*)$/;
const COUNTRY_SEGMENT = /^[A-Z]{2}$/;

export function parseRoute(pathname: string): RouteState {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return { country: null, viewport: null, uopid: null };

  let index = 0;
  let country: string | null = null;
  if (COUNTRY_SEGMENT.test(segments[0])) {
    country = segments[0];
    index = 1;
  }

  const match = VIEWPORT_SEGMENT.exec(segments[index] ?? "");
  if (!match) return { country, viewport: null, uopid: segments[index] ?? null };

  return {
    country,
    viewport: {
      lat: Number(match[1]),
      lon: Number(match[2]),
      zoom: Number(match[3]),
    },
    uopid: segments[index + 1] ?? null,
  };
}

export function formatRoute(
  country: string,
  viewport: ViewportState,
  uopid: string | null,
): string {
  const vp = `${viewport.lat.toFixed(5)},${viewport.lon.toFixed(5)},${viewport.zoom.toFixed(2)}`;
  return `/${country}/${vp}${uopid ? `/${uopid}` : "/"}`;
}
