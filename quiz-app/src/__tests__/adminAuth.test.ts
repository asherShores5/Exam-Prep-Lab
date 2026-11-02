import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginSignIn,
  completeSignIn,
  createPkcePair,
  getAccessToken,
  signOut,
  type AdminAuthConfig,
} from '../admin/auth';

const CONFIG: AdminAuthConfig = {
  domain: 'https://exampreplab-admin.auth.us-west-1.amazoncognito.com',
  clientId: 'client123',
  redirectUri: 'https://exampreplab.ashershores.com/admin',
};
const NOW = 1_800_000_000_000;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe('PKCE', () => {
  it('makes a URL-safe verifier and its S256 challenge (RFC 7636 appendix B example)', async () => {
    // Known-good pair from RFC 7636 Appendix B.
    const bytes = new Uint8Array([
      116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191,
      240, 91, 88, 5, 88, 83, 132, 141, 121,
    ]);
    const pair = await createPkcePair(() => bytes);
    expect(pair.verifier).toBe('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(pair.challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('sign-in', () => {
  it('sends the owner to the hosted UI with a code + S256 PKCE request and remembers the verifier for this tab', async () => {
    const url = new URL(await beginSignIn(CONFIG));
    expect(url.origin + url.pathname).toBe(`${CONFIG.domain}/oauth2/authorize`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: 'client123',
      redirect_uri: CONFIG.redirectUri,
      scope: 'openid',
      code_challenge_method: 'S256',
      code_challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      state: expect.stringMatching(/^[A-Za-z0-9_-]{22,}$/),
    });
    expect(sessionStorage.length).toBeGreaterThan(0);
    expect(localStorage.length).toBe(0);
  });

  it('trades the returned code for an access token, sending the stored verifier, and keeps it in sessionStorage only', async () => {
    const authorizeUrl = new URL(await beginSignIn(CONFIG));
    const state = authorizeUrl.searchParams.get('state')!;
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'AT', id_token: 'IT', refresh_token: 'RT', expires_in: 3600, token_type: 'Bearer' }), { status: 200 }),
    );

    const ok = await completeSignIn(CONFIG, `?code=abc&state=${state}`, { fetchFn, now: () => NOW });
    expect(ok).toBe(true);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${CONFIG.domain}/oauth2/token`);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/x-www-form-urlencoded' });
    const form = new URLSearchParams(init.body);
    expect(Object.fromEntries(form)).toEqual({
      grant_type: 'authorization_code',
      client_id: 'client123',
      code: 'abc',
      redirect_uri: CONFIG.redirectUri,
      code_verifier: expect.stringMatching(/^[A-Za-z0-9_-]{43,128}$/),
    });

    expect(getAccessToken(() => NOW)).toBe('AT');
    expect(localStorage.length).toBe(0);
    // Only the access token is kept: no refresh or ID token at rest.
    const stored = Object.keys(sessionStorage).map((k) => sessionStorage.getItem(k)).join('');
    expect(stored).not.toContain('RT');
    expect(stored).not.toContain('IT');
  });

  it('refuses a callback whose state does not match, and never calls the token endpoint', async () => {
    await beginSignIn(CONFIG);
    const fetchFn = vi.fn();
    expect(await completeSignIn(CONFIG, '?code=abc&state=forged', { fetchFn, now: () => NOW })).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(getAccessToken(() => NOW)).toBeNull();
  });

  it('refuses a callback when no sign-in was started in this tab', async () => {
    const fetchFn = vi.fn();
    expect(await completeSignIn(CONFIG, '?code=abc&state=x', { fetchFn, now: () => NOW })).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('uses the verifier once: a replayed callback is refused', async () => {
    const state = new URL(await beginSignIn(CONFIG)).searchParams.get('state')!;
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), { status: 200 }));
    await completeSignIn(CONFIG, `?code=abc&state=${state}`, { fetchFn, now: () => NOW });
    expect(await completeSignIn(CONFIG, `?code=abc&state=${state}`, { fetchFn, now: () => NOW })).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('stays signed out when the token endpoint refuses the code', async () => {
    const state = new URL(await beginSignIn(CONFIG)).searchParams.get('state')!;
    const fetchFn = vi.fn().mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 400 }));
    expect(await completeSignIn(CONFIG, `?code=abc&state=${state}`, { fetchFn, now: () => NOW })).toBe(false);
    expect(getAccessToken(() => NOW)).toBeNull();
  });
});

describe('session', () => {
  async function signIn() {
    const state = new URL(await beginSignIn(CONFIG)).searchParams.get('state')!;
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), { status: 200 }));
    await completeSignIn(CONFIG, `?code=abc&state=${state}`, { fetchFn, now: () => NOW });
  }

  it('treats the token as gone a minute before it expires', async () => {
    await signIn();
    expect(getAccessToken(() => NOW + 3600_000 - 61_000)).toBe('AT');
    expect(getAccessToken(() => NOW + 3600_000 - 59_000)).toBeNull();
  });

  it('ignores a corrupted stored session', () => {
    sessionStorage.setItem('epl_admin_session', '{not json');
    expect(getAccessToken(() => NOW)).toBeNull();
  });

  it('signing out forgets the token and returns the hosted UI logout URL', async () => {
    await signIn();
    const url = new URL(signOut(CONFIG));
    expect(url.origin + url.pathname).toBe(`${CONFIG.domain}/logout`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ client_id: 'client123', logout_uri: CONFIG.redirectUri });
    expect(getAccessToken(() => NOW)).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
});
