import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@dashboard/index.css'
import App from '@dashboard/App.jsx'
import DocsScreen from './DocsScreen.jsx'
import './demo.css'

const DOCS = {
  key: 'docs',
  label: 'Docs',
  icon: 'docs',
  subtitle: 'The problem, our solution, what we do differently, and how we measure it.',
  render: ({ go }) => <DocsScreen go={go} />,
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App extraScreens={[DOCS]} />
  </StrictMode>,
)
