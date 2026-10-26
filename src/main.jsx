import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ErrorBoundary from './ErrorBoundary.jsx'
import { installGlobalErrorHandlers } from './errorLogger.js'

installGlobalErrorHandlers()
const App = lazy(() => import('./App.jsx'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<main className="min-h-screen bg-slate-950 p-8 text-slate-100">Loading admin…</main>}>
        <App />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
)
