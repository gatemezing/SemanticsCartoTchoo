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
import { CountrySelector } from "./components/CountrySelector";
import { DetailPanel } from "./components/DetailPanel";
import { ErrorBanner } from "./components/ErrorBanner";
import { Legend } from "./components/Legend";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { OptionalLayerWarning } from "./components/OptionalLayerWarning";
import { SearchBox } from "./components/SearchBox";
import { MapView, type FlyToTarget } from "./map/MapView";
import {
  DEFAULT_COUNTRY,
  DEFAULT_VIEWPORT,
  formatRoute,
  parseRoute,
  type ViewportState,
} from "./routing/viewportUrl";

const initialRoute = parseRoute(window.location.pathname);

const EMPTY_TUNNELS: TunnelsCollection = { type: "FeatureCollection", features: [] };
const EMPTY_PRIMARY_LOCATIONS: PrimaryLocationsCollection = {
  type: "FeatureCollection",
  features: [],
};

export function App() {
  const [country, setCountry] = useState(initialRoute.country ?? DEFAULT_COUNTRY);
  const [selectedUopid, setSelectedUopid] = useState<string | null>(
    initialRoute.uopid,
  );
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);
  const [hiddenOpTypeKeys, setHiddenOpTypeKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const viewportRef = useRef<ViewportState>(
    initialRoute.viewport ?? DEFAULT_VIEWPORT,
  );
  const isFirstSelectionEffect = useRef(true);

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

  // Viewport moves are frequent (every pan/zoom) — replace the current
  // history entry rather than push, so panning doesn't flood back/forward.
  const handleViewportChange = (viewport: ViewportState) => {
    viewportRef.current = viewport;
    window.history.replaceState(
      null,
      "",
      formatRoute(country, viewport, selectedUopid),
    );
  };

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
    setSelectedUopid(null);
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
      formatRoute(newCode, info?.defaultViewport ?? viewportRef.current, null),
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
    window.history.pushState(
      null,
      "",
      formatRoute(country, viewportRef.current, selectedUopid),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUopid]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {allLoaded && (
        <>
          <MapView
            operationalPoints={operationalPoints.data!}
            sectionsOfLine={sectionsOfLine.data!}
            tunnels={tunnels.data ?? EMPTY_TUNNELS}
            primaryLocations={primaryLocations.data ?? EMPTY_PRIMARY_LOCATIONS}
            onSelectOperationalPoint={setSelectedUopid}
            initialViewport={viewportRef.current}
            onViewportChange={handleViewportChange}
            flyTo={flyTo}
            hiddenOpTypeKeys={hiddenOpTypeKeys}
          />
          <SearchBox
            operationalPoints={operationalPoints.data!}
            onSelect={(uopid, lon, lat) => {
              setSelectedUopid(uopid);
              setFlyTo({ lon, lat, nonce: Date.now() });
            }}
          />
          <CountrySelector
            countries={countries.data!}
            value={country}
            onChange={handleCountryChange}
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
          {selectedUopid && (
            <DetailPanel
              uopid={selectedUopid}
              onClose={() => setSelectedUopid(null)}
            />
          )}
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
