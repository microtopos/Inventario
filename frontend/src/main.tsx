import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from "./Toast"
import { DraftProvider } from "./DraftContext"

createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <DraftProvider>
      <App />
    </DraftProvider>
  </ToastProvider>
)
