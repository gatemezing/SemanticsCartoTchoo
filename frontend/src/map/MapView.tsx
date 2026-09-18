import {
  GeoJSONSource,
  type MapLayerMouseEvent,
  MapLibreMap,
  NavigationControl,
  Popup,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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
import type { ViewportState } from "../routing/viewportUrl";

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

const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};

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
  initialViewport,
  onViewportChange,
  flyTo,
  hiddenOpTypeKeys,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelectOperationalPoint);
  onSelectRef.current = onSelectOperationalPoint;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: OSM_STYLE,
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

      const interactiveLayers = [
        "operational-points-layer",
        "tunnels-layer",
        "primary-locations-layer",
      ];
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

      map.on("click", "tunnels-layer", (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        new Popup()
          .setLngLat(e.lngLat)
          .setDOMContent(
            buildTunnelPopup(feature.properties as Record<string, unknown>),
          )
          .addTo(map);
      });

      map.on("click", "primary-locations-layer", (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const [lon, lat] = feature.geometry.coordinates;
        new Popup()
          .setLngLat([lon, lat])
          .setDOMContent(
            buildPrimaryLocationPopup(
              feature.properties as Record<string, unknown>,
            ),
          )
          .addTo(map);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
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
