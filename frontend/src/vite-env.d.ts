/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute URL of a separately-hosted backend (e.g. for a GitHub Pages
   *  build with no same-origin API). Empty/unset means relative `/api/...`
   *  calls — see frontend/src/api/client.ts. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
