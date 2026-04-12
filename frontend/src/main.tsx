import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'  // Initialize i18next before any component renders
import './index.css'
import App from './App.tsx'
import { AppProvider } from './stores/appStore.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)
