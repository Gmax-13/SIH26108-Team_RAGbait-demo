import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@dashboard/index.css'
import App from '@dashboard/App.jsx'
import './demo.css'

/** Always visible, so a recording is never mistaken for a live system. */
function DemoBadge() {
  return (
    <div className="demo-badge" title="No backend: every result on this site was recorded from the real pipeline and is replayed here.">
      <i aria-hidden="true" />Offline demo · recorded results
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <DemoBadge />
  </StrictMode>,
)
