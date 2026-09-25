/** The dashboard's query screen (frontend/src/components/QueryScreen.jsx),
 *  forked for the offline demo. Same markup and classes; the differences are:
 *
 *  - examples can be shown in English, Hindi, Marathi or Tamil, and a
 *    non-English example shows the English query it is matched on;
 *  - only recorded examples run — free text gets a note instead of a result;
 *  - tenders are pasted, not uploaded: the upload dropzone is removed.
 *
 *  Keep the rest in step with the original when that file changes.
 */
import { useState } from 'react'
import { OFFLINE_QUERY, postBatch, streamRecommend } from './api.demo'
import ResultView from '@dashboard/components/ResultView'
import StageProgress from '@dashboard/components/StageProgress'
import SystemMap from '@dashboard/components/SystemMap'

const MAX_CHARS = 500

const LANGS = [
  ['en', 'English', 'English'],
  ['hi', 'हिन्दी', 'Hindi'],
  ['mr', 'मराठी', 'Marathi'],
  ['ta', 'தமிழ்', 'Tamil'],
]
const LANG_NAME = Object.fromEntries(LANGS.map(([k, , name]) => [k, name]))

// `en` must equal the query recorded in scripts/capture_demo_fixtures.py.
const EXAMPLES = [
  {
    en: 'PVC insulated copper conductor cable for internal wiring, rated 1100 V',
    hi: 'आंतरिक वायरिंग के लिए पीवीसी इन्सुलेटेड तांबे के कंडक्टर वाली केबल, 1100 V रेटेड',
    mr: 'अंतर्गत वायरिंगसाठी पीव्हीसी इन्सुलेटेड तांब्याच्या कंडक्टरची केबल, 1100 V रेटेड',
    ta: 'உட்புற வயரிங்கிற்கான PVC காப்பிடப்பட்ட தாமிரக் கடத்தி கேபிள், 1100 V மதிப்பீடு',
  },
  {
    en: 'Earthing and equipotential bonding for a 33 kV distribution substation',
    hi: '33 kV वितरण सबस्टेशन के लिए अर्थिंग और इक्विपोटेंशियल बॉन्डिंग',
    mr: '33 kV वितरण उपकेंद्रासाठी अर्थिंग आणि समविभव बाँडिंग',
    ta: '33 kV விநியோக துணை மின்நிலையத்திற்கான புவிஇணைப்பு மற்றும் சமமின்னழுத்தப் பிணைப்பு',
  },
  {
    en: 'Rigid non-metallic conduit for concealed electrical wiring',
    hi: 'छिपी हुई विद्युत वायरिंग के लिए कठोर अधात्विक कंड्यूट',
    mr: 'लपवलेल्या विद्युत वायरिंगसाठी कठीण अधातू कंड्युट',
    ta: 'மறைக்கப்பட்ட மின் வயரிங்கிற்கான உறுதியான உலோகமற்ற குழாய்',
  },
  {
    en: 'LED luminaires for public street lighting',
    hi: 'सार्वजनिक स्ट्रीट लाइटिंग के लिए एलईडी ल्यूमिनेयर',
    mr: 'सार्वजनिक पथदिव्यांसाठी एलईडी ल्युमिनेअर',
    ta: 'பொது தெரு விளக்குகளுக்கான LED ஒளிர்விளக்குகள்',
  },
  {
    en: 'good quality durable product',
    hi: 'अच्छी गुणवत्ता वाला टिकाऊ उत्पाद',
    mr: 'चांगल्या गुणवत्तेचे टिकाऊ उत्पादन',
    ta: 'நல்ல தரமான நீடித்த பொருள்',
    abstains: true,
  },
]

const same = (a, b) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase()

/** The example (and the language it is written in) that `text` matches, if any. */
function matchExample(text) {
  for (const ex of EXAMPLES) {
    for (const [code] of LANGS) {
      if (same(text, ex[code])) return { ex, lang: code }
    }
  }
  return null
}

function TextInput({ state, setState, settings, onOpen }) {
  const { q, busy, res, err, stages, lang = 'en', translation, note } = state
  const set = (patch) => setState((p) => ({ ...p, ...patch }))

  const run = async (text) => {
    const typed = (text ?? q).trim()
    if (typed.length < 3) return
    const hit = matchExample(typed)
    if (!hit) {
      set({ q: typed, res: null, err: null, stages: {}, translation: null, note: OFFLINE_QUERY })
      return
    }
    set({
      q: typed, busy: true, err: null, res: null, stages: {}, note: null,
      lang: hit.lang,
      translation: hit.lang === 'en' ? null : { lang: hit.lang, english: hit.ex.en },
    })
    try {
      const result = await streamRecommend({ query: hit.ex.en, ...settings }, (ev) => {
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
      <div className="query-head">
        <label className="field-label" htmlFor="req">
          Enter product description or technical requirement
        </label>
        <div className="seg lang" role="group" aria-label="Example language">
          {LANGS.map(([code, label, name]) => (
            <button key={code} lang={code} className={lang === code ? 'on' : ''}
                    title={name} onClick={() => set({ lang: code })} disabled={busy}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="textarea-wrap">
        <textarea id="req" rows={4} value={q} maxLength={MAX_CHARS} lang={lang}
                  onChange={(e) => set({ q: e.target.value, note: null })}
                  placeholder={`e.g. ${EXAMPLES[0][lang]}`} />
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
        {EXAMPLES.map((ex, i) => {
          const text = ex[lang]
          const label = text.length > 46 ? text.slice(0, 44) + '…' : text
          return (
            <button key={i} className="pill" lang={lang} title={text} onClick={() => run(text)} disabled={busy}>
              {ex.abstains && <span aria-hidden="true">⊘ </span>}
              {label}
            </button>
          )
        })}
      </div>

      {note && <p className="small muted demo-note">{note}</p>}
      {translation && (
        <div className="panel translate-note">
          <span className="badge info">Detected: {LANG_NAME[translation.lang]}</span>
          <span className="small">Translated for retrieval: <span className="en">“{translation.english}”</span></span>
          <span className="small muted why">
            Indian Standards are published in English, so the query is matched in English.
          </span>
        </div>
      )}
      {err && <div className="err">{err}</div>}
      {anyStage && <SystemMap stages={stages} result={res} done={!busy} />}
      {anyStage && <StageProgress stages={stages} done={!busy} />}
      <ResultView result={res} onOpen={onOpen} />
    </>
  )
}

function DocumentUpload({ state, setState, settings, onDone }) {
  const { text, busy, err, cap } = state
  const set = (patch) => setState((p) => ({ ...p, ...patch }))

  const finish = (rep) => { set({ busy: false }); onDone(rep) }

  const runText = async () => {
    set({ busy: true, err: null })
    try { finish(await postBatch({ text, max_requirements: cap, use_llm: settings.use_llm })) }
    catch (e) { set({ err: String(e), busy: false }) }
  }

  const loadSample = async () => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}sample_tender.txt`)
      if (r.ok) set({ text: await r.text(), file: null })
      else set({ err: 'The sample tender could not be loaded.' })
    } catch (e) { set({ err: String(e) }) }
  }

  return (
    <>
      <label className="field-label" htmlFor="tender">Paste a tender or technical specification</label>
      <textarea id="tender" rows={8} value={text} onChange={(e) => set({ text: e.target.value })}
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
        <button className={tab === 'doc' ? 'on' : ''} onClick={() => setTab('doc')}>Tender Document</button>
      </div>

      {tab === 'text'
        ? <TextInput state={single} setState={setSingle} settings={settings} onOpen={onOpen} />
        : <DocumentUpload state={batch} setState={setBatch} settings={settings} onDone={onReport} />}
    </div>
  )
}
