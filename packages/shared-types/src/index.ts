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
  opStartUopid: string;
  opEndUopid: string;
  opStartName: FieldValue<string>;
  opEndName: FieldValue<string>;
  /** Always true today: RINF only carries the two endpoint coordinates, not
   *  a real track polyline. The UI must render this fact, not hide it. */
  geometryIsApproximate: true;
}

export type SectionOfLineFeature = GeoJSON.Feature<
  GeoJSON.LineString,
  SectionOfLineProperties
>;

export type SectionOfLineCollection = GeoJSON.FeatureCollection<
  GeoJSON.LineString,
  SectionOfLineProperties
>;

export interface TunnelProperties {
  rinfUri: string;
  name: FieldValue<string>;
  lengthMetres: FieldValue<number>;
}

export type TunnelFeature = GeoJSON.Feature<GeoJSON.LineString, TunnelProperties>;

export type TunnelsCollection = GeoJSON.FeatureCollection<
  GeoJSON.LineString,
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

/** Every API response is wrapped so the frontend can distinguish a live
 *  endpoint/network failure from legitimately-absent RINF data. */
export type ApiEnvelope<T> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string };
