import type { UseQueryResult } from "@tanstack/react-query";
import { WIFI_ACCESS_VALUES, type WifiCounts, type WifiSummary } from "@carto-rinf/shared-types";
import { Modal } from "./Modal";

const cell = { padding: "4px 8px", borderBottom: "1px solid var(--divider)", textAlign: "left" as const };
const num = { ...cell, textAlign: "right" as const, fontVariantNumeric: "tabular-nums" as const };

const recorded = (c: WifiCounts) => WIFI_ACCESS_VALUES.reduce((n, v) => n + c[v], 0);
const fmt = (n: number) => n.toLocaleString();

/** "How many stations have free Wi-Fi in Europe, according to Wikidata?"
 *  The answer first, then the per-country breakdown, then exactly how it's
 *  counted and the query to re-run it. */
export function WifiDialog({
  summary,
  currentCountry,
  onClose,
}: {
  summary: UseQueryResult<WifiSummary>;
  currentCountry: string;
  onClose: () => void;
}) {
  return (
    <Modal title="Free Wi-Fi in stations, according to Wikidata" onClose={onClose}>
      {summary.isLoading && (
        <p style={{ marginTop: 0 }}>
          Counting… One Wikidata query, then RINF for the stations it names: up to a minute the first time.
        </p>
      )}
      {summary.isError && (
        <p style={{ marginTop: 0, color: "var(--text-muted)" }}>
          Couldn't count: {(summary.error as Error).message}
        </p>
      )}
      {summary.data && <SummaryBody summary={summary.data} currentCountry={currentCountry} />}
    </Modal>
  );
}

function SummaryBody({ summary, currentCountry }: { summary: WifiSummary; currentCountry: string }) {
  const { stations, wikidata } = summary.total;
  const shown = summary.countries.filter((c) => recorded(c.stations) > 0 || recorded(c.wikidata) > 0);
  const none = summary.countries.filter((c) => !shown.includes(c));
  return (
    <>
      <p style={{ marginTop: 0, fontSize: 15 }}>
        <strong>{fmt(stations.free)} RINF stations</strong> have free Wi-Fi according to Wikidata, across the{" "}
        {summary.countries.length} countries in RINF.
      </p>
      <p style={{ color: "var(--text-secondary)" }}>
        Wikidata also records no Wi-Fi for {fmt(stations.none)} stations, Wi-Fi without a stated cost for{" "}
        {fmt(stations.available)} and paid Wi-Fi for {fmt(stations.paid)}. It records free Wi-Fi on{" "}
        {fmt(wikidata.free)} items with a station code in these countries; the rest aren't matched to a RINF
        station.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th style={cell}>Country</th>
              <th style={num}>Free</th>
              <th style={num}>Paid</th>
              <th style={num}>Cost not stated</th>
              <th style={num}>No Wi-Fi</th>
              <th style={num} title="Wikidata items with a station code recording free Wi-Fi, matched or not">
                Free in Wikidata
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.code} style={c.code === currentCountry ? { background: "var(--divider)" } : undefined}>
                <td style={cell}>{c.label}</td>
                <td style={{ ...num, fontWeight: 700 }}>{fmt(c.stations.free)}</td>
                <td style={num}>{fmt(c.stations.paid)}</td>
                <td style={num}>{fmt(c.stations.available)}</td>
                <td style={num}>{fmt(c.stations.none)}</td>
                <td style={{ ...num, color: "var(--text-muted)" }}>{fmt(c.wikidata.free)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td style={cell}>All RINF countries</td>
              <td style={num}>{fmt(stations.free)}</td>
              <td style={num}>{fmt(stations.paid)}</td>
              <td style={num}>{fmt(stations.available)}</td>
              <td style={num}>{fmt(stations.none)}</td>
              <td style={{ ...num, color: "var(--text-muted)" }}>{fmt(wikidata.free)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {none.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
          No station Wi-Fi recorded in Wikidata for: {none.map((c) => c.label).join(", ")}.
        </p>
      )}
      <details style={{ fontSize: 12, marginTop: 8 }}>
        <summary style={{ cursor: "pointer" }}>How this is counted</summary>
        <p>{summary.definition}</p>
        <p>
          <a
            href={`https://query.wikidata.org/#${encodeURIComponent(summary.query)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Run the Wikidata query
          </a>{" "}
          · counted {new Date(summary.fetchedAt).toLocaleString()}, refreshed every 6 hours.
        </p>
      </details>
    </>
  );
}
