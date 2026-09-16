import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  fetchOperationalPoints,
  fetchPrimaryLocations,
  fetchSectionsOfLine,
  fetchTunnels,
} from "./api/client";
import { DetailPanel } from "./components/DetailPanel";
import { ErrorBanner } from "./components/ErrorBanner";
import { Legend } from "./components/Legend";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { SearchBox } from "./components/SearchBox";
import { MapView, type FlyToTarget } from "./map/MapView";
import {
  DEFAULT_VIEWPORT,
  formatRoute,
  parseRoute,
  type ViewportState,
} from "./routing/viewportUrl";

const initialRoute = parseRoute(window.location.pathname);

export function App() {
  const [selectedUopid, setSelectedUopid] = useState<string | null>(
    initialRoute.uopid,
  );
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);
  const viewportRef = useRef<ViewportState>(
    initialRoute.viewport ?? DEFAULT_VIEWPORT,
  );
  const isFirstSelectionEffect = useRef(true);

  const operationalPoints = useQuery({
    queryKey: ["operational-points"],
    queryFn: fetchOperationalPoints,
  });
  const sectionsOfLine = useQuery({
    queryKey: ["sections-of-line"],
    queryFn: fetchSectionsOfLine,
  });
  const tunnels = useQuery({
    queryKey: ["tunnels"],
    queryFn: fetchTunnels,
  });
  const primaryLocations = useQuery({
    queryKey: ["primary-locations"],
    queryFn: fetchPrimaryLocations,
  });

  const queries = [operationalPoints, sectionsOfLine, tunnels, primaryLocations];
  const isLoading = queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.error)?.error;
  const allLoaded = queries.every((q) => q.data);

  // Viewport moves are frequent (every pan/zoom) — replace the current
  // history entry rather than push, so panning doesn't flood back/forward.
  const handleViewportChange = (viewport: ViewportState) => {
    viewportRef.current = viewport;
    window.history.replaceState(null, "", formatRoute(viewport, selectedUopid));
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
      formatRoute(viewportRef.current, selectedUopid),
    );
  }, [selectedUopid]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {allLoaded && (
        <>
          <MapView
            operationalPoints={operationalPoints.data!}
            sectionsOfLine={sectionsOfLine.data!}
            tunnels={tunnels.data!}
            primaryLocations={primaryLocations.data!}
            onSelectOperationalPoint={setSelectedUopid}
            initialViewport={viewportRef.current}
            onViewportChange={handleViewportChange}
            flyTo={flyTo}
          />
          <SearchBox
            operationalPoints={operationalPoints.data!}
            onSelect={(uopid, lon, lat) => {
              setSelectedUopid(uopid);
              setFlyTo({ lon, lat, nonce: Date.now() });
            }}
          />
          <Legend />
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
          onRetry={() => queries.forEach((q) => q.refetch())}
        />
      )}
    </div>
  );
}
