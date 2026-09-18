import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiEnvelope } from "@carto-rinf/shared-types";
import { getCountry, type CountryInfo } from "../countries.js";
import { DEFAULT_COUNTRY_UOPID_PREFIX } from "../config.js";

/** Shared by every data route: resolves `?country=` against the registry
 *  (see ../countries.ts), defaulting to France for links from before
 *  multi-country support. Sends a 400 itself on an unknown code — callers
 *  just check for `undefined` and return. */
export function resolveCountry(
  request: FastifyRequest,
  reply: FastifyReply,
): CountryInfo | undefined {
  const raw =
    (request.query as { country?: string }).country ??
    DEFAULT_COUNTRY_UOPID_PREFIX;
  const country = getCountry(raw);
  if (!country) {
    reply.code(400);
    const body: ApiEnvelope<never> = {
      status: "error",
      message: `Unknown country code "${raw}" — see /api/countries for the supported list.`,
    };
    reply.send(body);
    return undefined;
  }
  return country;
}
