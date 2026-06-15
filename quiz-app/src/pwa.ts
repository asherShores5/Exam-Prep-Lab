/**
 * pwa.ts — service-worker registration + update prompt (SPEC §3.6).
 *
 * Uses vite-plugin-pwa's virtual module with registerType: 'prompt', so a new
 * version is NOT applied silently — the user is offered a reload. To avoid
 * coupling to React, the prompt is a small injected banner.
 *
 * No-op in dev (the virtual module is a stub) and when SW is unsupported.
 */

import { registerSW } from 'virtual:pwa-register';

function showUpdateBanner(onReload: () => void): void {
  if (document.getElementById('pwa-update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-update-banner';
  banner.setAttribute('role', 'status');
  banner.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:16px', 'transform:translateX(-50%)',
    'z-index:9999', 'display:flex', 'align-items:center', 'gap:12px',
    'padding:10px 16px', 'border-radius:10px',
    'background:#1f2937', 'color:#f3f4f6', 'border:1px solid #374151',
    'box-shadow:0 4px 16px rgba(0,0,0,.4)', 'font:14px system-ui,sans-serif',
  ].join(';');

  const text = document.createElement('span');
  text.textContent = 'A new version is available.';

  const reloadBtn = document.createElement('button');
  reloadBtn.textContent = 'Reload';
  reloadBtn.style.cssText = 'padding:4px 12px;border-radius:6px;background:#2563eb;color:#fff;border:0;cursor:pointer;font:inherit;';
  reloadBtn.onclick = onReload;

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Later';
  dismissBtn.setAttribute('aria-label', 'Dismiss update notice');
  dismissBtn.style.cssText = 'padding:4px 10px;border-radius:6px;background:transparent;color:#9ca3af;border:0;cursor:pointer;font:inherit;';
  dismissBtn.onclick = () => banner.remove();

  banner.append(text, reloadBtn, dismissBtn);
  document.body.appendChild(banner);
}

export function registerPwa(): void {
  const updateSW = registerSW({
    onNeedRefresh() {
      showUpdateBanner(() => { updateSW(true); });
    },
  });
}
