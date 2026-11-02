/**
 * Admin sign-in: Cognito hosted UI, OAuth 2.0 authorization code flow with PKCE (SPEC §9.3).
 *
 * Public client, no secret. The PKCE verifier and `state` live in sessionStorage only between
 * the redirect out and the redirect back, and are used once. After sign-in only the access token
 * (and its expiry) is kept, in sessionStorage, so it dies with the tab. No ID or refresh token is
 * stored; when the hour is up the owner signs in again.
 */

export interface AdminAuthConfig {
  /** Hosted UI base URL, e.g. https://<prefix>.auth.us-west-1.amazoncognito.com */
  domain: string;
  clientId: string;
  /** Must exactly match a callback URL on the app client. */
  redirectUri: string;
}

const SESSION_KEY = 'epl_admin_session';
const PENDING_KEY = 'epl_admin_pending';
/** Treat the token as expired this long before it really is, so a request never races expiry. */
const EXPIRY_SKEW_MS = 60_000;

interface Session {
  accessToken: string;
  expiresAt: number;
}
interface Pending {
  state: string;
  verifier: string;
}

/** The only code that touches sessionStorage; storage errors mean "no session". */
const store = {
  read<T>(key: string): T | null {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  write(key: string, value: unknown) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Private mode / storage blocked: sign-in won't survive the redirect, nothing else to do.
    }
  },
  remove(key: string) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** RFC 7636: 32 random bytes as the verifier, SHA-256 of it as the S256 challenge. */
export async function createPkcePair(random: (n: number) => Uint8Array = randomBytes) {
  const verifier = base64url(random(32));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** Starts sign-in: remembers state + verifier for this tab and returns the hosted UI URL. */
export async function beginSignIn(config: AdminAuthConfig): Promise<string> {
  const { verifier, challenge } = await createPkcePair();
  const state = base64url(randomBytes(16));
  store.write(PENDING_KEY, { state, verifier } satisfies Pending);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'openid',
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  return `${config.domain}/oauth2/authorize?${params}`;
}

export interface CompleteDeps {
  fetchFn?: typeof fetch;
  now?: () => number;
}

/**
 * Finishes sign-in from the callback's query string. Returns true when an access token was
 * stored. The pending state/verifier is consumed whatever happens, so a callback can't be replayed.
 */
export async function completeSignIn(config: AdminAuthConfig, search: string, deps: CompleteDeps = {}): Promise<boolean> {
  const { fetchFn = fetch, now = Date.now } = deps;
  const params = new URLSearchParams(search);
  const code = params.get('code');
  const state = params.get('state');
  const pending = store.read<Pending>(PENDING_KEY);
  store.remove(PENDING_KEY);
  if (!code || !state || !pending || typeof pending.verifier !== 'string' || pending.state !== state) return false;

  try {
    const res = await fetchFn(`${config.domain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        code,
        redirect_uri: config.redirectUri,
        code_verifier: pending.verifier,
      }).toString(),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') return false;
    store.write(SESSION_KEY, { accessToken: body.access_token, expiresAt: now() + body.expires_in * 1000 } satisfies Session);
    return true;
  } catch {
    return false;
  }
}

/** The stored access token, or null if there is none or it is (nearly) expired. */
export function getAccessToken(now: () => number = Date.now): string | null {
  const s = store.read<Session>(SESSION_KEY);
  if (!s || typeof s.accessToken !== 'string' || typeof s.expiresAt !== 'number') return null;
  return s.expiresAt - EXPIRY_SKEW_MS > now() ? s.accessToken : null;
}

/** Forgets the local session (e.g. after a 401). */
export function clearSession() {
  store.remove(SESSION_KEY);
  store.remove(PENDING_KEY);
}

/** Forgets the local session and returns the hosted UI logout URL to send the browser to. */
export function signOut(config: AdminAuthConfig): string {
  clearSession();
  const params = new URLSearchParams({ client_id: config.clientId, logout_uri: config.redirectUri });
  return `${config.domain}/logout?${params}`;
}
