/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Activity API base URL (no trailing /activity). Unset = Activity recording is off. */
  readonly VITE_ACTIVITY_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
