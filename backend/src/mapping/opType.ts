import type { FieldValue, RinfLink } from "@carto-rinf/shared-types";
import type { SparqlTerm } from "../sparql/client.js";
import { linkFieldValue } from "./fieldValue.js";

/** ERA's operational-point-type vocabulary (graph/rinf/skos), keyed by the
 *  numeric concept code. */
const ERA_OP_TYPE_LABELS: Record<string, string> = {
  "10": "station",
  "20": "small station",
  "30": "passenger terminal",
  "40": "freight terminal",
  "50": "depot or workshop",
  "60": "train technical services",
  "70": "passenger stop",
  "80": "junction",
  "90": "border point",
  "100": "shunting yard",
  "110": "technical change",
  "120": "switch",
  "130": "private siding",
  "140": "domestic border point",
  "150": "over crossing",
};

/** Croatia's provider graph (graph/0078) mints its own concepts under
 *  `concepts/op-types/OperationalPointTypes/<code>` instead of ERA's
 *  `concepts/op-types/<code>`, labelled in its own spelling ("Station",
 *  "Shuting yard", "Tehnical change", "Switch\r\n"). The map colours and
 *  legend key on ERA's lowercase labels, so those points all fell into
 *  "Other". The numeric code is the same, so the label is taken from ERA's
 *  vocabulary; the provider's IRI is kept as the link target. */
const OP_TYPE_CODE = /\/concepts\/op-types\/(?:OperationalPointTypes\/)?(\d+)$/;

export function opTypeFieldValue(
  uriTerm: SparqlTerm | undefined,
  labelTerm: SparqlTerm | undefined,
  notApplicableTerm: SparqlTerm | undefined,
): FieldValue<RinfLink> {
  const field = linkFieldValue(uriTerm, labelTerm, notApplicableTerm);
  if (field.status !== "value") return field;
  const code = OP_TYPE_CODE.exec(field.value.uri)?.[1];
  const label = code ? ERA_OP_TYPE_LABELS[code] : undefined;
  if (label) return { status: "value", value: { ...field.value, label } };
  if (field.value.label !== undefined) {
    return {
      status: "value",
      value: { ...field.value, label: field.value.label.trim() },
    };
  }
  return field;
}
