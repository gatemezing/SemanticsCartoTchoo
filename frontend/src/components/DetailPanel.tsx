import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type {
  SectionOfLineDetail,
  SectionParameterValue,
  TrackParameterId,
} from "@carto-rinf/shared-types";
import { fetchOperationalPointDetail, fetchSectionDetail } from "../api/client";
import { PARAMETER_LABELS, parameterValueText } from "../map/dataColors";
import { compactIri } from "../rdf/prefixes";
import { safeHref } from "../security/safeHref";
import { DescribeView } from "./DescribeView";
import {
  describeFieldValue,
  fieldValueLabel,
  linkFieldValueLabel,
  NOT_AVAILABLE_LABEL,
} from "./fieldValueText";
import { FieldRow } from "./FieldRow";

/** Operational points and sections of line get a typed, three-state
 *  field view plus the raw graph; anything else selectable (a tunnel, a
 *  primary location, a signal…) opens straight on the raw graph view. */
export type Selection =
  | { kind: "operational-point"; uopid: string }
  | { kind: "section"; iri: string }
  | { kind: "resource"; iri: string };

interface Props {
  selection: Selection;
  onClose: () => void;
  /** Opens the line profile of a national line (from a section's panel). */
  onOpenLineProfile: (lineIri: string) => void;
}

type Tab = "properties" | "describe";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        border: "none",
        borderBottom: active ? "2px solid var(--text)" : "2px solid transparent",
        background: "none",
        padding: "4px 2px",
        marginRight: 12,
        fontSize: 13,
        fontWeight: active ? 700 : 400,
        color: active ? "var(--text)" : "var(--text-muted)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function OperationalPointBody({ uopid }: { uopid: string }) {
  const [tab, setTab] = useState<Tab>("properties");
  useEffect(() => setTab("properties"), [uopid]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["operational-point-detail", uopid],
    queryFn: () => fetchOperationalPointDetail(uopid),
  });

  if (isLoading) return <div style={{ fontSize: 13 }}>Loading from RINF…</div>;
  if (error) {
    return (
      <div style={{ fontSize: 13, color: "var(--danger-text)" }}>
        Couldn't load this operational point: {String((error as Error).message)}
      </div>
    );
  }
  if (!data) return null;

  return (
    <>
      <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 8, paddingRight: 20 }}>
        {fieldValueLabel(data.name)}
      </h2>
      <div role="tablist" style={{ marginBottom: 12, borderBottom: "1px solid var(--border-subtle)" }}>
        <TabButton active={tab === "properties"} onClick={() => setTab("properties")}>
          Properties
        </TabButton>
        <TabButton active={tab === "describe"} onClick={() => setTab("describe")}>
          Describe
        </TabButton>
      </div>

      {tab === "describe" ? (
        <DescribeView iri={data.rinfUri} />
      ) : (
        <>
          <FieldRow label="uopid" value={data.uopid} />
          <FieldRow
            label="Type"
            value={linkFieldValueLabel(data.opType)}
            muted={data.opType.status !== "value"}
          />
          <FieldRow
            label="Country"
            value={linkFieldValueLabel(data.country)}
            muted={data.country.status !== "value"}
          />
          <FieldRow
            label="Validity"
            value={fieldValueLabel(data.validityPeriod)}
            muted={data.validityPeriod.status !== "value"}
          />
          <FieldRow
            label="Sub-elements (sidings, platforms, etc.)"
            value={describeFieldValue(data.partsCount, (n) => String(n))}
          />
          <FieldRow
            label="Primary location code(s)"
            value={describeFieldValue(data.primaryLocationCodes, (codes) =>
              codes.length > 0 ? codes.join(", ") : "None",
            )}
          />

          {safeHref(data.rinfUri) && (
            <a
              href={safeHref(data.rinfUri)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", marginTop: 8, fontSize: 13 }}
            >
              View RINF record →
            </a>
          )}
        </>
      )}
    </>
  );
}

function ResourceBody({ iri }: { iri: string }) {
  const [label, setLabel] = useState<string | undefined>();
  useEffect(() => setLabel(undefined), [iri]);
  return (
    <>
      <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 12, paddingRight: 20 }}>
        {label ?? compactIri(iri)}
      </h2>
      <DescribeView iri={iri} onLabel={setLabel} />
    </>
  );
}

function parameterText(
  param: TrackParameterId,
  value: SectionParameterValue | undefined,
  labels: Record<string, string>,
): string {
  return parameterValueText(param, value, labels) ?? NOT_AVAILABLE_LABEL;
}

const PARAMETER_ORDER: TrackParameterId[] = ["maxSpeed", "electrification", "gauge", "etcsLevel"];

function SectionProperties({
  data,
  onOpenLineProfile,
}: {
  data: SectionOfLineDetail;
  onOpenLineProfile: (lineIri: string) => void;
}) {
  const endpoint = (e: SectionOfLineDetail["opStart"]) => `${fieldValueLabel(e.name)} (${e.uopid})`;
  const lineIri = data.nationalLine.status === "value" ? data.nationalLine.value.uri : null;
  return (
    <>
      <FieldRow label="From" value={endpoint(data.opStart)} />
      <FieldRow label="To" value={endpoint(data.opEnd)} />
      <FieldRow
        label="Length"
        value={describeFieldValue(data.lengthKm, (km) => `${km.toLocaleString()} km`)}
        muted={data.lengthKm.status !== "value"}
      />
      <FieldRow
        label="National line"
        value={linkFieldValueLabel(data.nationalLine)}
        muted={data.nationalLine.status !== "value"}
      />
      {lineIri && (
        <button
          onClick={() => onOpenLineProfile(lineIri)}
          style={{
            margin: "-2px 0 10px",
            padding: "4px 8px",
            fontSize: 12,
            border: "1px solid var(--border)",
            borderRadius: 4,
            background: "var(--surface)",
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          Show line profile →
        </button>
      )}
      <FieldRow label="Nature" value={linkFieldValueLabel(data.nature)} muted={data.nature.status !== "value"} />
      <FieldRow
        label="Infrastructure manager"
        value={linkFieldValueLabel(data.infrastructureManager)}
        muted={data.infrastructureManager.status !== "value"}
      />
      <FieldRow
        label="Validity"
        value={fieldValueLabel(data.validityPeriod)}
        muted={data.validityPeriod.status !== "value"}
      />
      <FieldRow label="Running tracks" value={String(data.runningTracks)} />
      <div
        style={{
          margin: "12px 0 6px",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        Track parameters (across its running tracks)
      </div>
      {PARAMETER_ORDER.map((param) => (
        <FieldRow
          key={param}
          label={PARAMETER_LABELS[param]}
          value={parameterText(param, data.parameters[param], data.categoryLabels)}
          muted={!data.parameters[param]}
        />
      ))}
      {safeHref(data.rinfUri) && (
        <a
          href={safeHref(data.rinfUri)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-block", marginTop: 8, fontSize: 13 }}
        >
          View RINF record →
        </a>
      )}
    </>
  );
}

function SectionBody({
  iri,
  onOpenLineProfile,
}: {
  iri: string;
  onOpenLineProfile: (lineIri: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("properties");
  useEffect(() => setTab("properties"), [iri]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["section-detail", iri],
    queryFn: () => fetchSectionDetail(iri),
  });

  const title =
    data && data.label.status === "value"
      ? data.label.value
      : data
        ? `${fieldValueLabel(data.opStart.name)} – ${fieldValueLabel(data.opEnd.name)}`
        : compactIri(iri);

  return (
    <>
      <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 8, paddingRight: 20 }}>{title}</h2>
      <div role="tablist" style={{ marginBottom: 12, borderBottom: "1px solid var(--border-subtle)" }}>
        <TabButton active={tab === "properties"} onClick={() => setTab("properties")}>
          Properties
        </TabButton>
        <TabButton active={tab === "describe"} onClick={() => setTab("describe")}>
          Describe
        </TabButton>
      </div>
      {tab === "describe" ? (
        <DescribeView iri={iri} />
      ) : isLoading ? (
        <div style={{ fontSize: 13 }}>Loading from RINF…</div>
      ) : error ? (
        <div style={{ fontSize: 13, color: "var(--danger-text)" }}>
          Couldn't load this section of line: {String((error as Error).message)}
        </div>
      ) : data ? (
        <SectionProperties data={data} onOpenLineProfile={onOpenLineProfile} />
      ) : null}
    </>
  );
}

export function DetailPanel({ selection, onClose, onOpenLineProfile }: Props) {
  return (
    <div
      className="detail-panel"
      style={{
        background: "var(--surface)",
        color: "var(--text)",
        boxShadow: "var(--shadow-md)",
        padding: 16,
        overflowY: "auto",
        fontFamily: "sans-serif",
        zIndex: 20,
      }}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          float: "right",
          border: "none",
          background: "none",
          fontSize: 18,
          cursor: "pointer",
          color: "var(--text-muted)",
        }}
      >
        ×
      </button>

      {selection.kind === "operational-point" ? (
        <OperationalPointBody uopid={selection.uopid} />
      ) : selection.kind === "section" ? (
        <SectionBody iri={selection.iri} onOpenLineProfile={onOpenLineProfile} />
      ) : (
        <ResourceBody iri={selection.iri} />
      )}
    </div>
  );
}
