// @vitest-environment node
/**
 * Ticket 11 / SPEC §9.5: the Amplify headers in ../customHttp.yml.
 * Seams: index.html (the inline scripts the browser will run) against the CSP that will
 * allow them, and infra's Cognito hosted-UI prefix against connect-src / form-action.
 * Editing the inline theme script without updating its hash fails here instead of
 * silently breaking the theme in production.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_ROOT = resolve(__dirname, '..', '..');
const REPO_ROOT = resolve(APP_ROOT, '..');
const read = (p: string) => readFileSync(p, 'utf8');

const customHttp = read(resolve(REPO_ROOT, 'customHttp.yml'));

/** The CSP value on the '**\/*' pattern (the only place it is set). */
function csp(): Map<string, string[]> {
  const m = customHttp.match(/key:\s*['"]?Content-Security-Policy['"]?\s*\n\s*value:\s*(['"])(.*?)\1/);
  if (!m) throw new Error('No Content-Security-Policy header in customHttp.yml');
  const directives = new Map<string, string[]>();
  for (const part of m[2].split(';').map((s) => s.trim()).filter(Boolean)) {
    const [name, ...sources] = part.split(/\s+/);
    directives.set(name, sources);
  }
  return directives;
}

/** Bodies of <script> elements without a src attribute, exactly as the browser hashes them. */
function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

const sha256 = (body: string) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;

function headersFor(pattern: string): string {
  const start = customHttp.indexOf(`pattern: '${pattern}'`);
  if (start < 0) throw new Error(`No pattern ${pattern}`);
  const next = customHttp.indexOf('- pattern:', start + 1);
  return customHttp.slice(start, next < 0 ? undefined : next);
}

describe('CSP script hashes match index.html', () => {
  const scripts = inlineScripts(read(resolve(APP_ROOT, 'index.html')));

  it('finds the inline theme script', () => {
    expect(scripts.length).toBe(1);
    expect(scripts[0]).toContain('epl_theme');
  });

  it('allows every inline script by hash and nothing by unsafe-inline', () => {
    const scriptSrc = csp().get('script-src') ?? [];
    for (const body of scripts) expect(scriptSrc, `customHttp.yml script-src needs ${sha256(body)}`).toContain(sha256(body));
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });
});

describe('CSP origins match infra', () => {
  const prefix = read(resolve(REPO_ROOT, 'infra', 'lib', 'api-stack.ts')).match(/HOSTED_UI_PREFIX\s*=\s*"([^"]+)"/)?.[1];
  const hostedUi = `https://${prefix}.auth.us-west-1.amazoncognito.com`;

  it('lets the admin page call the Cognito token endpoint and the API', () => {
    expect(prefix).toBeTruthy();
    const connect = csp().get('connect-src') ?? [];
    expect(connect).toContain("'self'");
    expect(connect).toContain(hostedUi);
    expect(connect).toContain('https://f2qdrtmrgh.execute-api.us-west-1.amazonaws.com');
  });

  it('lets forms go only to self and the hosted UI', () => {
    expect(csp().get('form-action')).toEqual(["'self'", hostedUi]);
  });
});

describe('locked-down directives and headers', () => {
  it('denies framing, plugins and base rewriting', () => {
    const d = csp();
    expect(d.get('default-src')).toEqual(["'self'"]);
    expect(d.get('frame-ancestors')).toEqual(["'none'"]);
    expect(d.get('object-src')).toEqual(["'none'"]);
    expect(d.get('base-uri')).toEqual(["'self'"]);
  });

  it('sends HSTS, nosniff, referrer, permissions and COOP on every path', () => {
    const all = headersFor('**/*');
    expect(all).toMatch(/Strict-Transport-Security['"]?\s*\n\s*value:\s*['"]max-age=31536000; includeSubDomains['"]/);
    expect(all).toMatch(/X-Content-Type-Options['"]?\s*\n\s*value:\s*['"]nosniff['"]/);
    expect(all).toMatch(/Referrer-Policy['"]?\s*\n\s*value:\s*['"]strict-origin-when-cross-origin['"]/);
    expect(all).toMatch(/Permissions-Policy['"]?\s*\n\s*value:\s*['"]camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\)['"]/);
    expect(all).toMatch(/Cross-Origin-Opener-Policy['"]?\s*\n\s*value:\s*['"]same-origin['"]/);
  });

  it('never caches the service worker or the HTML shell', () => {
    for (const p of ['/sw.js', '/index.html']) {
      expect(headersFor(p)).toMatch(/Cache-Control['"]?\s*\n\s*value:\s*['"]no-cache['"]/);
    }
  });
});
