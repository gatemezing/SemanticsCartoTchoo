import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  // maplibre-gl loads its tiling worker via `new Worker(new URL(...))`;
  // Vite's dependency pre-bundling rewrites that URL and breaks it
  // (worker request 404s, so GeoJSON sources silently never render).
  // Excluding it from pre-bundling serves it straight from node_modules,
  // where the relative worker URL resolves correctly.
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
});
