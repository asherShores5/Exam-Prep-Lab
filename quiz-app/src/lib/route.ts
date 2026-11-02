/** True for the unlinked owner-only Admin Page (SPEC §9.3): `/admin` or `/admin/`. */
export function isAdminPath(pathname: string): boolean {
  return /^\/admin\/?$/.test(pathname);
}
