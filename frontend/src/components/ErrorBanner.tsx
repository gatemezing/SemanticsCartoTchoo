interface Props {
  message: string;
  onRetry: () => void;
}

/** Deliberately styled very differently from the muted "not available in
 *  RINF" badges used inside entity details — this is an endpoint/network
 *  failure, not a data-completeness gap, and must read as an error. */
export function ErrorBanner({ message, onRetry }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fef2f2",
        zIndex: 10,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ color: "#b91c1c", fontWeight: 700, marginBottom: 6 }}>
          Couldn't reach the RINF data endpoint
        </div>
        <div style={{ color: "#7f1d1d", fontSize: 13, marginBottom: 12 }}>
          {message}
        </div>
        <button
          onClick={onRetry}
          style={{
            padding: "6px 14px",
            background: "#b91c1c",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}
