import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type {
  PrimaryLocationsCollection,
  TunnelsCollection,
} from "@carto-rinf/shared-types";
import {
  fetchCountries,
  fetchOperationalPoints,
  fetchPrimaryLocations,
  fetchSectionsOfLine,
  fetchTunnels,
} from "./api/client";
import { AboutDialog } from "./components/AboutDialog";
import { CountrySelector } from "./components/CountrySelector";
import { DatasetsDialog } from "./components/DatasetsDialog";
import { DetailPanel, type Selection } from "./components/DetailPanel";
import { ErrorBanner } from "./components/ErrorBanner";
import { Legend } from "./components/Legend";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { OptionalLayerWarning } from "./components/OptionalLayerWarning";
import { SearchBox } from "./components/SearchBox";
import { Toolbar, type ExportAction } from "./components/Toolbar";
import {
  combinedGeoJson,
  downloadText,
  operationalPointsCsv,
  sectionsOfLineCsv,
  tunnelsCsv,
} from "./export/download";
import { MapView, type FlyToTarget } from "./map/MapView";
import {
  DEFAULT_COUNTRY,
  DEFAULT_VIEWPORT,
  formatRoute,
  parseRoute,
  type LayerId,
  type RouteState,
  type ViewportState,
} from "./routing/viewportUrl";

const initialRoute = parseRoute(window.location.pathname, window.location.search);

const EMPTY_TUNNELS: TunnelsCollection = { type: "FeatureCollection", features: [] };
const EMPTY_PRIMARY_LOCATIONS: PrimaryLocationsCollection = {
  type: "FeatureCollection",
  features: [],
};

function selectionFromRoute(route: RouteState): Selection | null {
  if (route.uopid) return { kind: "operational-point", uopid: route.uopid };
  if (route.selectedIri) return { kind: "resource", iri: route.selectedIri };
  return null;
}

function sameSelection(a: Selection | null, b: Selection | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === "operational-point" && b.kind === "operational-point") {
    return a.uopid === b.uopid;
  }
  if (a.kind === "resource" && b.kind === "resource") return a.iri === b.iri;
  return false;
}

export function App() {
  const [country, setCountry] = useState(initialRoute.country ?? DEFAULT_COUNTRY);
  const [selection, setSelection] = useState<Selection | null>(
    selectionFromRoute(initialRoute),
  );
  const [hiddenLayers, setHiddenLayers] = useState<LayerId[]>(initialRoute.hiddenLayers);
  const [openRailwayMap, setOpenRailwayMap] = useState(initialRoute.openRailwayMap);
  const [dialog, setDialog] = useState<"datasets" | "about" | null>(null);
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);
  const [hiddenOpTypeKeys, setHiddenOpTypeKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const viewportRef = useRef<ViewportState>(
    initialRoute.viewport ?? DEFAULT_VIEWPORT,
  );
  const isFirstSelectionEffect = useRef(true);
  /** Set while applying a Back/Forward navigation, so the state changes it
   *  causes don't push a fresh history entry on top of the one we just
   *  moved to. */
  const applyingHistory = useRef(false);

  const countries = useQuery({ queryKey: ["countries"], queryFn: fetchCountries });
  const operationalPoints = useQuery({
    queryKey: ["operational-points", country],
    queryFn: () => fetchOperationalPoints(country),
  });
  const sectionsOfLine = useQuery({
    queryKey: ["sections-of-line", country],
    queryFn: () => fetchSectionsOfLine(country),
  });
  // Tunnels and primary locations are enhancement layers, not the core map —
  // some countries' primary-locations query is heavy enough to occasionally
  // exceed the RINF endpoint's own server-side timeout (confirmed live on
  // Germany: a 503 from the endpoint itself after ~120s, not something a
  // longer client timeout can wait out). Their failure degrades to "map
  // without that layer", not a full-page error blocking a country that's
  // otherwise working fine. No retry: a timeout this deterministic just
  // fails the same way again, and retrying only doubles how long the user
  // waits before seeing the "unavailable" note instead of a silent gap.
  const tunnels = useQuery({
    queryKey: ["tunnels", country],
    queryFn: () => fetchTunnels(country),
    retry: false,
  });
  const primaryLocations = useQuery({
    queryKey: ["primary-locations", country],
    queryFn: () => fetchPrimaryLocations(country),
    retry: false,
  });

  const coreQueries = [countries, operationalPoints, sectionsOfLine];
  const isLoading = coreQueries.some((q) => q.isLoading);
  const error = coreQueries.find((q) => q.error)?.error;
  const allLoaded = coreQueries.every((q) => q.data);

  const optionalLayerFailures = [
    tunnels.error && "Tunnels",
    primaryLocations.error && "Primary locations",
  ].filter((x): x is string => Boolean(x));

  const urlFor = (
    countryCode: string,
    viewport: ViewportState,
    sel: Selection | null,
    layers = hiddenLayers,
    orm = openRailwayMap,
  ) =>
    formatRoute(
      countryCode,
      viewport,
      sel?.kind === "operational-point" ? sel.uopid : null,
      {
        selectedIri: sel?.kind === "resource" ? sel.iri : null,
        hiddenLayers: layers,
        openRailwayMap: orm,
      },
    );

  // Viewport moves are frequent (every pan/zoom) — replace the current
  // history entry rather than push, so panning doesn't flood back/forward.
  // Layer toggles are view settings, not navigation, so they replace too.
  const handleViewportChange = (viewport: ViewportState) => {
    viewportRef.current = viewport;
    window.history.replaceState(null, "", urlFor(country, viewport, selection));
  };

  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      urlFor(country, viewportRef.current, selection, hiddenLayers, openRailwayMap),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenLayers, openRailwayMap]);

  const toggleOpTypeKeys = (keys: string[]) => {
    setHiddenOpTypeKeys((prev) => {
      const next = new Set(prev);
      const anyVisible = keys.some((k) => !next.has(k));
      // If some of this row's keys are shown and some hidden, one click
      // makes them all match (hide) rather than partially toggling.
      for (const k of keys) (anyVisible ? next.add(k) : next.delete(k));
      return next;
    });
  };

  const handleCountryChange = (newCode: string) => {
    setCountry(newCode);
    setSelection(null);
    // A type hidden in one country's legend shouldn't silently stay hidden
    // (and unexplained) after switching to a country where it's relevant.
    setHiddenOpTypeKeys(new Set());
    const info = countries.data?.find((c) => c.code === newCode);
    if (info) {
      // Set synchronously so the URL is right immediately, rather than
      // waiting for the flyTo animation's own moveend to update it.
      viewportRef.current = info.defaultViewport;
      setFlyTo({ ...info.defaultViewport, nonce: Date.now() });
    }
    window.history.pushState(
      null,
      "",
      urlFor(newCode, info?.defaultViewport ?? viewportRef.current, null),
    );
  };

  // Selecting/closing an entity is a discrete navigation, worth a
  // back-button stop — skip the very first run so mount doesn't push a
  // redundant duplicate of the URL we just parsed.
  useEffect(() => {
    if (isFirstSelectionEffect.current) {
      isFirstSelectionEffect.current = false;
      return;
    }
    if (applyingHistory.current) {
      applyingHistory.current = false;
      return;
    }
    window.history.pushState(null, "", urlFor(country, viewportRef.current, selection));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  useEffect(() => {
    const onPopState = () => {
      const route = parseRoute(window.location.pathname, window.location.search);
      const nextSelection = selectionFromRoute(route);
      setSelection((current) => {
        if (sameSelection(current, nextSelection)) return current;
        applyingHistory.current = true;
        return nextSelection;
      });
      if (route.country) setCountry(route.country);
      setHiddenLayers(route.hiddenLayers);
      setOpenRailwayMap(route.openRailwayMap);
      if (route.viewport) {
        viewportRef.current = route.viewport;
        setFlyTo({ ...route.viewport, nonce: Date.now() });
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const exports: ExportAction[] = [
    {
      label: "Operational points (CSV)",
      run: () =>
        operationalPoints.data &&
        downloadText(
          `rinf-${country}-operational-points.csv`,
          "text/csv",
          operationalPointsCsv(operationalPoints.data),
        ),
    },
    {
      label: "Sections of line (CSV)",
      run: () =>
        sectionsOfLine.data &&
        downloadText(
          `rinf-${country}-sections-of-line.csv`,
          "text/csv",
          sectionsOfLineCsv(sectionsOfLine.data),
        ),
    },
    ...(tunnels.data
      ? [
          {
            label: "Tunnels (CSV)",
            run: () =>
              downloadText(`rinf-${country}-tunnels.csv`, "text/csv", tunnelsCsv(tunnels.data)),
          },
        ]
      : []),
    {
      label: "All layers (GeoJSON)",
      run: () =>
        downloadText(
          `rinf-${country}.geojson`,
          "application/geo+json",
          combinedGeoJson({
            "operational-points": operationalPoints.data!,
            "sections-of-line": sectionsOfLine.data!,
            ...(tunnels.data && { tunnels: tunnels.data }),
            ...(primaryLocations.data && { "primary-locations": primaryLocations.data }),
          }),
        ),
    },
  ];

  const countryLabel =
    countries.data?.find((c) => c.code === country)?.label ?? country;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {allLoaded && (
        <>
          <MapView
            operationalPoints={operationalPoints.data!}
            sectionsOfLine={sectionsOfLine.data!}
            tunnels={tunnels.data ?? EMPTY_TUNNELS}
            primaryLocations={primaryLocations.data ?? EMPTY_PRIMARY_LOCATIONS}
            onSelectOperationalPoint={(uopid) =>
              setSelection({ kind: "operational-point", uopid })
            }
            onSelectResource={(iri) => setSelection({ kind: "resource", iri })}
            hiddenLayers={hiddenLayers}
            openRailwayMap={openRailwayMap}
            initialViewport={viewportRef.current}
            onViewportChange={handleViewportChange}
            flyTo={flyTo}
            hiddenOpTypeKeys={hiddenOpTypeKeys}
          />
          <SearchBox
            operationalPoints={operationalPoints.data!}
            onSelect={(uopid, lon, lat) => {
              setSelection({ kind: "operational-point", uopid });
              setFlyTo({ lon, lat, nonce: Date.now() });
            }}
          />
          <CountrySelector
            countries={countries.data!}
            value={country}
            onChange={handleCountryChange}
          />
          <Toolbar
            hiddenLayers={hiddenLayers}
            onToggleLayer={(layer) =>
              setHiddenLayers((h) =>
                h.includes(layer) ? h.filter((l) => l !== layer) : [...h, layer],
              )
            }
            openRailwayMap={openRailwayMap}
            onToggleOpenRailwayMap={() => setOpenRailwayMap((v) => !v)}
            exports={exports}
            onOpenDatasets={() => setDialog("datasets")}
            onOpenAbout={() => setDialog("about")}
          />
          <Legend
            operationalPoints={operationalPoints.data!}
            sectionsOfLine={sectionsOfLine.data!}
            tunnels={tunnels.data ?? EMPTY_TUNNELS}
            primaryLocations={primaryLocations.data ?? EMPTY_PRIMARY_LOCATIONS}
            hiddenOpTypeKeys={hiddenOpTypeKeys}
            onToggleOpTypeKeys={toggleOpTypeKeys}
          />
          {optionalLayerFailures.length > 0 && (
            <OptionalLayerWarning
              layers={optionalLayerFailures}
              onRetry={() => {
                tunnels.refetch();
                primaryLocations.refetch();
              }}
            />
          )}
          {selection && (
            <DetailPanel selection={selection} onClose={() => setSelection(null)} />
          )}
          {dialog === "datasets" && (
            <DatasetsDialog
              country={country}
              countryLabel={countryLabel}
              onClose={() => setDialog(null)}
            />
          )}
          {dialog === "about" && <AboutDialog onClose={() => setDialog(null)} />}
        </>
      )}
      {isLoading && <LoadingOverlay />}
      {error && !isLoading && (
        <ErrorBanner
          message={error instanceof Error ? error.message : String(error)}
          onRetry={() => coreQueries.forEach((q) => q.refetch())}
        />
      )}
    </div>
  );
}
