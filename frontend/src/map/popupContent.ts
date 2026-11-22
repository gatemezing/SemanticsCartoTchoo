import type {
  FieldValue,
  InfrastructureKind,
  RinfLink,
  PrimaryLocationProperties,
  TunnelProperties,
  WikidataStationInfo,
  WikidataStructureInfo,
} from "@carto-rinf/shared-types";
import {
  describeFieldValue,
  fieldValueLabel,
  parseMaybeJson,
  linkFieldValueLabel,
} from "../components/fieldValueText";
import { compactIri } from "../rdf/prefixes";
import { safeHref } from "../security/safeHref";

function row(label: string, valueText: string, isMuted: boolean): HTMLElement {
  const el = document.createElement("div");
  el.style.marginBottom = "4px";
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  el.appendChild(strong);
  const span = document.createElement("span");
  span.textContent = valueText;
  if (isMuted) {
    span.style.color = "var(--text-subtle)";
    span.style.fontStyle = "italic";
  }
  el.appendChild(span);
  return el;
}

/** Renders nothing for a non-http(s) URI — the values come from RINF and
 *  Wikidata, and `a.href = "javascript:…"` would run on click. */
function link(href: string, text: string): HTMLElement {
  const safe = safeHref(href);
  if (!safe) return document.createElement("span");
  const a = document.createElement("a");
  a.href = safe;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = text;
  a.style.display = "block";
  a.style.marginTop = "6px";
  return a;
}

/** Opens the entity in the side panel's Describe view — the popup only
 *  shows a summary, the panel every triple RINF has for it. */
function exploreButton(onClick: () => void): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Explore in RINF graph →";
  button.style.display = "block";
  button.style.marginTop = "6px";
  button.style.padding = "0";
  button.style.border = "none";
  button.style.background = "none";
  button.style.color = "var(--link)";
  button.style.cursor = "pointer";
  button.style.font = "inherit";
  button.addEventListener("click", onClick);
  return button;
}

export function buildTunnelPopup(
  rawProperties: Record<string, unknown>,
  onExplore: (iri: string) => void,
): HTMLElement {
  const props: TunnelProperties = {
    rinfUri: rawProperties.rinfUri as string,
    name: parseMaybeJson(rawProperties.name),
    lengthMetres: parseMaybeJson(rawProperties.lengthMetres),
    wikidata: parseMaybeJson(rawProperties.wikidata),
  };

  const container = document.createElement("div");
  container.style.fontSize = "13px";
  container.style.minWidth = "200px";

  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.style.marginBottom = "6px";
  title.textContent = fieldValueLabel(props.name);
  container.appendChild(title);

  const lengthText = describeFieldValue(
    props.lengthMetres,
    (v) => `${v.toLocaleString()} m`,
  );
  container.appendChild(
    row("Length", lengthText, props.lengthMetres.status !== "value"),
  );

  container.appendChild(link(props.rinfUri, "View RINF record →"));
  container.appendChild(exploreButton(() => onExplore(props.rinfUri)));
  if (props.wikidata) container.appendChild(buildStructureSection(props.wikidata));
  return container;
}

/** Renders only the fields Wikidata actually has (never a "not available"
 *  placeholder — this is optional third-party enrichment, not a RINF
 *  completeness contract), visually set apart from the RINF-sourced rows
 *  above, and always ending in a link back to the source item: no
 *  Wikidata-derived fact is shown here without a way to trace it back. */
function buildWikidataSection(wikidata: WikidataStationInfo): HTMLElement {
  const section = document.createElement("div");
  section.style.marginTop = "8px";
  section.style.paddingTop = "8px";
  section.style.borderTop = "1px solid var(--border-subtle)";

  const header = document.createElement("div");
  header.style.fontWeight = "700";
  header.style.color = "var(--wikidata)";
  header.style.marginBottom = "4px";
  header.textContent = `From Wikidata${wikidata.label ? `: ${wikidata.label}` : ""}`;
  section.appendChild(header);

  if (wikidata.wheelchairAccessibility) {
    section.appendChild(
      row("Wheelchair accessibility", wikidata.wheelchairAccessibility, false),
    );
  }
  const wifi = wifiRow(wikidata.wifi);
  if (wifi) section.appendChild(row(wifi.label, wifi.text, false));
  if (wikidata.platformCount !== undefined) {
    section.appendChild(
      row("Platforms", String(wikidata.platformCount), false),
    );
  }

  const matched = matchedOnText(wikidata);
  if (matched) section.appendChild(row("Matched on", matched, true));
  section.appendChild(entityIriRow("Wikidata entity", wikidata.sourceUrl));
  return section;
}

/** Wikidata's Wi-Fi access (P2848) as a plain answer to "is there free
 *  Wi-Fi?". Older cached data held the raw label (e.g. "gratis"): shown as is. */
function wifiRow(wifi: string | undefined): { label: string; text: string } | null {
  switch (wifi) {
    case undefined:
      return null;
    case "free":
      return { label: "Free Wi-Fi", text: "yes" };
    case "paid":
      return { label: "Free Wi-Fi", text: "no (paid Wi-Fi)" };
    case "none":
      return { label: "Free Wi-Fi", text: "no Wi-Fi" };
    case "available":
      return { label: "Wi-Fi", text: "available, cost not stated" };
    default:
      return { label: "Wi-Fi", text: wifi };
  }
}

/** Wikidata facts for a tunnel or bridge matched by position. */
function buildStructureSection(info: WikidataStructureInfo): HTMLElement {
  const section = document.createElement("div");
  section.style.marginTop = "8px";
  section.style.paddingTop = "8px";
  section.style.borderTop = "1px solid var(--border-subtle)";

  const header = document.createElement("div");
  header.style.fontWeight = "700";
  header.style.color = "var(--wikidata)";
  header.style.marginBottom = "4px";
  header.textContent = `From Wikidata${info.label ? `: ${info.label}` : ""}`;
  section.appendChild(header);

  const metres = (m: number) => `${Math.round(m).toLocaleString()} m`;
  const facts: [string, string | undefined][] = [
    ["Length", info.lengthMetres !== undefined ? metres(info.lengthMetres) : undefined],
    ["Opened", info.opened],
    ["Carries", info.carries?.join(", ")],
    ["Crosses", info.crosses?.join(", ")],
    ["Operator", info.operator],
    ["Height", info.heightMetres !== undefined ? metres(info.heightMetres) : undefined],
    ["Spans", info.spans !== undefined ? String(info.spans) : undefined],
    ["Longest span", info.longestSpanMetres !== undefined ? metres(info.longestSpanMetres) : undefined],
    ["Material", info.material],
    ["Heritage", info.heritage],
  ];
  for (const [label, text] of facts) if (text) section.appendChild(row(label, text, false));
  if (info.image) {
    const file = decodeURIComponent(info.image.split("/").pop() ?? "").replace(/_/g, " ");
    section.appendChild(entityRow("Photo", info.image, file));
  }
  if (typeof info.distanceMetres === "number") {
    section.appendChild(row("Matched on", `position, ${info.distanceMetres} m from RINF's geometry`, true));
  }
  section.appendChild(entityIriRow("Wikidata entity", info.sourceUrl));
  return section;
}

/** Says which key linked this station, since one of them (a UIC code) is a
 *  heuristic. Absent on data cached before matching was recorded. */
function matchedOnText(wikidata: WikidataStationInfo): string | null {
  switch (wikidata.matchedBy) {
    case "primary-location-code":
      return `primary location code ${wikidata.matchedValue}`;
    case "era-id":
      return `ERA ID ${wikidata.matchedValue} (the operational point's uopid)`;
    case "uic-station-code":
      return `UIC station code ${wikidata.matchedValue}, located within 1 km`;
    default:
      return null;
  }
}

/** An entity's IRI shown as itself: compacted (`wd:Q…`), with the full
 *  IRI on hover, so it reads as an identifier rather than a page link.
 *  Following it still lands on a web page, because the publisher
 *  redirects browsers there. */
function entityIriRow(label: string, iri: string): HTMLElement {
  return entityRow(label, iri, compactIri(iri));
}

function entityRow(label: string, iri: string, text: string): HTMLElement {
  const el = document.createElement("div");
  el.style.marginTop = "6px";
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  el.appendChild(strong);
  const a = link(iri, text);
  a.style.display = "inline";
  a.style.marginTop = "0";
  a.title = iri;
  el.appendChild(a);
  return el;
}

/** Always shows a reference back to the parent operational point — both as
 *  text and as a working link to that point's own RINF record — since a
 *  primary location only makes sense in relation to the point it belongs
 *  to (an operational point can have zero, one, or several of these). */
export function buildPrimaryLocationPopup(
  rawProperties: Record<string, unknown>,
  onExplore: (iri: string) => void,
): HTMLElement {
  const props: PrimaryLocationProperties = {
    rinfUri: rawProperties.rinfUri as string,
    primaryLocationCode: rawProperties.primaryLocationCode as string,
    operationalPointUopid: rawProperties.operationalPointUopid as string,
    operationalPointName: parseMaybeJson(rawProperties.operationalPointName),
    operationalPointRinfUri: rawProperties.operationalPointRinfUri as string,
    positionFrom:
      rawProperties.positionFrom === "operational-point" ? "operational-point" : "primary-location",
    wikidata: parseMaybeJson(rawProperties.wikidata),
  };

  const container = document.createElement("div");
  container.style.fontSize = "13px";
  container.style.minWidth = "220px";

  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.style.marginBottom = "6px";
  title.textContent = `Primary location ${props.primaryLocationCode}`;
  container.appendChild(title);

  container.appendChild(
    row(
      "Operational point",
      `${fieldValueLabel(props.operationalPointName)} (${props.operationalPointUopid})`,
      false,
    ),
  );
  if (props.positionFrom === "operational-point") {
    container.appendChild(
      row("Position", "its operational point's (no geometry of its own in RINF)", true),
    );
  }

  container.appendChild(link(props.rinfUri, "View RINF record →"));
  container.appendChild(
    link(props.operationalPointRinfUri, "View operational point's RINF record →"),
  );
  container.appendChild(exploreButton(() => onExplore(props.rinfUri)));

  if (props.wikidata) {
    container.appendChild(buildWikidataSection(props.wikidata));
  }

  return container;
}

const INFRA_TITLES: Record<InfrastructureKind, string> = {
  "level-crossings": "Level crossing",
  bridges: "Bridge",
  signals: "Signal",
  switches: "Switch",
};

export function buildInfrastructurePopup(
  rawProperties: Record<string, unknown>,
  onExplore: (iri: string) => void,
): HTMLElement {
  const kind = rawProperties.kind as InfrastructureKind;
  const rinfUri = rawProperties.rinfUri as string;
  const label = parseMaybeJson<FieldValue<string>>(rawProperties.label);

  const container = document.createElement("div");
  container.style.fontSize = "13px";
  container.style.minWidth = "200px";

  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.style.marginBottom = "6px";
  title.textContent = `${INFRA_TITLES[kind] ?? "Infrastructure"}: ${fieldValueLabel(label)}`;
  container.appendChild(title);

  if (rawProperties.subtype !== undefined) {
    const subtype = parseMaybeJson<FieldValue<RinfLink>>(rawProperties.subtype);
    container.appendChild(row("Type", linkFieldValueLabel(subtype), subtype.status !== "value"));
  }
  container.appendChild(link(rinfUri, "View RINF record →"));
  container.appendChild(exploreButton(() => onExplore(rinfUri)));
  const wikidata = parseMaybeJson<WikidataStructureInfo | undefined>(rawProperties.wikidata);
  if (wikidata) container.appendChild(buildStructureSection(wikidata));
  return container;
}
