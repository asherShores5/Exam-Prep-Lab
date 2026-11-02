import type { AdminPageConfig } from './AdminPage';

export interface AdminEnv {
  VITE_ACTIVITY_API?: string;
  VITE_COGNITO_DOMAIN?: string;
  VITE_COGNITO_CLIENT_ID?: string;
}

const httpsUrl = (v: string | undefined) => {
  try {
    return v && new URL(v).protocol === 'https:' ? v : null;
  } catch {
    return null;
  }
};

/** Admin Page settings from build-time env (stack outputs), or null if any is missing. */
export function readAdminConfig(env: AdminEnv, origin: string): AdminPageConfig | null {
  const api = httpsUrl(env.VITE_ACTIVITY_API);
  const domain = httpsUrl(env.VITE_COGNITO_DOMAIN);
  const clientId = env.VITE_COGNITO_CLIENT_ID;
  if (!api || !domain || !clientId) return null;
  return { api, auth: { domain: domain.replace(/\/+$/, ''), clientId, redirectUri: `${origin}/admin` } };
}
