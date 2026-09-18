import type { FastifyInstance } from "fastify";
import type { ApiEnvelope } from "@carto-rinf/shared-types";
import { COUNTRIES } from "../countries.js";

export function registerCountriesRoute(app: FastifyInstance): void {
  app.get("/api/countries", async () => {
    const body: ApiEnvelope<typeof COUNTRIES> = {
      status: "ok",
      data: COUNTRIES,
    };
    return body;
  });
}
