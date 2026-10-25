import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchOperationalPointDetail } from "../api/client";
import { compactIri } from "../rdf/prefixes";
import { safeHref } from "../security/safeHref";
import { DescribeView } from "./DescribeView";
import {
  describeFieldValue,
  fieldValueLabel,
  linkFieldValueLabel,
} from "./fieldValueText";
import { FieldRow } from "./FieldRow";

/** An operational point gets the typed, three-state field view plus the
 *  raw graph; anything else selectable (a section of line, a tunnel, a
 *  primary location) has no typed DTO here, so it opens straight on the
 *  raw graph view. */
export type Selection =
  | { kind: "operational-point"; uopid: string }
  | { kind: "resource"; iri: string };

interface Props {
  selection: Selection;
  onClose: () => void;
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
        borderBottom: active ? "2px solid #1f2937" : "2px solid transparent",
        background: "none",
        padding: "4px 2px",
        marginRight: 12,
        fontSize: 13,
        fontWeight: active ? 700 : 400,
        color: active ? "#1f2937" : "#6b7280",
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
      <div style={{ fontSize: 13, color: "#b91c1c" }}>
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
      <div role="tablist" style={{ marginBottom: 12, borderBottom: "1px solid #e5e7eb" }}>
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

export function DetailPanel({ selection, onClose }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 360,
        maxWidth: "85vw",
        background: "white",
        boxShadow: "-2px 0 8px rgba(0,0,0,0.15)",
        padding: 16,
        overflowY: "auto",
        fontFamily: "sans-serif",
        zIndex: 20,
        boxSizing: "border-box",
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
          color: "#6b7280",
        }}
      >
        ×
      </button>

      {selection.kind === "operational-point" ? (
        <OperationalPointBody uopid={selection.uopid} />
      ) : (
        <ResourceBody iri={selection.iri} />
      )}
    </div>
  );
}
