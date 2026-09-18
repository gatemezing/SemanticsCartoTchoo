import type {
  ApiEnvelope,
  CountryInfo,
  OperationalPointDetail,
  OperationalPointsCollection,
  PrimaryLocationsCollection,
  SectionOfLineCollection,
  TunnelsCollection,
} from "@carto-rinf/shared-types";

async function getEnvelope<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("Could not reach the backend API — is it running?");
  }

  let body: ApiEnvelope<T>;
  try {
    body = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new Error(
      `Backend API returned an unexpected (non-JSON) response, HTTP ${response.status}`,
    );
  }

  if (body.status === "error") throw new Error(body.message);
  return body.data;
}

export function fetchCountries(): Promise<CountryInfo[]> {
  return getEnvelope("/api/countries");
}

export function fetchOperationalPoints(
  country: string,
): Promise<OperationalPointsCollection> {
  return getEnvelope(`/api/operational-points?country=${country}`);
}

export function fetchSectionsOfLine(
  country: string,
): Promise<SectionOfLineCollection> {
  return getEnvelope(`/api/sections-of-line?country=${country}`);
}

export function fetchTunnels(country: string): Promise<TunnelsCollection> {
  return getEnvelope(`/api/tunnels?country=${country}`);
}

export function fetchPrimaryLocations(
  country: string,
): Promise<PrimaryLocationsCollection> {
  return getEnvelope(`/api/primary-locations?country=${country}`);
}

export function fetchOperationalPointDetail(
  uopid: string,
): Promise<OperationalPointDetail> {
  return getEnvelope(`/api/operational-points/${encodeURIComponent(uopid)}`);
}
