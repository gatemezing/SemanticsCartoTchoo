import type {
  FieldValue,
  OperationalPointDetail,
} from "@carto-rinf/shared-types";
import type { SparqlBinding } from "../sparql/client.js";
import { linkFieldValue, literalFieldValue } from "./fieldValue.js";

/** partsCount and primaryLocationCodes are derived aggregates, not raw RINF
 *  triples — an absent binding here means "counted zero", a genuine value,
 *  not "unknown/not available". */
export function mapOperationalPointDetail(
  uopid: string,
  b: SparqlBinding,
): OperationalPointDetail {
  const partsCount: FieldValue<number> = {
    status: "value",
    value: b.partsCount ? Number(b.partsCount.value) : 0,
  };
  const primaryLocationCodes: FieldValue<string[]> = {
    status: "value",
    value: b.primaryLocationCodes
      ? b.primaryLocationCodes.value.split("|")
      : [],
  };

  return {
    uopid,
    rinfUri: b.op.value,
    name: literalFieldValue(b.opName, b.opNameNA),
    opType: linkFieldValue(b.opTypeURI, b.opTypeLabel, b.opTypeNA),
    country: linkFieldValue(b.countryURI, b.countryLabel, b.countryNA),
    validityPeriod: literalFieldValue(b.validityLabel, undefined),
    partsCount,
    primaryLocationCodes,
  };
}
