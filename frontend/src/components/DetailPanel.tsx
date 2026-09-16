import { useQuery } from "@tanstack/react-query";
import { fetchOperationalPointDetail } from "../api/client";
import {
  describeFieldValue,
  fieldValueLabel,
  linkFieldValueLabel,
} from "./fieldValueText";
import { FieldRow } from "./FieldRow";

interface Props {
  uopid: string;
  onClose: () => void;
}

export function DetailPanel({ uopid, onClose }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["operational-point-detail", uopid],
    queryFn: () => fetchOperationalPointDetail(uopid),
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 320,
        maxWidth: "85vw",
        background: "white",
        boxShadow: "-2px 0 8px rgba(0,0,0,0.15)",
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
          color: "#6b7280",
        }}
      >
        ×
      </button>

      {isLoading && <div style={{ fontSize: 13 }}>Loading from RINF…</div>}

      {error && (
        <div style={{ fontSize: 13, color: "#b91c1c" }}>
          Couldn't load this operational point: {String((error as Error).message)}
        </div>
      )}

      {data && (
        <>
          <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 12, paddingRight: 20 }}>
            {fieldValueLabel(data.name)}
          </h2>
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

          <a
            href={data.rinfUri}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-block", marginTop: 8, fontSize: 13 }}
          >
            View RINF record →
          </a>
        </>
      )}
    </div>
  );
}
