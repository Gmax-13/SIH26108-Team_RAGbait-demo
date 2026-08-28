import { useRef, useState } from 'react'
import { postBatch, postBatchUpload, streamRecommend } from '../api'
import ResultView from './ResultView'
import StageProgress from './StageProgress'
import SystemMap from './SystemMap'

const MAX_CHARS = 500

const EXAMPLES = [
  'PVC insulated copper conductor cable for internal wiring, rated 1100 V',
  'Earthing and equipotential bonding for a 33 kV distribution substation',
  'Rigid non-metallic conduit for concealed electrical wiring',
  'LED luminaires for public street lighting',
]

function TextInput({ state, setState, settings, onOpen }) {
  const { q, busy, res, err, stages } = state
  const set = (patch) => setState((p) => ({ ...p, ...patch }))

  const run = async (text) => {
    const query = (text ?? q).trim()
    if (query.length < 3) return
    set({ q: query, busy: true, err: null, res: null, stages: {} })
    try {
      const result = await streamRecommend({ query, ...settings }, (ev) => {
        setState((p) => ({
          ...p,
          stages: { ...p.stages, [ev.stage]: { status: ev.status, detail: ev.detail, elapsed: ev.elapsed } },
        }))
      })
      set({ res: result, busy: false })
    } catch (e) {
      set({ err: String(e), busy: false })
    }
  }

  const anyStage = Object.keys(stages || {}).length > 0

  return (
    <>
      <label className="field-label" htmlFor="req">
        Enter product description or technical requirement
      </label>
      <div className="textarea-wrap">
        <textarea id="req" rows={4} value={q} maxLength={MAX_CHARS}
                  onChange={(e) => set({ q: e.target.value })}
                  placeholder="e.g. PVC insulated copper conductor cable, 1100 V" />
        <span className="counter">{q.length}/{MAX_CHARS}</span>
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <button className="primary lg" onClick={() => run()} disabled={busy || q.trim().length < 3}>
          {busy ? 'Analysing…' : 'Find Relevant Standards'}
          {!busy && <span aria-hidden="true"> →</span>}
        </button>
      </div>

      <div className="example-row">
        <span className="small muted">Try:</span>
        {EXAMPLES.map((e, i) => (
          <button key={i} className="pill" onClick={() => run(e)} disabled={busy}>
            {e.length > 46 ? e.slice(0, 44) + '…' : e}
          </button>
        ))}
      </div>

      {err && <div className="err">{err}</div>}
      {anyStage && <SystemMap stages={stages} result={res} done={!busy} />}
      {anyStage && <StageProgress stages={stages} done={!busy} />}
      <ResultView result={res} onOpen={onOpen} />
    </>
  )
}

function DocumentUpload({ state, setState, settings, onDone }) {
  const { text, file, busy, err, cap } = state
  const set = (patch) => setState((p) => ({ ...p, ...patch }))
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)

  const finish = (rep) => { set({ busy: false }); onDone(rep) }

  const runText = async () => {
    set({ busy: true, err: null })
    try { finish(await postBatch({ text, max_requirements: cap, use_llm: settings.use_llm })) }
    catch (e) { set({ err: String(e), busy: false }) }
  }

  const runFile = async (f) => {
    if (!f) return
    set({ busy: true, err: null, file: f.name })
    try { finish(await postBatchUpload(f, cap, settings.use_llm)) }
    catch (e) { set({ err: String(e), busy: false }) }
  }

  const loadSample = async () => {
    try {
      const r = await fetch('/sample_tender.txt')
      if (r.ok) set({ text: await r.text(), file: null })
      else set({ err: 'Sample tender not found in frontend/public/' })
    } catch (e) { set({ err: String(e) }) }
  }

  return (
    <>
      <label className="field-label">Upload a tender or technical specification</label>
      <div className={`dropzone ${drag ? 'over' : ''} ${busy ? 'busy' : ''}`}
           onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
           onDragLeave={() => setDrag(false)}
           onDrop={(e) => { e.preventDefault(); setDrag(false); runFile(e.dataTransfer.files?.[0]) }}
           onClick={() => !busy && inputRef.current?.click()}>
        <svg viewBox="0 0 24 24" className="dz-icon" aria-hidden="true">
          <path d="M12 16V4 M8 8l4-4 4 4 M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
        <div className="dz-main">{file ? file : 'Drop a PDF or TXT here, or click to browse'}</div>
        <div className="dz-sub">PDF text is extracted server-side. Nothing is stored.</div>
        <input ref={inputRef} type="file" accept=".pdf,.txt" hidden
               onChange={(e) => runFile(e.target.files?.[0])} />
      </div>

      <div className="or-line"><span>or paste the text</span></div>

      <textarea rows={6} value={text} onChange={(e) => set({ text: e.target.value })}
                placeholder="Paste the full tender or technical specification text here…" />

      <div className="row" style={{ marginTop: 14 }}>
        <button className="primary lg" onClick={runText} disabled={busy || text.trim().length < 20}>
          {busy ? 'Processing…' : 'Generate Compliance Report'}
          {!busy && <span aria-hidden="true"> →</span>}
        </button>
        <button className="ghost" onClick={loadSample} disabled={busy}>Load sample tender</button>
        <span className="spacer" />
        <label className="cap-field">
          Cap at
          <select value={cap} onChange={(e) => set({ cap: Number(e.target.value) })} disabled={busy}>
            <option value={3}>3 requirements</option>
            <option value={5}>5 requirements</option>
            <option value={10}>10 requirements</option>
            <option value={0}>no cap</option>
          </select>
        </label>
      </div>

      {busy && (
        <div className="working">
          <span className="spin" aria-hidden="true" />
          <div>
            <b>Running every requirement through the full pipeline.</b>
            <div className="small muted">
              Each requirement is retrieved, graph-expanded, synthesised and
              grounded on its own. With the language model on that is roughly a
              minute each, so {cap ? `${cap} requirements take a few minutes` :
              'an uncapped run can take a long while'}. Turning the model off in
              Settings drops it to a few seconds per requirement, using rule-based
              synthesis — the critic and the abstention path still run.
            </div>
          </div>
        </div>
      )}
      {err && <div className="err">{err}</div>}
    </>
  )
}

export default function QueryScreen({ single, setSingle, batch, setBatch, settings, onOpen, onReport }) {
  const [tab, setTab] = useState('text')

  return (
    <div className="card">
      <div className="seg">
        <button className={tab === 'text' ? 'on' : ''} onClick={() => setTab('text')}>Text Input</button>
        <button className={tab === 'doc' ? 'on' : ''} onClick={() => setTab('doc')}>Document Upload</button>
      </div>

      {tab === 'text'
        ? <TextInput state={single} setState={setSingle} settings={settings} onOpen={onOpen} />
        : <DocumentUpload state={batch} setState={setBatch} settings={settings} onDone={onReport} />}
    </div>
  )
}
