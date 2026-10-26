export function LoadingOverlay() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface-translucent)",
        zIndex: 10,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div>Loading railway infrastructure from RINF…</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          First load can take up to a minute — the RINF endpoint is queried
          live and then cached.
        </div>
      </div>
    </div>
  );
}
