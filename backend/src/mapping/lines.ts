import type {
  FieldValue,
  LineProfile,
  LineProfileSegment,
  NationalLine,
} from "@carto-rinf/shared-types";
import { chainSections, type ChainSection } from "../lineProfile/chain.js";
import type { SparqlJsonResults } from "../sparql/client.js";
import { literalFieldValue } from "./fieldValue.js";
import type { SectionParameterMap } from "./trackParameters.js";
import { pickLabels } from "./sectionDetail.js";

/** Sorted by label with numeric awareness ("2" before "10"). Lines with
 *  no label in RINF fall back to their IRI's last segment. */
export function mapNationalLines(results: SparqlJsonResults): NationalLine[] {
  return results.results.bindings
    .map((b) => ({
      iri: b.line.value,
      label: b.label?.value ?? b.line.value.split("/").pop() ?? b.line.value,
      sections: Number(b.sections?.value ?? 0),
      lengthKm: Math.round(Number(b.km?.value ?? 0) * 10) / 10,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

export interface LineSection extends ChainSection {
  startName: FieldValue<string>;
  endName: FieldValue<string>;
}

export function mapLineSections(results: SparqlJsonResults): {
  sections: LineSection[];
  lineLabel?: string;
} {
  const sections: LineSection[] = [];
  let lineLabel: string | undefined;
  for (const b of results.results.bindings) {
    lineLabel ??= b.lineLabel?.value;
    const length = b.len ? Number(b.len.value) : NaN;
    sections.push({
      rinfUri: b.sol.value,
      startUopid: b.startUopid.value,
      endUopid: b.endUopid.value,
      lengthKm: Number.isFinite(length) ? length : null,
      startName: literalFieldValue(b.startName, undefined),
      endName: literalFieldValue(b.endName, undefined),
    });
  }
  return { sections, lineLabel };
}

export function buildLineProfile(
  line: { iri: string; label: string },
  sections: LineSection[],
  parameters: SectionParameterMap,
  labels: Record<string, string>,
): LineProfile {
  const categoryLabels: Record<string, string> = {};
  const runs = chainSections(sections).map((run) =>
    run.map(({ section, reversed, startKm, endKm, lengthKnown }): LineProfileSegment => {
      const params = parameters.get(section.rinfUri) ?? {};
      Object.assign(categoryLabels, pickLabels(params, labels));
      const start = { uopid: section.startUopid, name: section.startName };
      const end = { uopid: section.endUopid, name: section.endName };
      return {
        rinfUri: section.rinfUri,
        startKm: Math.round(startKm * 1000) / 1000,
        endKm: Math.round(endKm * 1000) / 1000,
        lengthKnown,
        reversed,
        from: reversed ? end : start,
        to: reversed ? start : end,
        parameters: params,
      };
    }),
  );
  return { line, runs, categoryLabels };
}
