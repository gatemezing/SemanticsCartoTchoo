/** URL scheme mirrors carto.tchoo.net's `/lat,lon,zoom,bearing,pitch/id`
 *  pattern, simplified to `/lat,lon,zoom/uopid` — this map never exposes
 *  bearing/pitch controls, so encoding them would be fabricated precision. */
export interface ViewportState {
  lat: number;
  lon: number;
  zoom: number;
}

export interface RouteState {
  viewport: ViewportState | null;
  uopid: string | null;
}

export const DEFAULT_VIEWPORT: ViewportState = { lat: 46.6, lon: 2.5, zoom: 5 };

const VIEWPORT_SEGMENT = /^(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*)$/;

export function parseRoute(pathname: string): RouteState {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return { viewport: null, uopid: null };

  const match = VIEWPORT_SEGMENT.exec(segments[0]);
  if (!match) return { viewport: null, uopid: segments[0] };

  return {
    viewport: {
      lat: Number(match[1]),
      lon: Number(match[2]),
      zoom: Number(match[3]),
    },
    uopid: segments[1] ?? null,
  };
}

export function formatRoute(viewport: ViewportState, uopid: string | null): string {
  const vp = `/${viewport.lat.toFixed(5)},${viewport.lon.toFixed(5)},${viewport.zoom.toFixed(2)}`;
  return uopid ? `${vp}/${uopid}` : `${vp}/`;
}
