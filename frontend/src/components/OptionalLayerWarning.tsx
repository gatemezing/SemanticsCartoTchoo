interface Props {
  layers: string[];
  onRetry: () => void;
}

/** Distinct from ErrorBanner (which blocks the whole map): this is for a
 *  layer that failed but shouldn't stop the rest of the map from being
 *  useful — e.g. a country whose primary-locations query is heavy enough
 *  to occasionally exceed the RINF endpoint's own server-side timeout.
 *  Positioned by its container (the bottom-right stack in App). */
export function OptionalLayerWarning({ layers, onRetry }: Props) {
  return (
    <div
      style={{
        background: "var(--warning-bg)",
        border: "1px solid var(--warning-border)",
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 12,
        fontFamily: "sans-serif",
        color: "var(--warning-text)",
        maxWidth: 240,
      }}
    >
      <div>
        {layers.join(" and ")} unavailable right now (the RINF endpoint didn't
        respond in time for this country). The rest of the map is unaffected.
      </div>
      <button
        onClick={onRetry}
        style={{
          marginTop: 6,
          padding: "3px 8px",
          fontSize: 11,
          border: "1px solid var(--warning-border)",
          borderRadius: 4,
          background: "var(--surface)",
          color: "var(--warning-text)",
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}
