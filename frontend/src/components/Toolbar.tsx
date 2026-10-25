import { type CSSProperties, type ReactNode, useState } from "react";
import { LAYER_IDS, type LayerId } from "../routing/viewportUrl";

const LAYER_LABELS: Record<LayerId, string> = {
  "operational-points": "Operational points",
  "sections-of-line": "Sections of line",
  tunnels: "Tunnels",
  "primary-locations": "Primary locations",
};

export interface ExportAction {
  label: string;
  run: () => void;
}

interface Props {
  hiddenLayers: readonly LayerId[];
  onToggleLayer: (layer: LayerId) => void;
  openRailwayMap: boolean;
  onToggleOpenRailwayMap: () => void;
  exports: ExportAction[];
  onOpenDatasets: () => void;
  onOpenAbout: () => void;
}

const buttonStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontSize: 13,
  fontFamily: "sans-serif",
  background: "white",
  boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
  cursor: "pointer",
  textAlign: "left",
};

const menuStyle: CSSProperties = {
  position: "absolute",
  right: "calc(100% + 6px)",
  top: 0,
  background: "white",
  borderRadius: 6,
  boxShadow: "0 1px 6px rgba(0,0,0,0.2)",
  padding: 8,
  fontSize: 13,
  fontFamily: "sans-serif",
  minWidth: 200,
  zIndex: 16,
};

type Menu = "layers" | "export" | null;

function MenuButton({
  label,
  open,
  onClick,
  children,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div style={{ position: "relative" }}>
      <button style={{ ...buttonStyle, width: "100%" }} aria-expanded={open} onClick={onClick}>
        {label}
      </button>
      {open && <div style={menuStyle}>{children}</div>}
    </div>
  );
}

/** Top-right column of map tools, under the country selector. Menus open
 *  to the left so they never cover MapLibre's own zoom control. */
export function Toolbar({
  hiddenLayers,
  onToggleLayer,
  openRailwayMap,
  onToggleOpenRailwayMap,
  exports,
  onOpenDatasets,
  onOpenAbout,
}: Props) {
  const [menu, setMenu] = useState<Menu>(null);
  const toggle = (m: Exclude<Menu, null>) => setMenu((cur) => (cur === m ? null : m));

  return (
    <div
      style={{
        position: "absolute",
        // Just below the country selector (top: 100, ~40px tall closed),
        // which stacks above this when its list is open.
        top: 148,
        right: 12,
        zIndex: 15,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        width: 110,
      }}
    >
      <MenuButton label="Layers" open={menu === "layers"} onClick={() => toggle("layers")}>
        {LAYER_IDS.map((id) => (
          <label key={id} style={{ display: "flex", gap: 6, alignItems: "center", padding: "2px 0" }}>
            <input
              type="checkbox"
              checked={!hiddenLayers.includes(id)}
              onChange={() => onToggleLayer(id)}
            />
            {LAYER_LABELS[id]}
          </label>
        ))}
        <div style={{ borderTop: "1px solid #e5e7eb", margin: "6px 0" }} />
        <label style={{ display: "flex", gap: 6, alignItems: "center", padding: "2px 0" }}>
          <input type="checkbox" checked={openRailwayMap} onChange={onToggleOpenRailwayMap} />
          OpenRailwayMap overlay
        </label>
      </MenuButton>

      <MenuButton label="Export" open={menu === "export"} onClick={() => toggle("export")}>
        {exports.map((action) => (
          <button
            key={action.label}
            onClick={() => {
              action.run();
              setMenu(null);
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              border: "none",
              background: "none",
              padding: "4px 2px",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {action.label}
          </button>
        ))}
        <div style={{ color: "#6b7280", fontSize: 11, marginTop: 4 }}>
          What's loaded for the current country.
        </div>
      </MenuButton>

      <button style={buttonStyle} onClick={() => { setMenu(null); onOpenDatasets(); }}>
        Datasets
      </button>
      <button style={buttonStyle} onClick={() => { setMenu(null); onOpenAbout(); }}>
        About
      </button>
    </div>
  );
}
