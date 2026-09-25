import { useEffect, useState } from 'react'
import { getStats } from './api'
import Sidebar, { NAV } from './components/Sidebar'
import QueryScreen from './components/QueryScreen'
import GraphExplorer from './components/GraphExplorer'
import SettingsScreen from './components/SettingsScreen'
import IngestionPanel from './components/IngestionPanel'
import BatchReport from './components/BatchReport'

const SUBTITLES = {
  query: 'Match a requirement to the Indian Standards that govern it.',
  dashboard: 'What is in the corpus, and how it was built.',
  graph: 'Every standard and the dependencies between them.',
  reports: 'Tender compliance reports generated from uploaded documents.',
  settings: 'Retrieval parameters and the abstention threshold.',
}

function TopBar({ title, subtitle, onMenu }) {
  return (
    <header className="topbar">
      <div className="tb-inner">
        <button className="hamburger" onClick={onMenu} aria-label="Open navigation">
          <svg viewBox="0 0 20 20"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
        </button>
        <div className="tb-title">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
    </header>
  )
}

function ReportsScreen({ report, onOpen, goUpload }) {
  if (!report) {
    return (
      <div className="card empty-state">
        <svg viewBox="0 0 24 24" className="es-icon" aria-hidden="true">
          <path d="M6 2h9l4 4v16H6z M15 2v4h4 M9 12h7 M9 16h7 M9 8h4" />
        </svg>
        <h2>No report yet</h2>
        <p>
          Upload a tender or specification and every requirement in it is run through
          the same pipeline as a single query, then aggregated into one compliance
          report — matched standards, outdated citations and certification flags.
        </p>
        <button className="primary" onClick={goUpload}>Upload a document</button>
      </div>
    )
  }
  return <BatchReport report={report} onOpen={onOpen} />
}

/** `extraScreens` lets a host add screens without forking the app — the demo
 *  site adds its Docs this way. Each is { key, label, icon, subtitle, render },
 *  inserted into the sidebar before Settings. */
export default function App({ extraScreens = [] }) {
  const [screen, setScreen] = useState('query')
  const [navOpen, setNavOpen] = useState(false)
  const [health, setHealth] = useState(null)
  const [focus, setFocus] = useState(null)

  // Screen panels unmount when you navigate away, so their state lives here —
  // otherwise a result that took ten seconds to compute is destroyed the moment
  // you glance at the graph and come back.
  const [single, setSingle] = useState({ q: '', busy: false, res: null, err: null, stages: {} })
  const [batch, setBatch] = useState({ text: '', file: null, busy: false, err: null, cap: 3 })
  const [report, setReport] = useState(null)
  const [settings, setSettings] = useState({ threshold: 0.55, top_k: 12, hops: 2, use_llm: true })

  useEffect(() => { getStats().then(setHealth).catch(() => setHealth(false)) }, [])

  // Opening a standard from anywhere — a citation, an allied standard, a graph
  // node — lands on the graph explorer focused on it.
  const openStandard = (n) => { if (n) { setFocus(n); setScreen('graph') } }

  const onReport = (rep) => { setReport(rep); setScreen('reports') }

  const nav = [
    ...NAV.filter(([k]) => k !== 'settings'),
    ...extraScreens.map((s) => [s.key, s.label, s.icon]),
    ...NAV.filter(([k]) => k === 'settings'),
  ]
  const extra = extraScreens.find((s) => s.key === screen)
  const title = nav.find(([k]) => k === screen)?.[1]
  const subtitle = extra ? extra.subtitle : SUBTITLES[screen]

  return (
    <div className="shell">
      <Sidebar screen={screen} setScreen={setScreen} health={health} nav={nav}
               open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="main">
        <TopBar title={title} subtitle={subtitle} onMenu={() => setNavOpen(true)} />
        <main className="content">
          {screen === 'query' && (
            <QueryScreen single={single} setSingle={setSingle}
                         batch={batch} setBatch={setBatch}
                         settings={settings} onOpen={openStandard} onReport={onReport} />
          )}
          {screen === 'dashboard' && <IngestionPanel />}
          {screen === 'graph' && <GraphExplorer focus={focus} setFocus={setFocus} />}
          {screen === 'reports' && (
            <ReportsScreen report={report} onOpen={openStandard}
                           goUpload={() => setScreen('query')} />
          )}
          {screen === 'settings' && (
            <SettingsScreen settings={settings} setSettings={setSettings} health={health} />
          )}
          {extra?.render({ go: setScreen })}
        </main>
      </div>
    </div>
  )
}
