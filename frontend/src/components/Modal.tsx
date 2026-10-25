import { type ReactNode, useEffect } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Centered dialog over the map; closes on Escape or a click outside. */
export function Modal({ title, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(17,24,39,0.35)",
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          width: "100%",
          maxWidth: 760,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          fontFamily: "sans-serif",
          color: "#1f2937",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <h2 style={{ fontSize: 16, margin: 0 }}>{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "#6b7280" }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: 16, overflowY: "auto", fontSize: 13 }}>{children}</div>
      </div>
    </div>
  );
}
