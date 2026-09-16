import type {
  PrimaryLocationProperties,
  TunnelProperties,
} from "@carto-rinf/shared-types";
import {
  describeFieldValue,
  fieldValueLabel,
  parseMaybeJson,
} from "../components/fieldValueText";

function row(label: string, valueText: string, isMuted: boolean): HTMLElement {
  const el = document.createElement("div");
  el.style.marginBottom = "4px";
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  el.appendChild(strong);
  const span = document.createElement("span");
  span.textContent = valueText;
  if (isMuted) {
    span.style.color = "#9ca3af";
    span.style.fontStyle = "italic";
  }
  el.appendChild(span);
  return el;
}

function link(href: string, text: string): HTMLElement {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = text;
  a.style.display = "block";
  a.style.marginTop = "6px";
  return a;
}

export function buildTunnelPopup(
  rawProperties: Record<string, unknown>,
): HTMLElement {
  const props: TunnelProperties = {
    rinfUri: rawProperties.rinfUri as string,
    name: parseMaybeJson(rawProperties.name),
    lengthMetres: parseMaybeJson(rawProperties.lengthMetres),
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
  return container;
}

/** Always shows a reference back to the parent operational point — both as
 *  text and as a working link to that point's own RINF record — since a
 *  primary location only makes sense in relation to the point it belongs
 *  to (an operational point can have zero, one, or several of these). */
export function buildPrimaryLocationPopup(
  rawProperties: Record<string, unknown>,
): HTMLElement {
  const props: PrimaryLocationProperties = {
    rinfUri: rawProperties.rinfUri as string,
    primaryLocationCode: rawProperties.primaryLocationCode as string,
    operationalPointUopid: rawProperties.operationalPointUopid as string,
    operationalPointName: parseMaybeJson(rawProperties.operationalPointName),
    operationalPointRinfUri: rawProperties.operationalPointRinfUri as string,
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

  container.appendChild(link(props.rinfUri, "View RINF record →"));
  container.appendChild(
    link(props.operationalPointRinfUri, "View operational point's RINF record →"),
  );
  return container;
}
