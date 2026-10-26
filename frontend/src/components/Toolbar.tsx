import { type CSSProperties, type ReactNode, useState } from "react";
import {
  INFRASTRUCTURE_KINDS,
  type InfrastructureKind,
  TRACK_PARAMETERS,
  type TrackParameterId,
} from "@carto-rinf/shared-types";
import { PARAMETER_LABELS } from "../map/dataColors";
import { INFRA_LABELS } from "../map/infrastructureMarkers";
import { LAYER_IDS, type LayerId } from "../routing/viewportUrl";
import type { ThemePreference } from "../theme/theme";
import { InfraShape } from "./Legend";

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

/** Per opt-in layer: undefined = not loaded yet, a number = features in
 *  this country, "error" = the layer failed. */
export type InfrastructureStatus = Partial<Record<InfrastructureKind, number | "loading" | "error">>;

interface Props {
  hiddenLayers: readonly LayerId[];
  onToggleLayer: (layer: LayerId) => void;
  shownInfrastructure: readonly InfrastructureKind[];
  infrastructureStatus: InfrastructureStatus;
  onToggleInfrastructure: (kind: InfrastructureKind) => void;
  openRailwayMap: boolean;
  onToggleOpenRailwayMap: () => void;
  colourBy: TrackParameterId | null;
  onColourBy: (param: TrackParameterId | null) => void;
  lineProfileOpen: boolean;
  onToggleLineProfile: () => void;
  exports: ExportAction[];
  onOpenDatasets: () => void;
  onOpenAbout: () => void;
  themePreference: ThemePreference;
  onThemePreference: (preference: ThemePreference) => void;
  countryLabel: string;
  /** Phone layout: everything behind one "Tools" button. */
  compact: boolean;
  /** Extra right offset (px) so the detail panel never covers the tools. */
  rightInset: number;
}

const buttonStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  fontSize: 13,
  fontFamily: "inherit",
  background: "var(--surface)",
  color: "var(--text)",
  boxShadow: "var(--shadow-sm)",
  cursor: "pointer",
  textAlign: "left",
};

const menuStyle: CSSProperties = {
  position: "absolute",
  right: "calc(100% + 6px)",
  top: 0,
  background: "var(--surface)",
  color: "var(--text)",
  borderRadius: 6,
  boxShadow: "var(--shadow-md)",
  padding: 8,
  fontSize: 13,
  minWidth: 230,
  zIndex: 16,
};

const rowStyle: CSSProperties = { display: "flex", gap: 6, alignItems: "center", padding: "2px 0" };

const groupTitle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: 0.3,
  margin: "8px 0 2px",
};

type Menu = "layers" | "colour" | "export" | "theme" | null;

function MenuButton({
  label,
  open,
  onClick,
  children,
  active = false,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <div style={{ position: "relative" }}>
      <button
        style={{
          ...buttonStyle,
          width: "100%",
          ...(active && { borderColor: "var(--accent)", background: "var(--accent-soft)" }),
        }}
        aria-expanded={open}
        onClick={onClick}
      >
        {label}
      </button>
      {open && <div style={menuStyle}>{children}</div>}
    </div>
  );
}

function statusText(status: InfrastructureStatus[InfrastructureKind], country: string): string {
  if (status === undefined) return "";
  if (status === "loading") return "loading…";
  if (status === "error") return "unavailable";
  return status === 0 ? `none in RINF for ${country}` : status.toLocaleString();
}

/** Top-right column of map tools, under the country selector. Menus open
 *  to the left so they never cover MapLibre's own zoom control. */
export function Toolbar(props: Props) {
  const [menu, setMenu] = useState<Menu>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const toggle = (m: Exclude<Menu, null>) => setMenu((cur) => (cur === m ? null : m));

  const layersContent = (
    <>
      {LAYER_IDS.map((id) => (
        <label key={id} style={rowStyle}>
          <input type="checkbox" checked={!props.hiddenLayers.includes(id)} onChange={() => props.onToggleLayer(id)} />
          {LAYER_LABELS[id]}
        </label>
      ))}
      <div style={groupTitle}>More infrastructure</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>
        Only some countries publish these to RINF.
      </div>
      {INFRASTRUCTURE_KINDS.map((kind) => {
        const on = props.shownInfrastructure.includes(kind);
        const status = on ? statusText(props.infrastructureStatus[kind], props.countryLabel) : "";
        return (
          <label key={kind} style={rowStyle}>
            <input type="checkbox" checked={on} onChange={() => props.onToggleInfrastructure(kind)} />
            <InfraShape kind={kind} />
            {INFRA_LABELS[kind]}
            {status && <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{status}</span>}
          </label>
        );
      })}
      <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "6px 0" }} />
      <label style={rowStyle}>
        <input type="checkbox" checked={props.openRailwayMap} onChange={props.onToggleOpenRailwayMap} />
        OpenRailwayMap overlay
      </label>
    </>
  );

  const colourContent = (
    <>
      {[null, ...TRACK_PARAMETERS].map((param) => (
        <label key={param ?? "none"} style={rowStyle}>
          <input
            type="radio"
            name="colour-by"
            checked={props.colourBy === param}
            onChange={() => props.onColourBy(param)}
          />
          {param ? PARAMETER_LABELS[param] : "Nothing (plain sections)"}
        </label>
      ))}
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, maxWidth: 220 }}>
        From each section's running tracks, read live from RINF.
      </div>
    </>
  );

  const exportContent = (
    <>
      {props.exports.map((action) => (
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
            color: "inherit",
            padding: "4px 2px",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          {action.label}
        </button>
      ))}
      <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 4 }}>
        What's loaded for the current country.
      </div>
    </>
  );

  const themeContent = (
    <>
      {(["auto", "light", "dark"] as ThemePreference[]).map((t) => (
        <label key={t} style={rowStyle}>
          <input
            type="radio"
            name="theme"
            checked={props.themePreference === t}
            onChange={() => props.onThemePreference(t)}
          />
          {t === "auto" ? "Same as system" : t === "light" ? "Light" : "Dark"}
        </label>
      ))}
    </>
  );

  if (props.compact) {
    return (
      <>
        <button
          style={{ ...buttonStyle, position: "absolute", top: 148, right: 12, zIndex: 15 }}
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen((v) => !v)}
        >
          ☰ Tools
        </button>
        {sheetOpen && (
          <div
            role="dialog"
            aria-label="Map tools"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: "70vh",
              overflowY: "auto",
              background: "var(--surface)",
              color: "var(--text)",
              borderRadius: "14px 14px 0 0",
              boxShadow: "var(--shadow-lg)",
              padding: "10px 16px 16px",
              zIndex: 25,
              fontSize: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Map tools</strong>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Close tools"
                style={{ border: "none", background: "none", fontSize: 20, color: "var(--text-muted)" }}
              >
                ×
              </button>
            </div>
            <div style={groupTitle}>Layers</div>
            {layersContent}
            <div style={groupTitle}>Colour sections by</div>
            {colourContent}
            <div style={groupTitle}>Tools</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button style={buttonStyle} onClick={() => { setSheetOpen(false); props.onToggleLineProfile(); }}>
                {props.lineProfileOpen ? "Close line profile" : "Line profile"}
              </button>
              <button style={buttonStyle} onClick={() => { setSheetOpen(false); props.onOpenDatasets(); }}>
                Datasets
              </button>
              <button style={buttonStyle} onClick={() => { setSheetOpen(false); props.onOpenAbout(); }}>
                About
              </button>
            </div>
            <div style={groupTitle}>Export</div>
            {exportContent}
            <div style={groupTitle}>Theme</div>
            {themeContent}
          </div>
        )}
      </>
    );
  }

  return (
    <div
      style={{
        // Just below the country selector (top: 100, ~40px tall closed),
        // which stacks above this when its list is open.
        position: "absolute",
        top: 148,
        right: 12 + props.rightInset,
        zIndex: 15,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        width: 118,
      }}
    >
      <MenuButton label="Layers" open={menu === "layers"} onClick={() => toggle("layers")}
        active={props.shownInfrastructure.length > 0}>
        {layersContent}
      </MenuButton>
      <MenuButton label="Colour by" open={menu === "colour"} onClick={() => toggle("colour")}
        active={props.colourBy !== null}>
        {colourContent}
      </MenuButton>
      <button
        style={{
          ...buttonStyle,
          ...(props.lineProfileOpen && { borderColor: "var(--accent)", background: "var(--accent-soft)" }),
        }}
        aria-pressed={props.lineProfileOpen}
        onClick={() => { setMenu(null); props.onToggleLineProfile(); }}
      >
        Line profile
      </button>
      <MenuButton label="Export" open={menu === "export"} onClick={() => toggle("export")}>
        {exportContent}
      </MenuButton>
      <button style={buttonStyle} onClick={() => { setMenu(null); props.onOpenDatasets(); }}>
        Datasets
      </button>
      <button style={buttonStyle} onClick={() => { setMenu(null); props.onOpenAbout(); }}>
        About
      </button>
      <MenuButton label="Theme" open={menu === "theme"} onClick={() => toggle("theme")}>
        {themeContent}
      </MenuButton>
    </div>
  );
}
