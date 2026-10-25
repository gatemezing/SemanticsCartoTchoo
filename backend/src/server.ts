import { buildApp } from "./app.js";
import { PORT } from "./config.js";

const app = await buildApp();

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
