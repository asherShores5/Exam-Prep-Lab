import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerPwa } from './pwa'
import { ToastProvider } from './components/ui/toast'
import { isAdminPath } from './lib/route'

// The owner-only Admin Page (SPEC §9.3) is its own chunk: Learners never download it, and it
// sits outside the LearnerGate so it records no Activity.
const AdminApp = lazy(() => import('./admin/AdminApp'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdminPath(window.location.pathname) ? (
      <Suspense fallback={null}>
        <AdminApp />
      </Suspense>
    ) : (
      <ToastProvider>
        <App />
      </ToastProvider>
    )}
  </StrictMode>,
)

registerPwa()
