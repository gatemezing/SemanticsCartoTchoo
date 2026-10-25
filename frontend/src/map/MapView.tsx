import {
  GeoJSONSource,
  type MapLayerMouseEvent,
  MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useRef } from "react";
import type {
  OperationalPointsCollection,
  PrimaryLocationsCollection,
  SectionOfLineCollection,
  TunnelsCollection,
} from "@carto-rinf/shared-types";
import {
  hiddenOpTypeKeysFilterExpression,
  opTypeColorMatchExpression,
  withOpTypeKey,
} from "./opTypeColors";
import { buildPrimaryLocationPopup, buildTunnelPopup } from "./popupContent";
import type { LayerId, ViewportState } from "../routing/viewportUrl";

// MapLibre otherwise locates its worker as `./maplibre-gl-worker.mjs` next
// to its own module, a file Vite's production build never emits: in a
// built app the request fell through to the SPA's index.html (HTTP 200,
// text/html), the worker silently failed, and no GeoJSON layer ever
// rendered — only the raster basemap. `?worker&url` makes Vite bundle the
// worker (with the shared chunk it imports) as a real asset.
setWorkerUrl(maplibreWorkerUrl);

export interface FlyToTarget {
  lon: number;
  lat: number;
  /** Omit for a search result (zooms in from wherever the map currently
   *  is, never out); pass explicitly for a country switch (jumps straight
   *  to that country's own overview zoom, which may well be *less* zoomed
   *  in than the current view). */
  zoom?: number;
  /** Bump this on every request so a repeat click on the same result still
   *  triggers a flyTo (React only re-runs the effect when a dependency
   *  actually changes). */
  nonce: number;
}

const ORM_LAYER = "openrailwaymap";

/** OpenRailwayMap's raster overlay is an independent, OSM-derived view of
 *  the network — useful next to RINF's own (approximate) section geometry
 *  to see where the real track runs. Off by default: its tile servers are
 *  free only for light, non-commercial use. */
function baseStyle(openRailwayMap: boolean) {
  return {
    version: 8 as const,
    sources: {
      osm: {
        type: "raster" as const,
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "&copy; OpenStreetMap contributors",
      },
      [ORM_LAYER]: {
        type: "raster" as const,
        tiles: ["a", "b", "c"].map(
          (s) => `https://${s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png`,
        ),
        tileSize: 256,
        maxzoom: 19,
        attribution:
          '<a href="https://www.openrailwaymap.org/">OpenRailwayMap</a> (CC-BY-SA 2.0)',
      },
    },
    layers: [
      { id: "osm", type: "raster" as const, source: "osm" },
      {
        id: ORM_LAYER,
        type: "raster" as const,
        source: ORM_LAYER,
        layout: { visibility: openRailwayMap ? ("visible" as const) : ("none" as const) },
      },
    ],
  };
}

/** The MapLibre layers that make up each user-facing layer toggle. */
const MAP_LAYERS: Record<LayerId, string[]> = {
  "operational-points": ["operational-points-layer"],
  "sections-of-line": ["sections-of-line-layer", "sections-of-line-hit"],
  tunnels: ["tunnels-layer"],
  "primary-locations": ["primary-locations-layer"],
};

function applyVisibility(
  map: MapLibreMap,
  hiddenLayers: readonly LayerId[],
  openRailwayMap: boolean,
): void {
  for (const [layerId, mapLayers] of Object.entries(MAP_LAYERS)) {
    const visibility = hiddenLayers.includes(layerId as LayerId) ? "none" : "visible";
    for (const id of mapLayers) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
    }
  }
  if (map.getLayer(ORM_LAYER)) {
    map.setLayoutProperty(ORM_LAYER, "visibility", openRailwayMap ? "visible" : "none");
  }
}

const OPERATIONAL_POINTS_SOURCE = "operational-points";
const SECTIONS_OF_LINE_SOURCE = "sections-of-line";
const TUNNELS_SOURCE = "tunnels";
const PRIMARY_LOCATIONS_SOURCE = "primary-locations";

interface Props {
  operationalPoints: OperationalPointsCollection;
  sectionsOfLine: SectionOfLineCollection;
  tunnels: TunnelsCollection;
  primaryLocations: PrimaryLocationsCollection;
  onSelectOperationalPoint: (uopid: string) => void;
  /** Any other clickable entity, by its RINF IRI (opens the Describe view). */
  onSelectResource: (iri: string) => void;
  hiddenLayers: readonly LayerId[];
  openRailwayMap: boolean;
  initialViewport: ViewportState;
  onViewportChange: (viewport: ViewportState) => void;
  flyTo: FlyToTarget | null;
  hiddenOpTypeKeys: Set<string>;
}

export function MapView({
  operationalPoints,
  sectionsOfLine,
  tunnels,
  primaryLocations,
  onSelectOperationalPoint,
  onSelectResource,
  hiddenLayers,
  openRailwayMap,
  initialViewport,
  onViewportChange,
  flyTo,
  hiddenOpTypeKeys,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelectOperationalPoint);
  onSelectRef.current = onSelectOperationalPoint;
  const onSelectResourceRef = useRef(onSelectResource);
  onSelectResourceRef.current = onSelectResource;
  // Read on load, so toggles flipped before the map finished loading (or
  // set from the URL) still apply to layers added in the load handler.
  const visibilityRef = useRef({ hiddenLayers, openRailwayMap });
  visibilityRef.current = { hiddenLayers, openRailwayMap };
  // Not map.isStyleLoaded(): that also turns false while tiles are still
  // loading, which would silently drop a toggle made mid-load.
  const layersAddedRef = useRef(false);
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: baseStyle(openRailwayMap),
      center: [initialViewport.lon, initialViewport.lat],
      zoom: initialViewport.zoom,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl(), "top-right");

    map.on("moveend", () => {
      const center = map.getCenter();
      onViewportChangeRef.current({
        lat: center.lat,
        lon: center.lng,
        zoom: map.getZoom(),
      });
    });

    map.on("load", () => {
      // Layer order, bottom to top: approximate section-of-line geometry,
      // real tunnel geometry, primary-location rings, operational points on
      // top so their dot is never hidden under a primary-location ring.
      map.addSource(SECTIONS_OF_LINE_SOURCE, {
        type: "geojson",
        data: sectionsOfLine,
      });
      map.addLayer({
        id: "sections-of-line-layer",
        type: "line",
        source: SECTIONS_OF_LINE_SOURCE,
        paint: {
          "line-color": "#0f766e",
          "line-width": 1.5,
          // Dashed = a visual signal that this is the straight line between
          // two endpoints, not the real track geometry (RINF doesn't carry
          // a detailed polyline for sections of line).
          "line-dasharray": [2, 2],
        },
      });
      // A 1.5px dashed line is nearly impossible to hit with a pointer
      // (worse on touch), so clicks go to this invisible, wider copy.
      map.addLayer({
        id: "sections-of-line-hit",
        type: "line",
        source: SECTIONS_OF_LINE_SOURCE,
        paint: { "line-color": "#000000", "line-width": 10, "line-opacity": 0 },
      });

      map.addSource(TUNNELS_SOURCE, { type: "geojson", data: tunnels });
      map.addLayer({
        id: "tunnels-layer",
        type: "line",
        source: TUNNELS_SOURCE,
        paint: {
          // Solid: a tunnel's two-point line really is its portal-to-portal
          // geometry, not a stand-in for missing detail.
          "line-color": "#78350f",
          "line-width": 3,
        },
      });

      map.addSource(PRIMARY_LOCATIONS_SOURCE, {
        type: "geojson",
        data: primaryLocations,
      });
      map.addLayer({
        id: "primary-locations-layer",
        type: "circle",
        source: PRIMARY_LOCATIONS_SOURCE,
        // Only from a middling zoom on — at country-wide view, ~50% of
        // points having a ring turned the whole map into a solid wash of
        // purple and drowned out the opType colors it's meant to sit beside.
        minzoom: 8,
        paint: {
          // Thin, semi-transparent halo just outside the operational-point
          // dot — a hint that's easy to click but doesn't compete with the
          // dot's own color for attention. Rings with Wikidata-sourced
          // accessibility data recolor to gold and stand out further, so
          // that coverage is visible on the map without clicking every
          // point (see Legend for what each ring color means).
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 9],
          "circle-color": "rgba(0,0,0,0)",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "circle-stroke-color": [
            "case",
            ["has", "wikidata"],
            "#d97706",
            "#7c3aed",
          ] as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "circle-stroke-width": ["case", ["has", "wikidata"], 2.5, 1.5] as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "circle-stroke-opacity": ["case", ["has", "wikidata"], 0.9, 0.55] as any,
        },
      });

      map.addSource(OPERATIONAL_POINTS_SOURCE, {
        type: "geojson",
        data: withOpTypeKey(operationalPoints),
      });
      map.addLayer({
        id: "operational-points-layer",
        type: "circle",
        source: OPERATIONAL_POINTS_SOURCE,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filter: hiddenOpTypeKeysFilterExpression(hiddenOpTypeKeys) as any,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2, 12, 6],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "circle-color": opTypeColorMatchExpression() as any,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      });

      applyVisibility(
        map,
        visibilityRef.current.hiddenLayers,
        visibilityRef.current.openRailwayMap,
      );
      layersAddedRef.current = true;

      const pointAndTunnelLayers = [
        "operational-points-layer",
        "tunnels-layer",
        "primary-locations-layer",
      ];
      const interactiveLayers = [...pointAndTunnelLayers, "sections-of-line-hit"];
      for (const layerId of interactiveLayers) {
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      map.on("click", "operational-points-layer", (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        const uopid = feature?.properties?.uopid;
        if (typeof uopid === "string") onSelectRef.current(uopid);
      });

      // Sections sit under everything else; a click that also lands on a
      // point or tunnel belongs to that feature, not the line beneath it.
      map.on("click", "sections-of-line-hit", (e: MapLayerMouseEvent) => {
        const above = map.queryRenderedFeatures(e.point, {
          layers: pointAndTunnelLayers.filter(
            (id) => map.getLayoutProperty(id, "visibility") !== "none",
          ),
        });
        if (above.length > 0) return;
        const iri = e.features?.[0]?.properties?.rinfUri;
        if (typeof iri === "string") onSelectResourceRef.current(iri);
      });

      map.on("click", "tunnels-layer", (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const popup = new Popup().setLngLat(e.lngLat);
        popup
          .setDOMContent(
            buildTunnelPopup(feature.properties as Record<string, unknown>, (iri) => {
              popup.remove();
              onSelectResourceRef.current(iri);
            }),
          )
          .addTo(map);
      });

      map.on("click", "primary-locations-layer", (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const [lon, lat] = feature.geometry.coordinates;
        const popup = new Popup().setLngLat([lon, lat]);
        popup
          .setDOMContent(
            buildPrimaryLocationPopup(
              feature.properties as Record<string, unknown>,
              (iri) => {
                popup.remove();
                onSelectResourceRef.current(iri);
              },
            ),
          )
          .addTo(map);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      layersAddedRef.current = false;
    };
    // Sources are seeded once on load; updates are pushed via setData below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const source = mapRef.current?.getSource(OPERATIONAL_POINTS_SOURCE) as
      | GeoJSONSource
      | undefined;
    source?.setData(withOpTypeKey(operationalPoints));
  }, [operationalPoints]);

  useEffect(() => {
    const source = mapRef.current?.getSource(SECTIONS_OF_LINE_SOURCE) as
      | GeoJSONSource
      | undefined;
    source?.setData(sectionsOfLine);
  }, [sectionsOfLine]);

  useEffect(() => {
    const source = mapRef.current?.getSource(TUNNELS_SOURCE) as
      | GeoJSONSource
      | undefined;
    source?.setData(tunnels);
  }, [tunnels]);

  useEffect(() => {
    const source = mapRef.current?.getSource(PRIMARY_LOCATIONS_SOURCE) as
      | GeoJSONSource
      | undefined;
    source?.setData(primaryLocations);
  }, [primaryLocations]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && layersAddedRef.current) applyVisibility(map, hiddenLayers, openRailwayMap);
  }, [hiddenLayers, openRailwayMap]);

  useEffect(() => {
    if (!flyTo || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [flyTo.lon, flyTo.lat],
      zoom: flyTo.zoom ?? Math.max(mapRef.current.getZoom(), 12),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo?.nonce]);

  useEffect(() => {
    if (!mapRef.current?.getLayer("operational-points-layer")) return;
    mapRef.current.setFilter(
      "operational-points-layer",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hiddenOpTypeKeysFilterExpression(hiddenOpTypeKeys) as any,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenOpTypeKeys]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
