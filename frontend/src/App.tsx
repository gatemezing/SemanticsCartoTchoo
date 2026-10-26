import { useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  InfrastructureCollection,
  InfrastructureKind,
  LineProfile,
  PrimaryLocationsCollection,
  TrackParameterId,
  TunnelsCollection,
} from "@carto-rinf/shared-types";
import {
  fetchCountries,
  fetchInfrastructure,
  fetchOperationalPoints,
  fetchPrimaryLocations,
  fetchSectionParameters,
  fetchSectionsOfLine,
  fetchTunnels,
} from "./api/client";
import { AboutDialog } from "./components/AboutDialog";
import { ColourLegend } from "./components/ColourLegend";
import { CountrySelector } from "./components/CountrySelector";
import { DatasetsDialog } from "./components/DatasetsDialog";
import { DetailPanel, type Selection } from "./components/DetailPanel";
import { ErrorBanner } from "./components/ErrorBanner";
import { Legend } from "./components/Legend";
import { LineProfilePanel } from "./components/LineProfilePanel";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { OptionalLayerWarning } from "./components/OptionalLayerWarning";
import { SearchBox } from "./components/SearchBox";
import { Toolbar, type ExportAction, type InfrastructureStatus } from "./components/Toolbar";
import {
  combinedGeoJson,
  downloadText,
  operationalPointsCsv,
  sectionsOfLineCsv,
  tunnelsCsv,
} from "./export/download";
import { PARAMETER_LABELS, parameterValueText, scaleFor } from "./map/dataColors";
import { INFRA_LABELS } from "./map/infrastructureMarkers";
import { MapView, type FitBoundsTarget, type FlyToTarget } from "./map/MapView";
import {
  DEFAULT_COUNTRY,
  DEFAULT_VIEWPORT,
  formatRoute,
  parseRoute,
  type LayerId,
  type RouteState,
  type ViewportState,
} from "./routing/viewportUrl";
import {
  applyThemePreference,
  readThemePreference,
  type ThemePreference,
  useIsPhone,
  useResolvedTheme,
} from "./theme/theme";

const initialRoute = parseRoute(window.location.pathname, window.location.search);

const EMPTY_TUNNELS: TunnelsCollection = { type: "FeatureCollection", features: [] };
const EMPTY_PRIMARY_LOCATIONS: PrimaryLocationsCollection = {
  type: "FeatureCollection",
  features: [],
};
const NO_SECTIONS: string[] = [];

function selectionFromRoute(route: RouteState): Selection | null {
  if (route.uopid) return { kind: "operational-point", uopid: route.uopid };
  if (route.selectedIri) return { kind: "resource", iri: route.selectedIri };
  return null;
}

/** Sections and other resources share the `?sel=` IRI form, so they're
 *  the same selection whichever kind they were recorded as. */
function sameSelection(a: Selection | null, b: Selection | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === "operational-point" || b.kind === "operational-point") {
    return a.kind === b.kind && (a as { uopid: string }).uopid === (b as { uopid: string }).uopid;
  }
  return a.iri === b.iri;
}

/** [west, south, east, north] of the given features' coordinates. */
function boundsOf(geometries: GeoJSON.Geometry[]): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const visit = (pos: GeoJSON.Position) => {
    w = Math.min(w, pos[0]); e = Math.max(e, pos[0]);
    s = Math.min(s, pos[1]); n = Math.max(n, pos[1]);
  };
  for (const g of geometries) {
    if (g.type === "LineString") g.coordinates.forEach(visit);
    else if (g.type === "MultiLineString") g.coordinates.flat().forEach(visit);
  }
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

export function App() {
  const [country, setCountry] = useState(initialRoute.country ?? DEFAULT_COUNTRY);
  const [selection, setSelection] = useState<Selection | null>(
    selectionFromRoute(initialRoute),
  );
  const [hiddenLayers, setHiddenLayers] = useState<LayerId[]>(initialRoute.hiddenLayers);
  const [openRailwayMap, setOpenRailwayMap] = useState(initialRoute.openRailwayMap);
  const [shownInfrastructure, setShownInfrastructure] = useState<InfrastructureKind[]>(
    initialRoute.shownInfrastructure,
  );
  const [colourBy, setColourBy] = useState<TrackParameterId | null>(initialRoute.colourBy);
  const [lineProfileOpen, setLineProfileOpen] = useState(initialRoute.lineProfile !== null);
  const [lineIri, setLineIri] = useState<string | null>(initialRoute.lineProfile);
  const [lineProfile, setLineProfile] = useState<LineProfile | null>(null);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>(readThemePreference);
  const theme = useResolvedTheme(themePreference);
  const isPhone = useIsPhone();
  const [dialog, setDialog] = useState<"datasets" | "about" | null>(null);
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);
  const [fitBounds, setFitBounds] = useState<FitBoundsTarget | null>(null);
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
  /** The line whose bounds the map was last fitted to, so a profile is
   *  framed once when opened rather than on every re-render. */
  const fittedLine = useRef<string | null>(null);

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
  // their failure degrades to "map without that layer", not a full-page
  // error blocking a country that's otherwise working fine. No retry: a
  // server-side timeout just fails the same way again.
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
  // Opt-in layers: only fetched once switched on.
  const infrastructureQueries = useQueries({
    queries: shownInfrastructure.map((kind) => ({
      queryKey: ["infrastructure", kind, country],
      queryFn: () => fetchInfrastructure(kind, country),
      retry: false,
    })),
  });
  const sectionParameters = useQuery({
    queryKey: ["section-parameters", country, colourBy],
    queryFn: () => fetchSectionParameters(country, colourBy!),
    enabled: colourBy !== null,
    retry: false,
  });

  const coreQueries = [countries, operationalPoints, sectionsOfLine];
  const isLoading = coreQueries.some((q) => q.isLoading);
  const error = coreQueries.find((q) => q.error)?.error;
  const allLoaded = coreQueries.every((q) => q.data);

  const infrastructure = useMemo(() => {
    const result: Partial<Record<InfrastructureKind, InfrastructureCollection>> = {};
    shownInfrastructure.forEach((kind, i) => {
      const data = infrastructureQueries[i]?.data;
      if (data) result[kind] = data;
    });
    return result;
    // useQueries returns a new array each render; key on when each layer's
    // data last changed (a fixed-size dependency list, unlike spreading).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownInfrastructure, infrastructureQueries.map((q) => q.dataUpdatedAt).join(",")]);
  const infrastructureStatus: InfrastructureStatus = {};
  shownInfrastructure.forEach((kind, i) => {
    const q = infrastructureQueries[i];
    infrastructureStatus[kind] = q?.error ? "error" : q?.data ? q.data.features.length : "loading";
  });

  const optionalLayerFailures = [
    tunnels.error && "Tunnels",
    primaryLocations.error && "Primary locations",
    ...shownInfrastructure.map((kind) => infrastructureStatus[kind] === "error" && INFRA_LABELS[kind]),
  ].filter((x): x is string => Boolean(x));

  // "Colour by": one scale per (parameter data, theme), applied by IRI.
  const colourScale = useMemo(
    () => (sectionParameters.data ? scaleFor(sectionParameters.data, theme) : null),
    [sectionParameters.data, theme],
  );
  const sectionColourOf = useMemo(() => {
    const params = sectionParameters.data;
    if (!colourBy || !params || !colourScale) return null;
    return (iri: string) => colourScale.colourOf(params.values[iri]);
  }, [colourBy, sectionParameters.data, colourScale]);
  const sectionTooltip = useMemo(() => {
    const params = sectionParameters.data;
    if (!colourBy || !params) return null;
    const labels = Object.fromEntries(params.categories.map((c) => [c.value, c.label]));
    return (iri: string) =>
      `${PARAMETER_LABELS[colourBy]}: ${
        parameterValueText(colourBy, params.values[iri], labels) ?? "not available in RINF"
      }`;
  }, [colourBy, sectionParameters.data]);
  const colourLegendEntries = useMemo(() => {
    if (!colourScale || !sectionColourOf || !sectionsOfLine.data) return null;
    const counts = new Map<string, number>();
    for (const f of sectionsOfLine.data.features) {
      const key = sectionColourOf(f.properties.rinfUri).key;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return colourScale.entries.map((e) => ({ ...e, count: counts.get(e.key) ?? 0 }));
  }, [colourScale, sectionColourOf, sectionsOfLine.data]);

  const sectionIris = useMemo(
    () => new Set(sectionsOfLine.data?.features.map((f) => f.properties.rinfUri) ?? []),
    [sectionsOfLine.data],
  );
  // A selected IRI that's one of this country's sections gets the typed
  // section panel — including one opened from a shared `?sel=` link.
  const effectiveSelection: Selection | null =
    selection?.kind === "resource" && sectionIris.has(selection.iri)
      ? { kind: "section", iri: selection.iri }
      : selection;

  const profileSections = useMemo(
    () => lineProfile?.runs.flat().map((s) => s.rinfUri) ?? NO_SECTIONS,
    [lineProfile],
  );
  const highlightedSections = hoveredSection
    ? [hoveredSection]
    : lineProfileOpen
      ? profileSections
      : NO_SECTIONS;

  const handleProfile = useCallback(
    (profile: LineProfile | null) => {
      setLineProfile(profile);
      if (!profile || fittedLine.current === profile.line.iri || !sectionsOfLine.data) return;
      const wanted = new Set(profile.runs.flat().map((s) => s.rinfUri));
      const bounds = boundsOf(
        sectionsOfLine.data.features.filter((f) => wanted.has(f.properties.rinfUri)).map((f) => f.geometry),
      );
      if (bounds) {
        fittedLine.current = profile.line.iri;
        setFitBounds({ bounds, nonce: Date.now() });
      }
    },
    [sectionsOfLine.data],
  );

  const urlFor = (
    countryCode: string,
    viewport: ViewportState,
    sel: Selection | null,
  ) =>
    formatRoute(
      countryCode,
      viewport,
      sel?.kind === "operational-point" ? sel.uopid : null,
      {
        selectedIri: sel && sel.kind !== "operational-point" ? sel.iri : null,
        hiddenLayers,
        openRailwayMap,
        shownInfrastructure,
        colourBy,
        lineProfile: lineProfileOpen ? lineIri : null,
      },
    );

  // Viewport moves are frequent (every pan/zoom) — replace the current
  // history entry rather than push, so panning doesn't flood back/forward.
  // Layer, colour and profile settings are view settings, not navigation,
  // so they replace too.
  const handleViewportChange = (viewport: ViewportState) => {
    viewportRef.current = viewport;
    window.history.replaceState(null, "", urlFor(country, viewport, selection));
  };

  useEffect(() => {
    window.history.replaceState(null, "", urlFor(country, viewportRef.current, selection));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenLayers, openRailwayMap, shownInfrastructure, colourBy, lineProfileOpen, lineIri]);

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
    // National lines are per country.
    setLineIri(null);
    setLineProfileOpen(false);
    fittedLine.current = null;
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
      formatRoute(newCode, info?.defaultViewport ?? viewportRef.current, null, {
        hiddenLayers,
        openRailwayMap,
        shownInfrastructure,
        colourBy,
      }),
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
      setShownInfrastructure(route.shownInfrastructure);
      setColourBy(route.colourBy);
      setLineIri(route.lineProfile);
      setLineProfileOpen(route.lineProfile !== null);
      if (route.viewport) {
        viewportRef.current = route.viewport;
        setFlyTo({ ...route.viewport, nonce: Date.now() });
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const selectResource = (iri: string) => setSelection({ kind: "resource", iri });

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
            ...infrastructure,
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
            infrastructure={infrastructure}
            onSelectOperationalPoint={(uopid) =>
              setSelection({ kind: "operational-point", uopid })
            }
            onSelectResource={selectResource}
            hiddenLayers={hiddenLayers}
            openRailwayMap={openRailwayMap}
            theme={theme}
            sectionColourOf={sectionColourOf}
            sectionTooltip={sectionTooltip}
            highlightedSections={highlightedSections}
            initialViewport={viewportRef.current}
            onViewportChange={handleViewportChange}
            flyTo={flyTo}
            fitBounds={fitBounds}
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
            rightInset={effectiveSelection && !isPhone ? 360 : 0}
          />
          <Toolbar
            hiddenLayers={hiddenLayers}
            onToggleLayer={(layer) =>
              setHiddenLayers((h) =>
                h.includes(layer) ? h.filter((l) => l !== layer) : [...h, layer],
              )
            }
            shownInfrastructure={shownInfrastructure}
            infrastructureStatus={infrastructureStatus}
            onToggleInfrastructure={(kind) =>
              setShownInfrastructure((shown) =>
                shown.includes(kind) ? shown.filter((k) => k !== kind) : [...shown, kind],
              )
            }
            openRailwayMap={openRailwayMap}
            onToggleOpenRailwayMap={() => setOpenRailwayMap((v) => !v)}
            colourBy={colourBy}
            onColourBy={setColourBy}
            lineProfileOpen={lineProfileOpen}
            onToggleLineProfile={() => setLineProfileOpen((v) => !v)}
            exports={exports}
            onOpenDatasets={() => setDialog("datasets")}
            onOpenAbout={() => setDialog("about")}
            themePreference={themePreference}
            onThemePreference={(preference) => {
              applyThemePreference(preference);
              setThemePreference(preference);
            }}
            countryLabel={countryLabel}
            compact={isPhone}
            rightInset={effectiveSelection && !isPhone ? 360 : 0}
          />
          <Legend
            operationalPoints={operationalPoints.data!}
            sectionsOfLine={sectionsOfLine.data!}
            tunnels={tunnels.data ?? EMPTY_TUNNELS}
            primaryLocations={primaryLocations.data ?? EMPTY_PRIMARY_LOCATIONS}
            hiddenOpTypeKeys={hiddenOpTypeKeys}
            onToggleOpTypeKeys={toggleOpTypeKeys}
            infrastructure={infrastructure}
            sectionsColoured={sectionColourOf !== null}
          />
          {/* Under the search box: the colour key and layer warnings stay
              clear of the bottom, where the line profile opens. */}
          <div
            style={{
              position: "absolute",
              top: 60,
              left: 12,
              zIndex: 14,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxWidth: 240,
            }}
          >
            {colourBy && (
              <ColourLegend
                param={colourBy}
                entries={colourLegendEntries}
                loading={sectionParameters.isLoading}
                error={sectionParameters.error ? (sectionParameters.error as Error).message : null}
                onRetry={() => sectionParameters.refetch()}
                onClose={() => setColourBy(null)}
              />
            )}
            {optionalLayerFailures.length > 0 && (
              <OptionalLayerWarning
                layers={optionalLayerFailures}
                onRetry={() => {
                  tunnels.refetch();
                  primaryLocations.refetch();
                  infrastructureQueries.forEach((q) => q.error && q.refetch());
                }}
              />
            )}
          </div>
          {lineProfileOpen && (
            <LineProfilePanel
              country={country}
              lineIri={lineIri}
              onChangeLine={(iri) => {
                fittedLine.current = null;
                setLineIri(iri);
              }}
              onClose={() => {
                setLineProfileOpen(false);
                setHoveredSection(null);
              }}
              theme={theme}
              rightInset={effectiveSelection && !isPhone ? 360 : 0}
              onHoverSection={setHoveredSection}
              onSelectSection={selectResource}
              onProfile={handleProfile}
            />
          )}
          {effectiveSelection && (
            <DetailPanel
              selection={effectiveSelection}
              onClose={() => setSelection(null)}
              onOpenLineProfile={(iri) => {
                fittedLine.current = null;
                setLineIri(iri);
                setLineProfileOpen(true);
              }}
            />
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
