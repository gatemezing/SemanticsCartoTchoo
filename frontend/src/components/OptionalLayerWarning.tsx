interface Props {
  layers: string[];
  onRetry: () => void;
}

/** Distinct from ErrorBanner (which blocks the whole map): this is for a
 *  layer that failed but shouldn't stop the rest of the map from being
 *  useful — e.g. a country whose primary-locations query is heavy enough
 *  to occasionally exceed the RINF endpoint's own server-side timeout. */
export function OptionalLayerWarning({ layers, onRetry }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        right: 12,
        zIndex: 15,
        background: "#fef3c7",
        border: "1px solid #f59e0b",
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 12,
        fontFamily: "sans-serif",
        color: "#78350f",
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
          border: "1px solid #f59e0b",
          borderRadius: 4,
          background: "white",
          color: "#78350f",
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}
