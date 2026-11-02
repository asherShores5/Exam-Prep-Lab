/** Lazy entry for /admin (main.tsx). Kept out of the main bundle; see vite.config.ts globIgnores. */
import { AdminPage } from './AdminPage';
import { readAdminConfig } from './config';

const config = readAdminConfig(import.meta.env, window.location.origin);

export default function AdminApp() {
  return <AdminPage config={config} />;
}
