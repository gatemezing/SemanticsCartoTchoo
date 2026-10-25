import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchDatasets } from "../api/client";
import { Modal } from "./Modal";

interface Props {
  country: string;
  countryLabel: string;
  onClose: () => void;
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const cell = { padding: "4px 8px", borderBottom: "1px solid #f3f4f6", textAlign: "left" as const };

/** What RINF the map is actually reading: the latest published dataset of
 *  each infrastructure manager, per ERA's dataset explorer. The map queries
 *  the knowledge graph live, so this is the freshness of the source itself
 *  (the backend cache adds at most its TTL on top). */
export function DatasetsDialog({ country, countryLabel, onClose }: Props) {
  const [onlyCountry, setOnlyCountry] = useState(true);
  const { data, isLoading, error } = useQuery({
    queryKey: ["datasets"],
    queryFn: fetchDatasets,
  });
  const rows = data?.filter((d) => !onlyCountry || d.countryCode === country) ?? [];

  return (
    <Modal title="RINF datasets" onClose={onClose}>
      <p style={{ marginTop: 0, color: "#4b5563" }}>
        The latest dataset each infrastructure manager published to RINF, as
        listed by{" "}
        <a href="https://rinf.data.era.europa.eu/" target="_blank" rel="noopener noreferrer">
          ERA's dataset explorer
        </a>
        . The map reads the knowledge graph built from these; results are cached
        by this server for up to 6 hours.
      </p>
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <input
          type="checkbox"
          checked={onlyCountry}
          onChange={(e) => setOnlyCountry(e.target.checked)}
        />
        Only {countryLabel}
      </label>

      {isLoading && <div>Loading from ERA…</div>}
      {error && (
        <div style={{ color: "#b91c1c" }}>
          Couldn't load the dataset list: {String((error as Error).message)}
        </div>
      )}
      {data && rows.length === 0 && (
        <div style={{ color: "#9ca3af", fontStyle: "italic" }}>
          No dataset listed for {countryLabel}.
        </div>
      )}
      {rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#6b7280" }}>
                {!onlyCountry && <th style={cell}>Country</th>}
                <th style={cell}>Infrastructure manager</th>
                <th style={cell}>Published</th>
                <th style={cell}>Type</th>
                <th style={{ ...cell, textAlign: "right" }}>Size</th>
                <th style={cell}>File</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  {!onlyCountry && <td style={cell}>{d.countryName}</td>}
                  <td style={cell}>
                    {d.imName}{" "}
                    <span style={{ color: "#9ca3af" }}>({d.imCode})</span>
                  </td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>
                    {d.publishedAt ? new Date(d.publishedAt).toLocaleDateString() : "—"}
                  </td>
                  <td style={cell}>{d.type}</td>
                  <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>
                    {formatSize(d.sizeBytes)}
                  </td>
                  <td style={{ ...cell, wordBreak: "break-all", color: "#4b5563" }}>{d.fileName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
