import '@fontsource-variable/bricolage-grotesque'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@/pdf/worker'
import './index.css'
import App from './App.tsx'
import { FishyStew } from '@/fishy/FishyStew.tsx'

export function Root() {
  const [path, setPath] = useState(() => window.location.pathname)
  useEffect(() => {
    const sync = () => setPath(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  const fishy = path === '/fishy-stew' || path.endsWith('/fishy-stew')
  if (fishy) {
    return (
      <FishyStew
        onBack={() => {
          window.history.pushState({}, '', '/')
          setPath('/')
        }}
      />
    )
  }
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
