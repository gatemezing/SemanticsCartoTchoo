import type {
  SectionOfLineDetail,
  SectionParameterValue,
  TrackParameterId,
} from "@carto-rinf/shared-types";
import type { SparqlBinding } from "../sparql/client.js";
import { linkFieldValue, literalFieldValue, numericFieldValue } from "./fieldValue.js";

export function mapSectionDetail(
  rinfUri: string,
  b: SparqlBinding,
  parameters: Partial<Record<TrackParameterId, SectionParameterValue>>,
  categoryLabels: Record<string, string>,
): SectionOfLineDetail {
  return {
    rinfUri,
    label: literalFieldValue(b.label, undefined),
    lengthKm: numericFieldValue(b.len, b.lenNA),
    nature: linkFieldValue(b.nature, b.natureLabel, b.natureNA),
    nationalLine: linkFieldValue(b.line, b.lineLabel, b.lineNA),
    infrastructureManager: linkFieldValue(b.im, b.imLabel, b.imNA),
    opStart: { uopid: b.startUopid.value, name: literalFieldValue(b.startName, undefined) },
    opEnd: { uopid: b.endUopid.value, name: literalFieldValue(b.endName, undefined) },
    validityPeriod: literalFieldValue(b.validityLabel, undefined),
    runningTracks: b.tracks ? Number(b.tracks.value) : 0,
    parameters,
    categoryLabels: pickLabels(parameters, categoryLabels),
  };
}

/** Only the labels for values that actually occur in `parameters`. */
export function pickLabels(
  parameters: Partial<Record<TrackParameterId, SectionParameterValue>>,
  labels: Record<string, string>,
): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const value of Object.values(parameters)) {
    if (value?.kind !== "categorical") continue;
    for (const v of value.values) if (labels[v]) picked[v] = labels[v];
  }
  return picked;
}
