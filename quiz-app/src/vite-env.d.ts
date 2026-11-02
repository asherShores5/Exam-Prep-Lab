/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Activity API base URL (output ActivityApiUrl; no trailing /activity). Unset = Activity recording is off. */
  readonly VITE_ACTIVITY_API?: string;
  /** Cognito hosted UI base URL (output HostedUiDomain). */
  readonly VITE_COGNITO_DOMAIN?: string;
  /** Cognito app client id (output ClientId). */
  readonly VITE_COGNITO_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
