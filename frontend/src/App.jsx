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
  { label: 'Ambiguous — should abstain', q: 'good quality durable product for general use', demo: true },
]

const PIPELINE = ['Retrieval', 'Graph expansion', 'Synthesis', 'Grounding check', 'Currency', 'Certification']

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
        <h2>What are you specifying?</h2>
        <p className="sub">
          A product description, a technical requirement, or a single tender clause.
        </p>
        <textarea rows={3} value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. PVC insulated copper conductor cable for internal wiring, 1100 V" />
        <div className="row" style={{ marginTop: 14 }}>
          <button className="primary" onClick={() => run()} disabled={busy || q.trim().length < 3}>
            {busy ? 'Analysing…' : 'Find the standard'}
          </button>
          <div className="pipeline">
            {PIPELINE.map((s, i) => (
              <span key={s} style={{ display: 'contents' }}>
                {i > 0 && <span className="arrow">→</span>}
                <span className="step">{s}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="examples">
          {EXAMPLES.map((e, i) => (
            <button key={i} className={e.demo ? 'demo' : ''}
              onClick={() => { setQ(e.q); run(e.q) }}>
              {e.demo && <span aria-hidden="true">⊘ </span>}{e.label}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="err">{err}</div>}

      {!res && !busy && !err && (
        <div className="panel empty">
          <span className="glyph" aria-hidden="true">◎</span>
          Every recommendation is checked against the source text before it is shown.
          <br />
          When the evidence does not support an answer, the system says so instead of guessing.
        </div>
      )}

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
    try { setRep(await postBatch({ text })) }
    catch (e) { setErr(String(e)) } finally { setBusy(false) }
  }

  const upload = async (f) => {
    if (!f) return
    setBusy(true); setErr(null); setRep(null)
    try { setRep(await postBatchUpload(f)) }
    catch (e) { setErr(String(e)) } finally { setBusy(false) }
  }

  return (
    <>
      <div className="panel">
        <h2>Tender or specification document</h2>
        <p className="sub">
          Every requirement is extracted, run through the same pipeline as a single
          query, then aggregated into one compliance report.
        </p>
        <textarea rows={9} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Paste the full tender or technical specification text here…" />
        <div className="row" style={{ marginTop: 14 }}>
          <button className="primary" onClick={run} disabled={busy || text.trim().length < 20}>
            {busy ? 'Processing…' : 'Generate compliance report'}
          </button>
          <button className="ghost" onClick={loadSample}>Load sample tender</button>
          <label className="ghost" style={{ cursor: 'pointer' }}>
            Upload PDF / TXT
            <input type="file" accept=".pdf,.txt" style={{ display: 'none' }}
              onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </div>
      </div>
      {err && <div className="err">{err}</div>}
      {!rep && !busy && !err && (
        <div className="panel empty">
          <span className="glyph" aria-hidden="true">▤</span>
          Load the sample tender to see extracted requirements, matched standards,
          outdated references and certification flags in one report.
        </div>
      )}
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
        <p className="sub">
          Its catalogue record, currency, certification, and every dependency it
          cites — each with the sentence that proves it.
        </p>
        <div className="row">
          <input type="text" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setIsNumber(text.trim())}
            placeholder="e.g. IS 732:2019" style={{ flex: 1, minWidth: 220 }} />
          <button className="primary" onClick={() => setIsNumber(text.trim())}>Open</button>
        </div>
      </div>
      {!isNumber && (
        <div className="panel empty">
          <span className="glyph" aria-hidden="true">⌗</span>
          Enter an IS number, or click any standard elsewhere in the app to open it here.
        </div>
      )}
      <StandardDetail isNumber={isNumber} onOpen={setIsNumber} />
    </>
  )
}

const TABS = [
  ['single', 'Single query'],
  ['batch', 'Batch tender mode'],
  ['explore', 'Explore a standard'],
  ['data', 'Dataset & ingestion log'],
]

export default function App() {
  const [tab, setTab] = useState('single')
  const [health, setHealth] = useState(null)
  const [focus, setFocus] = useState(null)

  // Opening a standard from anywhere (a graph node, a citation) switches to the
  // Explore tab focused on it.
  const openStandard = (n) => { if (n) { setFocus(n); setTab('explore') } }

  useEffect(() => { getStats().then(setHealth).catch(() => setHealth(false)) }, [])

  const fmt = (n) => (n ?? 0).toLocaleString()

  return (
    <>
      <header className="masthead">
        <div className="masthead-inner">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">IS</div>
            <div className="brand-text">
              <h1>Indian Standards Recommendation Engine</h1>
              <p>Semantic matching · dependency graph · grounded citations · explicit abstention</p>
            </div>
          </div>
          <span className="spacer" />
          <div className="corpus-chips">
            {health === false && <span className="badge danger"><b aria-hidden="true">!</b>API unreachable</span>}
            {health && (
              <>
                <span className="badge muted">{fmt(health.standards)} standards</span>
                <span className="badge muted">{fmt(health.with_full_text)} full text</span>
                <span className="badge muted">{fmt(health.edges_confirmed)} verified links</span>
                <span className={`badge ${health.llm_configured ? 'ok' : 'warn'}`}>
                  <b aria-hidden="true">{health.llm_configured ? '✓' : '!'}</b>
                  {health.llm_configured ? 'LLM ready' : 'No LLM key'}
                </span>
              </>
            )}
          </div>
        </div>
        <nav className="tabs">
          {TABS.map(([k, label]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app">
        {tab === 'single' && <SingleQuery onOpen={openStandard} />}
        {tab === 'batch' && <BatchMode />}
        {tab === 'explore' && <Explore isNumber={focus} setIsNumber={setFocus} />}
        {tab === 'data' && <IngestionPanel />}
      </main>
    </>
  )
}
