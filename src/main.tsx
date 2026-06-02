import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from "./Toast"
import { DraftProvider } from "./DraftContext"
import { ErrorBoundary } from "./ErrorBoundary"

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <ToastProvider>
      <DraftProvider>
        <App />
      </DraftProvider>
    </ToastProvider>
  </ErrorBoundary>
)
