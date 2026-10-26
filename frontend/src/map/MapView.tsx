import {
  type ExpressionSpecification,
  GeoJSONSource,
  type MapLayerMouseEvent,
  MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { useEffect, useMemo, useRef } from "react";
import {
  INFRASTRUCTURE_KINDS,
  type InfrastructureCollection,
  type InfrastructureKind,
  type OperationalPointsCollection,
  type PrimaryLocationsCollection,
  type SectionOfLineCollection,
  type TunnelsCollection,
} from "@carto-rinf/shared-types";
import type { ResolvedTheme } from "../theme/theme";
import {
  CASING_COLOR,
  HIGHLIGHT_COLOR,
  INFRA_INK,
  type LegendEntry,
  NO_DATA_COLOR,
  SECTION_COLOR,
  TUNNEL_COLOR,
} from "./dataColors";
import {
  addInfrastructureIcons,
  iconId,
  markerPoints,
  shapeFeatures,
} from "./infrastructureMarkers";
import {
  hiddenOpTypeKeysFilterExpression,
  opTypeColorMatchExpression,
  withOpTypeKey,
} from "./opTypeColors";
import {
  buildInfrastructurePopup,
  buildPrimaryLocationPopup,
  buildTunnelPopup,
} from "./popupContent";
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

export interface FitBoundsTarget {
  /** [west, south, east, north] */
  bounds: [number, number, number, number];
  nonce: number;
}

// MapLibre's expression types are a large recursive union that literals
// built at runtime don't structurally match; this is the one cast point.
const expr = (value: unknown) => value as ExpressionSpecification;

const ORM_LAYER = "openrailwaymap";

/** OpenRailwayMap's raster overlay is an independent, OSM-derived view of
 *  the network — useful next to RINF's own section geometry to see where
 *  the real track runs. Off by default: its tile servers are free only for
 *  light, non-commercial use. */
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

const OPERATIONAL_POINTS_SOURCE = "operational-points";
const SECTIONS_OF_LINE_SOURCE = "sections-of-line";
const TUNNELS_SOURCE = "tunnels";
const PRIMARY_LOCATIONS_SOURCE = "primary-locations";
const infraPointsSource = (kind: InfrastructureKind) => `infra-${kind}-points`;
const infraShapesSource = (kind: InfrastructureKind) => `infra-${kind}-shapes`;
const infraMarkerLayer = (kind: InfrastructureKind) => `infra-${kind}-markers`;

/** The MapLibre layers that make up each user-facing layer toggle. */
const MAP_LAYERS: Record<LayerId, string[]> = {
  "operational-points": ["operational-points-layer"],
  "sections-of-line": [
    "sections-of-line-casing",
    "sections-of-line-layer",
    "sections-of-line-approx-layer",
    "sections-of-line-hit",
  ],
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

/** Paint that depends on the theme and on whether sections are coloured
 *  by a parameter. Applied on load and whenever either changes. */
function applyPaint(map: MapLibreMap, theme: ResolvedTheme, colouring: boolean): void {
  const set = (layer: string, prop: string, value: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (map.getLayer(layer)) map.setPaintProperty(layer, prop as any, value);
  };
  // The OSM raster has no dark variant: dimmed and desaturated instead, so
  // light-on-dark data marks read (validated against ≈ #2a2a28).
  set("osm", "raster-brightness-max", theme === "dark" ? 0.42 : 1);
  set("osm", "raster-saturation", theme === "dark" ? -0.55 : 0);
  set(ORM_LAYER, "raster-brightness-max", theme === "dark" ? 0.7 : 1);

  const sectionColor = colouring
    ? expr(["coalesce", ["get", "paramColor"], NO_DATA_COLOR])
    : SECTION_COLOR[theme];
  const sectionWidth = colouring
    ? expr(["case", ["==", ["get", "paramNoData"], true], 1.5, 3])
    : 1.5;
  for (const layer of ["sections-of-line-layer", "sections-of-line-approx-layer"]) {
    set(layer, "line-color", sectionColor);
    set(layer, "line-width", sectionWidth);
  }
  set("sections-of-line-casing", "line-color", CASING_COLOR[theme]);
  set("sections-of-line-casing", "line-opacity", colouring ? 0.9 : 0);
  set("sections-highlight", "line-color", HIGHLIGHT_COLOR[theme]);
  set("tunnels-layer", "line-color", TUNNEL_COLOR[theme]);
  set("operational-points-layer", "circle-stroke-color", CASING_COLOR[theme]);
  for (const kind of INFRASTRUCTURE_KINDS) {
    set(infraMarkerLayer(kind), "icon-color", INFRA_INK[theme]);
    set(infraMarkerLayer(kind), "icon-halo-color", CASING_COLOR[theme]);
    set(`infra-${kind}-lines`, "line-color", INFRA_INK[theme]);
    set(`infra-${kind}-outlines`, "line-color", INFRA_INK[theme]);
  }
}

/** Sections with their parameter colour folded into flat properties (a
 *  `match`/`get` expression can't reach into nested objects). */
function withSectionColours(
  collection: SectionOfLineCollection,
  colourOf: ((iri: string) => LegendEntry) | null,
): GeoJSON.FeatureCollection {
  if (!colourOf) return collection;
  return {
    type: "FeatureCollection",
    features: collection.features.map((f) => {
      const entry = colourOf(f.properties.rinfUri);
      return {
        ...f,
        properties: {
          ...f.properties,
          paramColor: entry.color,
          paramNoData: entry.key === "__nodata__",
        },
      };
    }),
  };
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

interface Props {
  operationalPoints: OperationalPointsCollection;
  sectionsOfLine: SectionOfLineCollection;
  tunnels: TunnelsCollection;
  primaryLocations: PrimaryLocationsCollection;
  /** Loaded opt-in infrastructure layers; absent kinds are drawn empty. */
  infrastructure: Partial<Record<InfrastructureKind, InfrastructureCollection>>;
  onSelectOperationalPoint: (uopid: string) => void;
  /** Any other clickable entity, by its RINF IRI (opens the Describe view). */
  onSelectResource: (iri: string) => void;
  hiddenLayers: readonly LayerId[];
  openRailwayMap: boolean;
  theme: ResolvedTheme;
  /** Section colour when "colour by" is on (memoised by the caller);
   *  null = the plain section style. */
  sectionColourOf: ((iri: string) => LegendEntry) | null;
  /** Hover text for a section while colouring ("Maximum speed: 160 km/h"). */
  sectionTooltip: ((iri: string) => string | null) | null;
  /** Sections drawn with a highlight halo (the open line profile). */
  highlightedSections: readonly string[];
  initialViewport: ViewportState;
  onViewportChange: (viewport: ViewportState) => void;
  flyTo: FlyToTarget | null;
  fitBounds: FitBoundsTarget | null;
  hiddenOpTypeKeys: Set<string>;
}

export function MapView({
  operationalPoints,
  sectionsOfLine,
  tunnels,
  primaryLocations,
  infrastructure,
  onSelectOperationalPoint,
  onSelectResource,
  hiddenLayers,
  openRailwayMap,
  theme,
  sectionColourOf,
  sectionTooltip,
  highlightedSections,
  initialViewport,
  onViewportChange,
  flyTo,
  fitBounds,
  hiddenOpTypeKeys,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelectOperationalPoint);
  onSelectRef.current = onSelectOperationalPoint;
  const onSelectResourceRef = useRef(onSelectResource);
  onSelectResourceRef.current = onSelectResource;
  const tooltipRef = useRef(sectionTooltip);
  tooltipRef.current = sectionTooltip;
  // Read on load, so state set before the map finished loading (or from
  // the URL) still applies to layers added in the load handler.
  const latest = useRef({ hiddenLayers, openRailwayMap, theme, colouring: false });
  latest.current = { hiddenLayers, openRailwayMap, theme, colouring: sectionColourOf !== null };
  // Not map.isStyleLoaded(): that also turns false while tiles are still
  // loading, which would silently drop a change made mid-load.
  const layersAddedRef = useRef(false);
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  const sectionsData = useMemo(
    () => withSectionColours(sectionsOfLine, sectionColourOf),
    [sectionsOfLine, sectionColourOf],
  );
  const sectionsDataRef = useRef(sectionsData);
  sectionsDataRef.current = sectionsData;
  const infrastructureRef = useRef(infrastructure);
  infrastructureRef.current = infrastructure;

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
      addInfrastructureIcons(map);

      // Layer order, bottom to top: highlight halo, sections (casing, real
      // geometry, straight-line stand-ins), tunnels, infrastructure shapes,
      // primary-location rings, infrastructure markers, and operational
      // points on top so their dot is never hidden.
      map.addSource(SECTIONS_OF_LINE_SOURCE, { type: "geojson", data: sectionsDataRef.current });
      map.addLayer({
        id: "sections-highlight",
        type: "line",
        source: SECTIONS_OF_LINE_SOURCE,
        filter: expr(["in", ["get", "rinfUri"], ["literal", []]]),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-width": 9, "line-opacity": 0.4 },
      });
      // The 2px surface ring under coloured sections (relief for the
      // lighter palette slots against the basemap).
      map.addLayer({
        id: "sections-of-line-casing",
        type: "line",
        source: SECTIONS_OF_LINE_SOURCE,
        filter: expr(["!=", ["get", "paramNoData"], true]),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-width": 5, "line-opacity": 0 },
      });
      // Real track alignment where the provider gives one: solid.
      map.addLayer({
        id: "sections-of-line-layer",
        type: "line",
        source: SECTIONS_OF_LINE_SOURCE,
        filter: expr(["!=", ["get", "geometryIsApproximate"], true]),
        layout: { "line-join": "round" },
        paint: {},
      });
      // Dashed = only the straight line between the two endpoints: RINF
      // has no real alignment for this section. Shown as such, not hidden.
      map.addLayer({
        id: "sections-of-line-approx-layer",
        type: "line",
        source: SECTIONS_OF_LINE_SOURCE,
        filter: expr(["==", ["get", "geometryIsApproximate"], true]),
        paint: { "line-dasharray": [2, 2] },
      });
      // A 1.5px line is nearly impossible to hit with a pointer (worse on
      // touch), so clicks and hovers go to this invisible, wider copy.
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
        // Solid: a tunnel's line really is its portal-to-portal geometry.
        paint: { "line-width": 3 },
      });

      for (const kind of INFRASTRUCTURE_KINDS) {
        map.addSource(infraShapesSource(kind), { type: "geojson", data: EMPTY });
        // Bridges as lines, and footprints (Austrian switches and level
        // crossings) as outlines — only once zoomed in enough to see them.
        map.addLayer({
          id: `infra-${kind}-lines`,
          type: "line",
          source: infraShapesSource(kind),
          minzoom: 12,
          filter: expr(["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]]),
          paint: { "line-width": 4 },
        });
        map.addLayer({
          id: `infra-${kind}-outlines`,
          type: "line",
          source: infraShapesSource(kind),
          minzoom: 15,
          filter: expr(["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]]),
          paint: { "line-width": 1.5 },
        });
      }

      map.addSource(PRIMARY_LOCATIONS_SOURCE, { type: "geojson", data: primaryLocations });
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
          // dot. Rings with Wikidata-sourced accessibility data recolor to
          // gold (see Legend for what each ring color means).
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 9],
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": expr(["case", ["has", "wikidata"], "#d97706", "#7c3aed"]),
          "circle-stroke-width": expr(["case", ["has", "wikidata"], 2.5, 1.5]),
          "circle-stroke-opacity": expr(["case", ["has", "wikidata"], 0.9, 0.55]),
        },
      });

      for (const kind of INFRASTRUCTURE_KINDS) {
        map.addSource(infraPointsSource(kind), { type: "geojson", data: EMPTY });
        map.addLayer({
          id: infraMarkerLayer(kind),
          type: "symbol",
          source: infraPointsSource(kind),
          // Thousands per country (5,291 Norwegian signals): from regional
          // zoom on.
          minzoom: 9,
          layout: {
            "icon-image": iconId(kind),
            "icon-size": expr(["interpolate", ["linear"], ["zoom"], 9, 0.45, 14, 0.8]),
            "icon-allow-overlap": true,
          },
          paint: { "icon-halo-width": 1.5 },
        });
      }

      map.addSource(OPERATIONAL_POINTS_SOURCE, {
        type: "geojson",
        data: withOpTypeKey(operationalPoints),
      });
      map.addLayer({
        id: "operational-points-layer",
        type: "circle",
        source: OPERATIONAL_POINTS_SOURCE,
        filter: expr(hiddenOpTypeKeysFilterExpression(hiddenOpTypeKeys)),
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2, 12, 6],
          "circle-color": expr(opTypeColorMatchExpression()),
          "circle-stroke-width": 1,
        },
      });

      applyVisibility(map, latest.current.hiddenLayers, latest.current.openRailwayMap);
      applyPaint(map, latest.current.theme, latest.current.colouring);
      layersAddedRef.current = true;
      // Data that arrived before the map finished loading.
      setInfrastructureData(map, infrastructureRef.current);

      const markerLayers = INFRASTRUCTURE_KINDS.map(infraMarkerLayer);
      const aboveSections = [
        "operational-points-layer",
        "tunnels-layer",
        "primary-locations-layer",
        ...markerLayers,
      ];
      for (const layerId of [...aboveSections, "sections-of-line-hit"]) {
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      }

      map.on("click", "operational-points-layer", (e: MapLayerMouseEvent) => {
        const uopid = e.features?.[0]?.properties?.uopid;
        if (typeof uopid === "string") onSelectRef.current(uopid);
      });

      const isAbove = (e: MapLayerMouseEvent) =>
        map.queryRenderedFeatures(e.point, {
          layers: aboveSections.filter(
            (id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none",
          ),
        }).length > 0;

      // Sections sit under everything else; a click that also lands on a
      // point, tunnel or marker belongs to that feature, not the line.
      map.on("click", "sections-of-line-hit", (e: MapLayerMouseEvent) => {
        if (isAbove(e)) return;
        const iri = e.features?.[0]?.properties?.rinfUri;
        if (typeof iri === "string") onSelectResourceRef.current(iri);
      });

      // While colouring, hovering a section says its value — the colour is
      // never the only way to read it.
      const hover = new Popup({ closeButton: false, closeOnClick: false, offset: 10 });
      map.on("mousemove", "sections-of-line-hit", (e: MapLayerMouseEvent) => {
        const tooltip = tooltipRef.current;
        const iri = e.features?.[0]?.properties?.rinfUri;
        const text = tooltip && typeof iri === "string" && !isAbove(e) ? tooltip(iri) : null;
        if (!text) {
          hover.remove();
          return;
        }
        hover.setLngLat(e.lngLat).setText(text).addTo(map);
      });
      map.on("mouseleave", "sections-of-line-hit", () => hover.remove());

      const openPopup = (
        lngLat: [number, number] | MapLayerMouseEvent["lngLat"],
        build: (onExplore: (iri: string) => void) => HTMLElement,
      ) => {
        const popup = new Popup().setLngLat(lngLat);
        popup
          .setDOMContent(
            build((iri) => {
              popup.remove();
              onSelectResourceRef.current(iri);
            }),
          )
          .addTo(map);
      };

      map.on("click", "tunnels-layer", (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        openPopup(e.lngLat, (explore) =>
          buildTunnelPopup(feature.properties as Record<string, unknown>, explore),
        );
      });

      map.on("click", "primary-locations-layer", (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const [lon, lat] = feature.geometry.coordinates;
        openPopup([lon, lat], (explore) =>
          buildPrimaryLocationPopup(feature.properties as Record<string, unknown>, explore),
        );
      });

      for (const layer of markerLayers) {
        map.on("click", layer, (e: MapLayerMouseEvent) => {
          const feature = e.features?.[0];
          if (!feature || feature.geometry.type !== "Point") return;
          const [lon, lat] = feature.geometry.coordinates;
          openPopup([lon, lat], (explore) =>
            buildInfrastructurePopup(feature.properties as Record<string, unknown>, explore),
          );
        });
      }
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
    const map = mapRef.current;
    if (map && layersAddedRef.current) setInfrastructureData(map, infrastructure);
  }, [infrastructure]);

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
    source?.setData(sectionsData);
  }, [sectionsData]);

  useEffect(() => {
    const source = mapRef.current?.getSource(TUNNELS_SOURCE) as GeoJSONSource | undefined;
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

  const colouring = sectionColourOf !== null;
  useEffect(() => {
    const map = mapRef.current;
    if (map && layersAddedRef.current) applyPaint(map, theme, colouring);
  }, [theme, colouring]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersAddedRef.current || !map.getLayer("sections-highlight")) return;
    map.setFilter(
      "sections-highlight",
      expr(["in", ["get", "rinfUri"], ["literal", [...highlightedSections]]]),
    );
  }, [highlightedSections]);

  useEffect(() => {
    if (!flyTo || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [flyTo.lon, flyTo.lat],
      zoom: flyTo.zoom ?? Math.max(mapRef.current.getZoom(), 12),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo?.nonce]);

  useEffect(() => {
    if (!fitBounds || !mapRef.current) return;
    const [w, s, e, n] = fitBounds.bounds;
    mapRef.current.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      // Leave room for the line-profile panel along the bottom.
      { padding: { top: 60, right: 60, bottom: 300, left: 60 }, maxZoom: 13 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitBounds?.nonce]);

  useEffect(() => {
    if (!mapRef.current?.getLayer("operational-points-layer")) return;
    mapRef.current.setFilter(
      "operational-points-layer",
      expr(hiddenOpTypeKeysFilterExpression(hiddenOpTypeKeys)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenOpTypeKeys]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}

function setInfrastructureData(
  map: MapLibreMap,
  infrastructure: Partial<Record<InfrastructureKind, InfrastructureCollection>>,
): void {
  for (const kind of INFRASTRUCTURE_KINDS) {
    const collection = infrastructure[kind];
    (map.getSource(infraPointsSource(kind)) as GeoJSONSource | undefined)?.setData(
      collection ? markerPoints(collection) : EMPTY,
    );
    (map.getSource(infraShapesSource(kind)) as GeoJSONSource | undefined)?.setData(
      collection ? shapeFeatures(collection) : EMPTY,
    );
  }
}
