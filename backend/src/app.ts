import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { ApiEnvelope } from "@carto-rinf/shared-types";
import {
  CORS_ORIGINS,
  RATE_LIMIT_PER_MINUTE,
  TRUST_PROXY,
} from "./config.js";
import { registerCountriesRoute } from "./routes/countries.js";
import { registerDatasetsRoute } from "./routes/datasets.js";
import { registerDescribeRoute } from "./routes/describe.js";
import { registerInfrastructureRoute } from "./routes/infrastructure.js";
import { registerLinesRoutes } from "./routes/lines.js";
import { registerOperationalPointsRoute } from "./routes/operationalPoints.js";
import { registerPrimaryLocationsRoute } from "./routes/primaryLocations.js";
import { registerSectionDetailRoute } from "./routes/sectionDetail.js";
import { registerSectionParametersRoute } from "./routes/sectionParameters.js";
import { registerSectionsOfLineRoute } from "./routes/sectionsOfLine.js";
import { registerTunnelsRoute } from "./routes/tunnels.js";

export interface AppOptions {
  logger?: boolean;
  corsOrigins?: string[];
  rateLimitPerMinute?: number;
  trustProxy?: boolean | string[];
}

/** Builds the API without listening, so tests can drive it with
 *  `app.inject()`. Defaults come from the environment (see config.ts). */
export async function buildApp({
  logger = true,
  corsOrigins = CORS_ORIGINS,
  rateLimitPerMinute = RATE_LIMIT_PER_MINUTE,
  trustProxy = TRUST_PROXY,
}: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    trustProxy,
    // Time allowed to *receive* a request (slow-header/slow-body clients),
    // not to answer it — cold SPARQL loads legitimately take minutes.
    requestTimeout: 30_000,
  });

  // Only when configured: same-origin deployments need no CORS at all, and
  // a wildcard would let any site drive this server's upstream load.
  if (corsOrigins.length > 0) {
    await app.register(cors, { origin: corsOrigins, methods: ["GET"] });
  }

  await app.register(rateLimit, {
    max: rateLimitPerMinute,
    timeWindow: "1 minute",
    errorResponseBuilder: (_request, context): ApiEnvelope<never> & { statusCode: number } => ({
      statusCode: context.statusCode,
      status: "error",
      message: `Too many requests — limit is ${context.max} per ${context.after}. Please retry shortly.`,
    }),
  });

  // Baseline headers for JSON responses, so they hold even when the API
  // is exposed directly (the GitHub Pages deployment) rather than behind
  // the nginx config that sets the page-level policy.
  app.addHook("onSend", async (_request, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-frame-options", "DENY");
    reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
  });

  registerCountriesRoute(app);
  registerOperationalPointsRoute(app);
  registerSectionsOfLineRoute(app);
  registerTunnelsRoute(app);
  registerPrimaryLocationsRoute(app);
  registerDescribeRoute(app);
  registerDatasetsRoute(app);
  registerInfrastructureRoute(app);
  registerSectionParametersRoute(app);
  registerSectionDetailRoute(app);
  registerLinesRoutes(app);

  app.get("/api/health", { config: { rateLimit: false } }, async () => ({
    status: "ok",
  }));

  return app;
}
