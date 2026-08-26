import { useEffect, useState } from 'react'
import { getStats, postBatch, postBatchUpload, postRecommend } from './api'
import BatchReport from './components/BatchReport'
import IngestionPanel from './components/IngestionPanel'
import ResultView from './components/ResultView'
import StandardDetail from './components/StandardDetail'

const EXAMPLES = [
  { label: 'PVC insulated copper cable, 1100 V', q: 'PVC insulated unsheathed copper conductor cable for internal wiring, rated 1100 V' },
  { label: 'Earthing of an installation', q: 'earthing and equipotential bonding for a low voltage electrical installation' },
  { label: 'Conduits for concealed wiring', q: 'rigid non-metallic conduit for concealed and surface electrical wiring' },
  { label: 'LED lamp for general lighting', q: 'self-ballasted LED lamp for general lighting service' },
  { label: '⃠ Ambiguous — should abstain', q: 'good quality durable product for general use', demo: true },
]

function SingleQuery({ onOpen }) {
  const [q, setQ] = useState(EXAMPLES[0].q)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState(null)

  const run = async (text) => {
    const query = text ?? q
    setBusy(true); setErr(null); setRes(null)
    try {
      setRes(await postRecommend({ query }))
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="panel">
        <h2>Product description or requirement</h2>
        <textarea rows={3} value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. PVC insulated copper conductor cable for internal wiring, 1100 V" />
        <div className="row" style={{ marginTop: 11 }}>
          <button className="primary" onClick={() => run()} disabled={busy || q.trim().length < 3}>
            {busy ? 'Analysing…' : 'Recommend standard'}
          </button>
          <span className="small muted">
            Retrieval → graph expansion → synthesis → grounding check → currency → certification
          </span>
        </div>
        <div className="examples">
          {EXAMPLES.map((e, i) => (
            <button key={i} className={e.demo ? 'demo' : ''}
              onClick={() => { setQ(e.q); run(e.q) }}>{e.label}</button>
          ))}
        </div>
      </div>
      {err && <div className="err">{err}</div>}
      <ResultView result={res} onOpen={onOpen} />
    </>
  )
}

function BatchMode() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [rep, setRep] = useState(null)
  const [err, setErr] = useState(null)

  const loadSample = async () => {
    try {
      const r = await fetch('/sample_tender.txt')
      if (r.ok) setText(await r.text())
      else setErr('Sample tender not found — copy data/seed/sample_tender.txt into frontend/public/')
    } catch (e) { setErr(String(e)) }
  }

  const run = async () => {
    setBusy(true); setErr(null); setRep(null)
    try {
      setRep(await postBatch({ text }))
    } catch (e) { setErr(String(e)) } finally { setBusy(false) }
  }

  const upload = async (f) => {
    if (!f) return
    setBusy(true); setErr(null); setRep(null)
    try {
      setRep(await postBatchUpload(f))
    } catch (e) { setErr(String(e)) } finally { setBusy(false) }
  }

  return (
    <>
      <div className="panel">
        <h2>Tender / specification document</h2>
        <textarea rows={9} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Paste the full tender or technical specification text here…" />
        <div className="row" style={{ marginTop: 11 }}>
          <button className="primary" onClick={run} disabled={busy || text.trim().length < 20}>
            {busy ? 'Processing…' : 'Generate compliance report'}
          </button>
          <button className="ghost" onClick={loadSample}>load sample tender</button>
          <label className="ghost" style={{ cursor: 'pointer' }}>
            upload PDF/TXT
            <input type="file" accept=".pdf,.txt" style={{ display: 'none' }}
              onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </div>
        <p className="small muted" style={{ marginBottom: 0, marginTop: 9 }}>
          Each extracted requirement runs through the same pipeline as a single query,
          then results are aggregated into one quantified report.
        </p>
      </div>
      {err && <div className="err">{err}</div>}
      <BatchReport report={rep} />
    </>
  )
}

function Explore({ isNumber, setIsNumber }) {
  const [text, setText] = useState(isNumber || '')
  useEffect(() => { if (isNumber) setText(isNumber) }, [isNumber])
  return (
    <>
      <div className="panel">
        <h2>Look up a standard</h2>
        <div className="row">
          <input type="text" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setIsNumber(text.trim())}
            placeholder="e.g. IS 732:2019" style={{ flex: 1, minWidth: 220 }} />
          <button className="primary" onClick={() => setIsNumber(text.trim())}>Open</button>
        </div>
        <p className="small muted" style={{ marginBottom: 0, marginTop: 8 }}>
          Exact IS number as it appears in the catalogue. Graph nodes and cited
          standards elsewhere in the app link here.
        </p>
      </div>
      <StandardDetail isNumber={isNumber} onOpen={setIsNumber} />
    </>
  )
}

export default function App() {
  const [tab, setTab] = useState('single')
  const [health, setHealth] = useState(null)
  const [focus, setFocus] = useState(null)

  // Opening a standard from anywhere (a graph node, a citation) switches to the
  // Explore tab focused on it.
  const openStandard = (n) => { if (n) { setFocus(n); setTab('explore') } }

  useEffect(() => { getStats().then(setHealth).catch(() => setHealth(false)) }, [])

  return (
    <div className="app">
      <header className="top">
        <h1>Indian Standards Recommendation Engine</h1>
        <span className="sub">semantic matching · dependency graph · grounded citations · explicit abstention</span>
        <span className="spacer" />
        {health === false && <span className="badge danger">API unreachable</span>}
        {health && (
          <span className="row small muted">
            <span className="badge muted">{health.standards} standards</span>
            <span className="badge muted">{health.with_full_text} full text</span>
            <span className={`badge ${health.llm_configured ? 'ok' : 'warn'}`}>
              {health.llm_configured ? 'LLM ready' : 'no LLM key'}
            </span>
          </span>
        )}
      </header>

      <nav className="tabs">
        <button className={tab === 'single' ? 'active' : ''} onClick={() => setTab('single')}>
          Single query
        </button>
        <button className={tab === 'batch' ? 'active' : ''} onClick={() => setTab('batch')}>
          Batch tender mode
        </button>
        <button className={tab === 'explore' ? 'active' : ''} onClick={() => setTab('explore')}>
          Explore a standard
        </button>
        <button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}>
          Dataset &amp; ingestion log
        </button>
      </nav>

      {tab === 'single' && <SingleQuery onOpen={openStandard} />}
      {tab === 'batch' && <BatchMode />}
      {tab === 'explore' && <Explore isNumber={focus} setIsNumber={setFocus} />}
      {tab === 'data' && <IngestionPanel />}
    </div>
  )
}
