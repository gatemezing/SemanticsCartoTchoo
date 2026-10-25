import { Modal } from "./Modal";

const REPO_URL = "https://github.com/gatemezing/SemanticsCartoTchoo";

/** Where every piece of what's on screen comes from, and under what terms —
 *  the code's licence doesn't cover the data or the tiles. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="About Carto RINF" onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        An interactive map of European railway infrastructure, read live from
        the RINF knowledge graph of the European Union Agency for Railways (ERA)
        over SPARQL. Nothing is pre-processed: every field shown links back to
        its RINF record, and fields RINF doesn't have are labelled as such
        rather than left blank. Click a point, section of line or tunnel, then
        use <strong>Describe</strong> to browse every triple RINF holds for it.
      </p>
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>Data and licences</h3>
      <ul style={{ marginTop: 0, paddingLeft: 18, lineHeight: 1.5 }}>
        <li>
          <strong>RINF</strong> — ERA's Register of Infrastructure, published under
          Directive (EU) 2016/797 and Regulation (EU) 2019/777; the infrastructure
          managers who submit it remain responsible for it. ERA's{" "}
          <a
            href="https://www.era.europa.eu/system/files/2022-11/rinf_terms_of_use_en.pdf"
            target="_blank"
            rel="noopener noreferrer"
          >
            RINF terms of use
          </a>{" "}
          apply. This project is not affiliated with ERA.
        </li>
        <li>
          <strong>Wikidata</strong> — station accessibility enrichment, CC0.
        </li>
        <li>
          <strong>Basemap</strong> — ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
            OpenStreetMap
          </a>{" "}
          contributors (ODbL), served under the OSM tile usage policy.
        </li>
        <li>
          <strong>Rail overlay</strong> (optional) —{" "}
          <a href="https://www.openrailwaymap.org/" target="_blank" rel="noopener noreferrer">
            OpenRailwayMap
          </a>{" "}
          tiles, CC-BY-SA 2.0, free for light non-commercial use only.
        </li>
      </ul>
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>Software</h3>
      <p style={{ marginTop: 0 }}>
        Built with MapLibre GL JS (BSD-3-Clause), React and TanStack Query
        (MIT), served by Fastify (MIT). Full licence texts of every bundled
        package:{" "}
        <a
          href={`${import.meta.env.BASE_URL}THIRD_PARTY_LICENSES.txt`}
          target="_blank"
          rel="noopener noreferrer"
        >
          third-party licences
        </a>
        .
      </p>
      <p style={{ marginBottom: 0 }}>
        Source code (MIT) and issue tracker:{" "}
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          {REPO_URL.replace("https://", "")}
        </a>
        . Some features were inspired by{" "}
        <a href="https://github.com/Matdata-eu/rinf-atlas" target="_blank" rel="noopener noreferrer">
          RINF Atlas
        </a>
        .
      </p>
    </Modal>
  );
}
