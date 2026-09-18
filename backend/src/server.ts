import cors from "@fastify/cors";
import Fastify from "fastify";
import { PORT } from "./config.js";
import { registerCountriesRoute } from "./routes/countries.js";
import { registerOperationalPointsRoute } from "./routes/operationalPoints.js";
import { registerPrimaryLocationsRoute } from "./routes/primaryLocations.js";
import { registerSectionsOfLineRoute } from "./routes/sectionsOfLine.js";
import { registerTunnelsRoute } from "./routes/tunnels.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

registerCountriesRoute(app);
registerOperationalPointsRoute(app);
registerSectionsOfLineRoute(app);
registerTunnelsRoute(app);
registerPrimaryLocationsRoute(app);

app.get("/api/health", async () => ({ status: "ok" }));

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
