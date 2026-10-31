/**
 * Shared between backend and frontend. A field pulled from RINF is never a
 * bare `null`/`undefined` — the three states below must all be handled
 * explicitly by the UI, since "missing" means different things in RINF.
 */
export type FieldValue<T> =
  | { status: "value"; value: T }
  /** The triple is simply absent from the graph — not collected/known. */
  | { status: "not_available_in_rinf" }
  /** The source data explicitly states this property doesn't apply
   *  (an `era:notApplicable` triple naming this property). */
  | { status: "not_applicable" };

/** A dereferenceable RINF/ERA (or EU Publications Office) URI, with a
 *  human-readable label when one is known (e.g. a SKOS prefLabel). */
export interface RinfLink {
  uri: string;
  label?: string;
  /** Set when the data provider published its own concept for this value
   *  instead of ERA's (e.g. Croatia's operational point types), and `label`
   *  was replaced by ERA's label for the same code. */
  providerConcept?: true;
  /** The provider's own label, as published, when it was replaced. */
  providerLabel?: string;
}

/** One entry in the country registry served by GET /api/countries — see
 *  backend/src/countries.ts for how each field was derived/verified. */
export interface CountryInfo {
  /** The RINF uopid prefix (note: Greece is "EL" here, RINF's own usage,
   *  not the ISO2 "GR" most other systems use). */
  code: string;
  label: string;
  iso3: string;
  wikidataQid: string;
  defaultViewport: { lat: number; lon: number; zoom: number };
  /** How to pick one version of an entity when RINF's temporal versioning
   *  offers more than one for the same identity — see queries.ts `validNow`.
   *  "range" (default when absent): the version whose validity window
   *  contains today. "annual-begin": the version whose validity *begins*
   *  in the current calendar year — needed for Germany, confirmed live to
   *  submit overlapping multi-year windows (e.g. 2025-01-01..2026-12-31
   *  alongside 2026-01-01..2027-12-31 for the same identity) that "range"
   *  can't disambiguate since both contain today; picking by begin-year
   *  resolves it because at most one candidate begins in the current year.
   *  Not the default because it would wrongly exclude countries (e.g.
   *  France) whose validity windows are long-lived and don't begin in the
   *  current year at all. */
  validityStrategy?: "range" | "annual-begin";
  /** The uopid prefix of this country's operational points, when it
   *  differs from `code`. Greece: the registry code is "EL" (as in ERA's
   *  dataset explorer and the EU's own country codes), but its uopids in
   *  RINF start with "GR" (confirmed live 2026-10: 253 uopids, none with
   *  "EL" — which had left the Greek map empty). */
  uopidPrefix?: string;
}

export interface OperationalPointProperties {
  /** era:uopid — country code + alphanumeric operational point code. */
  uopid: string;
  /** The RINF graph subject URI for this operational point — i.e. the
   *  subject of its `era:canonicalURI` triple, not that triple's object.
   *  This is the resource that actually carries the record's data in the
   *  knowledge graph and is what dereferences to the RINF web page. */
  rinfUri: string;
  name: FieldValue<string>;
  opType: FieldValue<RinfLink>;
  country: FieldValue<RinfLink>;
}

export type OperationalPointFeature = GeoJSON.Feature<
  GeoJSON.Point,
  OperationalPointProperties
>;

export type OperationalPointsCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  OperationalPointProperties
>;

export interface SectionOfLineProperties {
  /** The section's own RINF graph subject — what the Describe view
   *  starts from when a section is clicked. */
  rinfUri: string;
  opStartUopid: string;
  opEndUopid: string;
  opStartName: FieldValue<string>;
  opEndName: FieldValue<string>;
  /** True when the geometry is just the straight line between the two
   *  endpoints (two vertices) rather than a real track polyline. Varies by
   *  provider: Luxembourg's sections, for instance, carry the real alignment
   *  (one has 123 vertices). The UI must render this fact, not hide it. */
  geometryIsApproximate: boolean;
}

/** Usually one LineString; a MultiLineString when a provider gives the
 *  section in several parts (e.g. some Norwegian geometry). */
export type SectionOfLineFeature = GeoJSON.Feature<
  GeoJSON.LineString | GeoJSON.MultiLineString,
  SectionOfLineProperties
>;

export type SectionOfLineCollection = GeoJSON.FeatureCollection<
  GeoJSON.LineString | GeoJSON.MultiLineString,
  SectionOfLineProperties
>;

export interface TunnelProperties {
  rinfUri: string;
  name: FieldValue<string>;
  lengthMetres: FieldValue<number>;
}

export type TunnelFeature = GeoJSON.Feature<
  GeoJSON.LineString | GeoJSON.MultiLineString,
  TunnelProperties
>;

export type TunnelsCollection = GeoJSON.FeatureCollection<
  GeoJSON.LineString | GeoJSON.MultiLineString,
  TunnelProperties
>;

/** Deliberately NOT a FieldValue-shaped type: Wikidata enrichment isn't a
 *  RINF completeness contract (it's a different, optional, third-party
 *  source), so it doesn't borrow the "not_applicable / not_available_in_rinf"
 *  vocabulary. Every field is optional and simply absent when Wikidata
 *  doesn't have it; `sourceUrl` is mandatory whenever this object exists at
 *  all, since showing any Wikidata-sourced fact without a way to trace it
 *  back to Wikidata is the one thing this feature must never do. */
export interface WikidataStationInfo {
  qid: string;
  label?: string;
  /** e.g. "wheelchair accessible", "wheelchair accessible with help",
   *  "wheelchair inaccessible" (wdt:P2846, label-resolved). */
  wheelchairAccessibility?: string;
  /** e.g. "gratis" (wdt:P2848, label-resolved). */
  wifi?: string;
  platformCount?: number;
  sourceUrl: string;
}

/** era:PrimaryLocation — a distinct RINF entity (e.g. a commercial/ticketing
 *  location code) attached to an OperationalPoint via era:primaryLocation.
 *  An operational point can have zero, one, or several of these; each one
 *  is rendered as its own feature and always carries a reference back to
 *  the operational point it belongs to. */
export interface PrimaryLocationProperties {
  rinfUri: string;
  primaryLocationCode: string;
  operationalPointUopid: string;
  operationalPointName: FieldValue<string>;
  operationalPointRinfUri: string;
  /** Present only when era:primaryLocationCode has a matching Wikidata
   *  station (joined on Wikidata's PLC property, wdt:P12783) — absent, not
   *  "not available", when there's no match (see WikidataStationInfo). */
  wikidata?: WikidataStationInfo;
}

export type PrimaryLocationFeature = GeoJSON.Feature<
  GeoJSON.Point,
  PrimaryLocationProperties
>;

export type PrimaryLocationsCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  PrimaryLocationProperties
>;

/** Full attribute set for one operational point, served by the detail
 *  endpoint — richer than OperationalPointProperties, which only carries
 *  what the map layer needs to render/style a point. */
export interface OperationalPointDetail {
  uopid: string;
  rinfUri: string;
  name: FieldValue<string>;
  opType: FieldValue<RinfLink>;
  country: FieldValue<RinfLink>;
  validityPeriod: FieldValue<string>;
  /** Count of era:hasPart sub-elements (sidings, platforms, etc). */
  partsCount: FieldValue<number>;
  /** era:primaryLocationCode values via era:primaryLocation, if any. */
  primaryLocationCodes: FieldValue<string[]>;
}

/** One RDF term as returned by the SPARQL JSON results format, plus a
 *  human-readable label when the graph has one (skos:prefLabel or
 *  rdfs:label, English or untagged). */
export interface RdfTermDto {
  type: "uri" | "literal" | "bnode";
  value: string;
  datatype?: string;
  lang?: string;
  label?: string;
}

/** One triple around the described resource: `node` is the object for
 *  outgoing triples (`<iri> ?p ?node`) and the subject for incoming ones
 *  (`?node ?p <iri>`). */
export interface DescribedTriple {
  predicate: RinfLink;
  node: RdfTermDto;
}

/** Served by GET /api/describe — the raw graph neighbourhood of any IRI,
 *  fetched live, so users can follow links beyond the fields the map's
 *  own typed DTOs pick out. */
export interface DescribeResult {
  iri: string;
  direction: "out" | "in";
  triples: DescribedTriple[];
  /** True when the endpoint had more triples than the server-side cap,
   *  so the UI can say the list is incomplete rather than imply it isn't. */
  truncated: boolean;
}

/** One published RINF dataset (the latest per infrastructure manager), as
 *  listed by ERA's dataset explorer API — trimmed to non-personal fields
 *  (the upstream response also carries submitter contact details, which
 *  this app deliberately never forwards). */
export interface RinfDataset {
  id: string;
  fileName: string;
  /** e.g. "RDF_FULL", "XML_FULL", "RDF_PARTIAL_MERGE". */
  type: string;
  status: string;
  sizeBytes: number | null;
  /** ISO 8601 timestamp, or null when the explorer doesn't report one. */
  publishedAt: string | null;
  imCode: string;
  imName: string;
  /** RINF country code (same convention as CountryInfo.code, e.g. "EL"). */
  countryCode: string;
  countryName: string;
}

/** Infrastructure classes served as optional map layers by
 *  GET /api/infrastructure/:kind. RINF only has these for a few countries
 *  (surveyed 2026-10: AT, NO, EL, LT), so an empty collection is a normal
 *  answer, not an error. */
export const INFRASTRUCTURE_KINDS = [
  "level-crossings",
  "bridges",
  "signals",
  "switches",
] as const;
export type InfrastructureKind = (typeof INFRASTRUCTURE_KINDS)[number];

export interface InfrastructureProperties {
  rinfUri: string;
  kind: InfrastructureKind;
  label: FieldValue<string>;
  /** Class-specific type, where RINF has one (era:signalType). */
  subtype?: FieldValue<RinfLink>;
}

/** Geometry varies by provider: points, lines (bridges), polygons
 *  (Austrian switches and level crossings), or collections of these. */
export type InfrastructureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  InfrastructureProperties
>;

/** Running-track parameters that can be rolled up per section of line —
 *  for colouring the map and for the line profile. */
export const TRACK_PARAMETERS = [
  "maxSpeed",
  "electrification",
  "gauge",
  "etcsLevel",
] as const;
export type TrackParameterId = (typeof TRACK_PARAMETERS)[number];

/** What a section's running tracks say about one parameter.
 *  - numeric: lowest and highest value across the tracks that have one;
 *  - categorical: every distinct value across the tracks, as concept IRIs
 *    (or the synthetic NOT_ELECTRIFIED value), labels in `categories`.
 *  A section absent from `values` has no track with this parameter in
 *  RINF — rendered as "no data", never as a default. */
export type SectionParameterValue =
  | { kind: "numeric"; min: number; max: number }
  | { kind: "categorical"; values: string[] };

export interface SectionParameters {
  param: TrackParameterId;
  kind: "numeric" | "categorical";
  unit?: string;
  /** Keyed by section-of-line IRI (SectionOfLineProperties.rinfUri). */
  values: Record<string, SectionParameterValue>;
  /** Labels for categorical values. `label` is absent when RINF's own
   *  vocabulary has no label for the code (some are referenced by data
   *  but not defined); the UI then shows the code itself. */
  categories: { value: string; label?: string; sections: number }[];
}

/** Synthetic electrification value: a contact-line system of type "Not
 *  electrified" (RINF models non-electrified track that way, without an
 *  energy supply system). Distinct from "no data": tracks with no
 *  contact-line system at all are simply absent. */
export const NOT_ELECTRIFIED = "urn:carto-rinf:not-electrified";

/** Typed detail of one section of line (GET /api/sections-of-line/detail). */
export interface SectionOfLineDetail {
  rinfUri: string;
  label: FieldValue<string>;
  lengthKm: FieldValue<number>;
  nature: FieldValue<RinfLink>;
  nationalLine: FieldValue<RinfLink>;
  infrastructureManager: FieldValue<RinfLink>;
  opStart: { uopid: string; name: FieldValue<string> };
  opEnd: { uopid: string; name: FieldValue<string> };
  validityPeriod: FieldValue<string>;
  /** Count of running tracks (a derived aggregate: absent means zero). */
  runningTracks: number;
  parameters: Partial<Record<TrackParameterId, SectionParameterValue>>;
  /** Labels for the categorical values in `parameters`. */
  categoryLabels: Record<string, string>;
}

/** One national line in a country (era:nationalLine), for the line picker. */
export interface NationalLine {
  iri: string;
  label: string;
  sections: number;
  lengthKm: number;
}

export interface LineProfileSegment {
  rinfUri: string;
  /** Position along the chained line, in km from its start. */
  startKm: number;
  endKm: number;
  /** False when RINF has no length for this section: it's drawn with a
   *  nominal width so the sequence stays readable, and flagged. */
  lengthKnown: boolean;
  /** Whether the section runs opEnd → opStart in this chain. */
  reversed: boolean;
  from: { uopid: string; name: FieldValue<string> };
  to: { uopid: string; name: FieldValue<string> };
  parameters: Partial<Record<TrackParameterId, SectionParameterValue>>;
}

export interface LineProfile {
  line: { iri: string; label: string };
  /** One run per connected group of sections, longest first. Within a
   *  run, consecutive segments share an operational point. */
  runs: LineProfileSegment[][];
  categoryLabels: Record<string, string>;
}

/** Every API response is wrapped so the frontend can distinguish a live
 *  endpoint/network failure from legitimately-absent RINF data. */
export type ApiEnvelope<T> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string };
