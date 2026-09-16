export function LoadingOverlay() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255,255,255,0.7)",
        zIndex: 10,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div>Loading French railway infrastructure from RINF…</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
          First load can take up to a minute — the RINF endpoint is queried
          live and then cached.
        </div>
      </div>
    </div>
  );
}
