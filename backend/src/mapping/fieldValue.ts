import type { FieldValue, RinfLink } from "@carto-rinf/shared-types";
import type { SparqlTerm } from "../sparql/client.js";

/** Turns an (optionally absent) literal binding plus its sibling
 *  `<field>NA` "not applicable" marker binding into the three-state
 *  FieldValue the frontend renders. */
export function literalFieldValue(
  valueTerm: SparqlTerm | undefined,
  notApplicableTerm: SparqlTerm | undefined,
): FieldValue<string> {
  if (valueTerm) return { status: "value", value: valueTerm.value };
  if (notApplicableTerm) return { status: "not_applicable" };
  return { status: "not_available_in_rinf" };
}

export function numericFieldValue(
  valueTerm: SparqlTerm | undefined,
  notApplicableTerm: SparqlTerm | undefined,
): FieldValue<number> {
  if (valueTerm) return { status: "value", value: Number(valueTerm.value) };
  if (notApplicableTerm) return { status: "not_applicable" };
  return { status: "not_available_in_rinf" };
}

export function linkFieldValue(
  uriTerm: SparqlTerm | undefined,
  labelTerm: SparqlTerm | undefined,
  notApplicableTerm: SparqlTerm | undefined,
): FieldValue<RinfLink> {
  if (uriTerm) {
    const link: RinfLink = { uri: uriTerm.value };
    if (labelTerm) link.label = labelTerm.value;
    return { status: "value", value: link };
  }
  if (notApplicableTerm) return { status: "not_applicable" };
  return { status: "not_available_in_rinf" };
}
