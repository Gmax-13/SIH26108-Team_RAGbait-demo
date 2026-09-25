import { useEffect, useState } from 'react'
import { getStats } from './api.demo.js'

// Corpus figures come from the recorded stats, so they always agree with the
// Dashboard. Evaluation figures are copied from data/logs/eval-scoped.json and
// the confidence formula from backend/pipeline/critic.py — update both here
// when those change.

const SECTIONS = [
  ['problem', 'Problem'],
  ['solution', 'Solution'],
  ['different', 'What is different'],
  ['how', 'How it works'],
  ['critic', 'Try the critic'],
  ['kpis', 'KPIs'],
  ['coverage', 'Coverage'],
  ['stack', 'Architecture'],
  ['limits', 'Limitations'],
  ['roadmap', 'Roadmap'],
]

const fmt = (n) => (n == null ? '—' : n.toLocaleString('en-IN'))

/* ------------------------------------------------------------------ icons */
const ICON = {
  books: 'M4 19.5V5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2zM6 21h13 M8 7h7',
  overlap: 'M3 12a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0-11 0 M10 12a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0-11 0',
  revise: 'M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  target: 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M12 12h.01',
  quote: 'M5 17c2-1 3-3 3-6H5V6h5v5c0 4-2 7-5 8z M14 17c2-1 3-3 3-6h-3V6h5v5c0 4-2 7-5 8z',
  clock: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M12 7v5l3 2',
  badge: 'M12 2l2.4 2.1 3.2-.3.8 3.1 2.8 1.6-1.3 2.9 1.3 2.9-2.8 1.6-.8 3.1-3.2-.3L12 22l-2.4-2.1-3.2.3-.8-3.1-2.8-1.6 1.3-2.9-1.3-2.9 2.8-1.6.8-3.1 3.2.3z M8.5 12l2.5 2.5 4.5-5',
  graph: 'M3.5 6a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0 M15.5 6a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0 M9.5 18a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0 M7 8l4 7.5 M17 8l-4 7.5 M8.5 6h7',
  clause: 'M6 2h9l4 4v16H6z M15 2v4h4 M9 11h7 M9 15h7 M9 7h3',
  checklist: 'M10 6h10 M10 12h10 M10 18h10 M3.5 6l1.5 1.5L7.5 5 M3.5 12l1.5 1.5L7.5 11 M3.5 18l1.5 1.5L7.5 17',
  stop: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M5.6 5.6l12.8 12.8',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5',
  search: 'M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M16 16l5 5',
  log: 'M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5',
  globe: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M3 12h18 M12 3c3 3.5 3 14.5 0 18 M12 3c-3 3.5-3 14.5 0 18',
  spark: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5L18 18 M6 18l2.5-2.5 M15.5 8.5L18 6',
  rank: 'M4 20V10 M10 20V4 M16 20v-7 M3 20h18',
  chat: 'M4 5h16v11H9l-5 4z',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h3v16H7z M14 4h3v16h-3z',
}

function Icon({ name, size = 22 }) {
  return (
    <svg className="dv-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICON[name]} />
    </svg>
  )
}

function Section({ id, eyebrow, title, children }) {
  return (
    <section id={`doc-${id}`} className="panel docs-section">
      {eyebrow && <div className="dv-eyebrow">{eyebrow}</div>}
      <h2>{title}</h2>
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------ hero */
function Hero({ go }) {
  return (
    <div className="docs-hero">
      <div className="docs-eyebrow">Smart India Hackathon 2026 · SIH26108</div>
      <h2>AI-Powered Recommendation Engine for Indian Standards</h2>
      <p>Requirement in. The right Indian Standard out, <b>with proof</b>, or an honest <b>"not sure"</b>.</p>
      <svg className="hero-flow" viewBox="0 0 760 150" role="img"
           aria-label="A requirement goes into ManakSetu, which either recommends a standard with proof or refuses and shows the closest candidates">
        <defs>
          <marker id="hf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0L10 5L0 10z" fill="#60a5fa" />
          </marker>
        </defs>
        <g className="hf-node">
          <rect x="6" y="45" width="190" height="60" rx="12" />
          <text x="101" y="70" className="hf-t">Requirement</text>
          <text x="101" y="89" className="hf-s">"PVC cable, 1100 V"</text>
        </g>
        <path d="M200 75H282" className="hf-line" markerEnd="url(#hf-arrow)" />
        <g className="hf-core">
          <rect x="288" y="35" width="184" height="80" rx="14" />
          <text x="380" y="68" className="hf-t">ManakSetu</text>
          <text x="380" y="90" className="hf-s">search · verify · check</text>
        </g>
        <path d="M476 60C520 60 520 28 560 28" className="hf-line" markerEnd="url(#hf-arrow)" />
        <path d="M476 90C520 90 520 122 560 122" className="hf-line" markerEnd="url(#hf-arrow)" />
        <g className="hf-yes">
          <rect x="566" y="4" width="188" height="48" rx="12" />
          <text x="660" y="25" className="hf-t">✓ IS 694:2010</text>
          <text x="660" y="42" className="hf-s">with the quoted clause</text>
        </g>
        <g className="hf-no">
          <rect x="566" y="98" width="188" height="48" rx="12" />
          <text x="660" y="119" className="hf-t">⊘ Not sure</text>
          <text x="660" y="136" className="hf-s">reasons + closest matches</text>
        </g>
      </svg>
      <svg className="hero-flow narrow" viewBox="0 0 340 250" role="img"
           aria-label="A requirement goes into ManakSetu, which either recommends a standard with proof or refuses and shows the closest candidates">
        <defs>
          <marker id="hf-arrow-n" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0L10 5L0 10z" fill="#60a5fa" />
          </marker>
        </defs>
        <g className="hf-node">
          <rect x="70" y="4" width="200" height="54" rx="12" />
          <text x="170" y="27" className="hf-t">Requirement</text>
          <text x="170" y="45" className="hf-s">"PVC cable, 1100 V"</text>
        </g>
        <path d="M170 60V84" className="hf-line" markerEnd="url(#hf-arrow-n)" />
        <g className="hf-core">
          <rect x="70" y="90" width="200" height="60" rx="14" />
          <text x="170" y="116" className="hf-t">ManakSetu</text>
          <text x="170" y="135" className="hf-s">search · verify · check</text>
        </g>
        <path d="M130 152C130 170 84 170 84 188" className="hf-line" markerEnd="url(#hf-arrow-n)" />
        <path d="M210 152C210 170 256 170 256 188" className="hf-line" markerEnd="url(#hf-arrow-n)" />
        <g className="hf-yes">
          <rect x="4" y="194" width="160" height="52" rx="12" />
          <text x="84" y="216" className="hf-t">✓ IS 694:2010</text>
          <text x="84" y="234" className="hf-s">with the quoted clause</text>
        </g>
        <g className="hf-no">
          <rect x="176" y="194" width="160" height="52" rx="12" />
          <text x="256" y="216" className="hf-t">⊘ Not sure</text>
          <text x="256" y="234" className="hf-s">reasons + candidates</text>
        </g>
      </svg>
      <div className="hero-cta">
        <button className="primary" onClick={() => go('query')}>Try a query</button>
        <span className="small">or read on: about 2 minutes, mostly pictures.</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ problem */
function Problem() {
  const facts = [
    ['books', '~24,000', 'Indian Standards to choose from'],
    ['overlap', 'Overlapping', 'scopes: several standards look right'],
    ['revise', '1987 → 2018', 'revised often; old editions linger in tenders'],
    ['link', '1 → many', 'each standard cites tests, terms and safety standards'],
  ]
  return (
    <Section id="problem" eyebrow="The problem" title="Picking the right standard is hard, and mistakes are costly">
      <div className="dv-facts">
        {facts.map(([icon, big, small]) => (
          <div key={big} className="dv-fact">
            <span className="dv-fact-icon"><Icon name={icon} /></span>
            <b>{big}</b>
            <span>{small}</span>
          </div>
        ))}
      </div>
      <div className="dv-risk">
        <div className="dv-risk-chat">
          <div className="dv-chat-head"><Icon name="chat" size={16} /> Typical chatbot</div>
          <p>"For durable products, use <b>IS 16423:2021</b>, General requirements."</p>
          <div className="dv-stamp">✕ Not in the BIS catalogue</div>
        </div>
        <div className="dv-risk-text">
          <b>The real risk is a confident wrong answer.</b>
          <span>A language model invents plausible IS numbers. In a tender, that error surfaces only
          in a dispute. So our core problem is <b>knowing when not to answer</b>.</span>
        </div>
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ solution */
const OUTPUTS = [
  { key: 'std', icon: 'target', label: 'Standard to cite', mock: () => (
    <div className="mk-answer"><span className="mk-eyebrow">Cite this standard</span>
      <b className="mono">IS 694:2010</b><span className="small">PVC insulated cables for working voltages up to 1100 V</span>
      <span className="mk-conf"><i style={{ width: '88%' }} /><em>confidence 0.88</em></span></div>) },
  { key: 'proof', icon: 'quote', label: 'Proof', mock: () => (
    <div className="mk-quote"><span className="mono small">IS 694:2010 · scope</span>
      "This standard covers PVC insulated … cables … for working voltages up to and including 1 100 V."
      <span className="small muted">Every claim links to a real passage like this.</span></div>) },
  { key: 'cur', icon: 'clock', label: 'Is it current?', mock: () => (
    <div className="mk-stack"><span className="badge danger"><b>↑</b>IS 3043:1987 superseded → IS 3043:2018</span>
      <span className="badge ok"><b>✓</b>IS 1554 (Part 1):1988 current · 5 amendments</span></div>) },
  { key: 'cert', icon: 'badge', label: 'Certification', mock: () => (
    <div className="mk-stack"><span className="badge warn"><b>!</b>BIS Product Certification · mandatory</span>
      <span className="small muted">Electric Cables Quality Control Order: bidders must hold an ISI-mark licence.</span></div>) },
  { key: 'allied', icon: 'graph', label: 'Related standards', mock: () => (
    <svg viewBox="0 0 260 110" className="mk-graph" role="img" aria-label="The primary standard linked to its test, terminology, safety and installation standards">
      <line x1="130" y1="55" x2="40" y2="22" /><line x1="130" y1="55" x2="220" y2="22" /><line x1="130" y1="55" x2="40" y2="90" /><line x1="130" y1="55" x2="220" y2="90" />
      <circle cx="130" cy="55" r="15" className="g0" /><circle cx="40" cy="22" r="9" className="g1" /><circle cx="220" cy="22" r="9" className="g2" /><circle cx="40" cy="90" r="9" className="g3" /><circle cx="220" cy="90" r="9" className="g4" />
      <text x="56" y="16">test</text><text x="170" y="16">terms</text><text x="56" y="106">safety</text><text x="160" y="106">install</text>
    </svg>) },
  { key: 'clause', icon: 'clause', label: 'Tender clause', mock: () => (
    <div className="mk-quote mk-clause">"The product shall conform to IS 694:2010. The following referenced standards shall be read with it: IS 10810 …"
      <span className="small muted">Paste-ready text for the tender.</span></div>) },
  { key: 'list', icon: 'checklist', label: 'Checklist', mock: () => (
    <div className="mk-list">
      <span><i className="on" />Replace IS 3043-1987 with IS 3043:2018</span>
      <span><i />Require a BIS licence for IS 1554 (Part 2)</span>
      <span><i />Test to IS 10810 (Part 64): methods of test for cables</span></div>) },
]

function Solution({ go }) {
  const [pick, setPick] = useState('std')
  const cur = OUTPUTS.find((o) => o.key === pick)
  return (
    <Section id="solution" eyebrow="Our solution" title="One requirement in, everything the officer needs out">
      <p className="dv-lead">Click each output to see what it looks like.</p>
      <div className="dv-explorer">
        <div className="dv-outputs" role="tablist" aria-label="Outputs">
          {OUTPUTS.map((o) => (
            <button key={o.key} role="tab" aria-selected={pick === o.key}
                    className={pick === o.key ? 'on' : ''} onClick={() => setPick(o.key)}>
              <Icon name={o.icon} size={18} />{o.label}
            </button>
          ))}
        </div>
        <div className="dv-preview" role="tabpanel">{cur.mock()}</div>
      </div>
      <div className="dv-modes">
        {[['search', 'One requirement', 'Type it or pick an example.', 'query'],
          ['clause', 'A whole tender', 'Paste it; get a report and checklist.', 'query'],
          ['graph', 'An IS number', 'Walk its dependency graph.', 'graph']].map(([icon, t, d, to]) => (
          <button key={t} className="dv-mode" onClick={() => go(to)}>
            <Icon name={icon} /><b>{t}</b><span>{d}</span>
          </button>
        ))}
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ different */
function Different() {
  const [who, setWho] = useState('us')
  const diffs = [
    ['stop', 'Refuses when unsure', 'and says why'],
    ['shield', 'Cannot invent a number', 'checked against the catalogue'],
    ['quote', 'Every claim quoted', 'from the real standard'],
    ['clock', 'Edition-aware', 'catches outdated citations'],
    ['graph', 'Proven links', 'each with its source sentence'],
    ['log', 'Auditable data', 'every ingestion step logged'],
  ]
  return (
    <Section id="different" eyebrow="What is different" title="Same vague requirement, two very different answers">
      <div className="dv-versus">
        <div className="seg">
          <button className={who === 'them' ? 'on' : ''} onClick={() => setWho('them')}>Typical AI</button>
          <button className={who === 'us' ? 'on' : ''} onClick={() => setWho('us')}>ManakSetu</button>
        </div>
        <div className="dv-query mono">"good quality durable product"</div>
        {who === 'them' ? (
          <div className="dv-reply bad">
            <b>Use IS 16423:2021.</b>
            <span>Confident, fluent, and wrong: no such standard is in the catalogue.</span>
            <span className="badge danger"><b>✕</b>fabricated</span>
          </div>
        ) : (
          <div className="dv-reply abstain">
            <b>⊘ Not confident enough to recommend a standard.</b>
            <span>The candidates are scattered across unrelated products, so the requirement is too vague.
              Add the product, material or rating and try again.</span>
            <span className="badge muted">shows the closest candidates for a person to judge</span>
          </div>
        )}
      </div>
      <div className="dv-diffs">
        {diffs.map(([icon, t, d]) => (
          <div key={t} className="dv-diff"><Icon name={icon} /><b>{t}</b><span>{d}</span></div>
        ))}
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ pipeline */
const STAGES = [
  ['search', 'Search', 'Finds passages by meaning, not keywords, across 87,000 passages.'],
  ['graph', 'Expand', 'Follows the dependency graph to related standards.'],
  ['spark', 'Draft', 'The LLM writes an answer using only the retrieved passages.'],
  ['shield', 'Critic', 'Two hard checks and four scores decide: answer, or refuse.'],
  ['clock', 'Currency', 'Is the edition current? Any amendments?'],
  ['badge', 'Certification', 'Is BIS certification mandatory for this product?'],
]

function Pipeline() {
  const [at, setAt] = useState(0)
  const [playing, setPlaying] = useState(() =>
    !(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches))
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setAt((i) => (i + 1) % STAGES.length), 2200)
    return () => clearInterval(t)
  }, [playing])
  const [, title, text] = STAGES[at]
  return (
    <Section id="how" eyebrow="How it works" title="Six stages, every time">
      <div className="dv-pipe">
        {STAGES.map(([icon, t], i) => (
          <button key={t} className={`dv-stage ${i === at ? 'on' : ''} ${i < at ? 'past' : ''} ${t === 'Critic' ? 'critic' : ''}`}
                  onClick={() => { setAt(i); setPlaying(false) }} aria-label={`Stage ${i + 1}: ${t}`}>
            <span className="dv-stage-dot"><Icon name={icon} size={18} /></span>
            <span className="dv-stage-name">{t}</span>
          </button>
        ))}
      </div>
      <div className={`dv-stage-card ${title === 'Critic' ? 'critic' : ''}`} aria-live="polite">
        <span className="mono small muted">{at + 1} / {STAGES.length}</span>
        <b>{title}</b>
        <span>{text}</span>
        <button className="dv-play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} size={14} />
        </button>
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ critic */
// backend/pipeline/critic.py: a weighted geometric mean, so any weak factor
// drags the whole score down.
const pw = (x, e) => (x <= 0 ? 0 : Math.min(1, x) ** e)
function confidence(v) {
  if (v.fabricated) return 0
  return pw(v.grounding, 0.36) * pw(v.retrieval, 0.28) * pw(0.25 + 0.75 * v.discrimination, 0.12)
    * pw(0.05 + 0.95 * v.relevance, 0.26) * (v.metaOnly ? 0.72 : 1) * (v.withdrawn ? 0.35 : 1)
}
const THRESHOLD = 0.55
const PRESETS = {
  'Strong match': { grounding: 1, retrieval: 0.9, discrimination: 0.8, relevance: 0.9 },
  'Vague requirement': { grounding: 0.8, retrieval: 0.6, discrimination: 0.1, relevance: 0.3 },
  'Answers a different question': { grounding: 1, retrieval: 0.85, discrimination: 0.7, relevance: 0.05 },
  'Invented IS number': { grounding: 0.9, retrieval: 0.9, discrimination: 0.8, relevance: 0.9, fabricated: true },
}
const SIGNALS = [
  ['grounding', 'Claims backed by quotes'],
  ['retrieval', 'How closely the corpus matches'],
  ['discrimination', 'Candidates agree with each other'],
  ['relevance', 'Answer fits the question'],
]

function Critic() {
  const base = { metaOnly: false, withdrawn: false, fabricated: false }
  const [v, setV] = useState({ ...base, ...PRESETS['Strong match'] })
  const [preset, setPreset] = useState('Strong match')
  const c = confidence(v)
  const ok = c >= THRESHOLD
  const set = (patch) => { setV((p) => ({ ...p, ...patch })); setPreset(null) }
  return (
    <Section id="critic" eyebrow="Interactive" title="Try the critic: when does it refuse?">
      <p className="dv-lead">This uses the same formula as the real system. Pick a scenario, or drag the sliders.</p>
      <div className="dv-presets">
        {Object.keys(PRESETS).map((k) => (
          <button key={k} className={`pill ${preset === k ? 'on' : ''}`}
                  onClick={() => { setV({ ...base, ...PRESETS[k] }); setPreset(k) }}>{k}</button>
        ))}
      </div>
      <div className="dv-critic">
        <div className="dv-sliders">
          {SIGNALS.map(([k, label]) => (
            <label key={k} className="dv-slider">
              <span>{label}<b className="mono">{v[k].toFixed(2)}</b></span>
              <input type="range" min="0" max="1" step="0.01" value={v[k]}
                     onChange={(e) => set({ [k]: Number(e.target.value) })} />
            </label>
          ))}
          <div className="dv-toggles">
            <label><input type="checkbox" checked={v.metaOnly} onChange={(e) => set({ metaOnly: e.target.checked })} /> Title-only match</label>
            <label><input type="checkbox" checked={v.withdrawn} onChange={(e) => set({ withdrawn: e.target.checked })} /> Standard withdrawn</label>
            <label><input type="checkbox" checked={v.fabricated} onChange={(e) => set({ fabricated: e.target.checked })} /> IS number not in catalogue</label>
          </div>
        </div>
        <div className={`dv-verdict ${ok ? 'ok' : 'no'}`}>
          <div className="dv-conf mono">{c.toFixed(2)}</div>
          <div className="dv-gauge" role="meter" aria-valuemin={0} aria-valuemax={1}
               aria-valuenow={Number(c.toFixed(2))} aria-label="Confidence">
            <i style={{ width: `${c * 100}%` }} />
            <span className="dv-thresh" style={{ left: `${THRESHOLD * 100}%` }} />
          </div>
          <div className="dv-gauge-scale">
            <span>0</span><span className="t" style={{ left: `${THRESHOLD * 100}%` }}>threshold 0.55</span><span>1</span>
          </div>
          <b>{ok ? '✓ Recommends the standard' : '⊘ Refuses, and explains why'}</b>
          <span className="small">
            {v.fabricated ? 'A hard check failed: an unknown IS number forces confidence to zero.'
              : ok ? 'Every signal is strong enough.'
              : 'At least one weak signal pulls the score below 0.55.'}
          </span>
        </div>
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ kpis */
function Bars({ rows }) {
  const [hover, setHover] = useState(null)
  return (
    <div className="dv-bars" onMouseLeave={() => setHover(null)}>
      {rows.map(([label, value, note], i) => (
        <div key={label} className={`dv-bar-row ${hover === i ? 'hover' : ''}`} tabIndex={0}
             onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
          <span className="dv-bar-label">{label}</span>
          <span className="dv-bar-track"><i style={{ width: `${value}%` }} /></span>
          <span className="dv-bar-val mono">{value}%</span>
          {hover === i && <span className="dv-tip" role="tooltip">{note}</span>}
        </div>
      ))}
    </div>
  )
}

function Kpis({ stats }) {
  const total = stats?.standards || 0
  const ft = stats?.with_full_text || 0
  const pct = total ? Math.round((ft / total) * 100) : 0
  return (
    <Section id="kpis" eyebrow="KPIs" title="Measured on a golden set, not estimated">
      <div className="dv-kpi-grid">
        <div className="dv-card">
          <h3>Corpus</h3>
          <div className="dv-hero-num">{fmt(stats?.standards)}<span>standards in scope</span></div>
          <div className="dv-split" role="img" aria-label={`${pct}% verifiable against full text`}>
            <i className="a" style={{ width: `${pct}%` }} title={`${fmt(ft)} with full text`} />
            <i className="b" style={{ width: `${100 - pct}%` }} title={`${fmt(stats?.metadata_only)} title only`} />
          </div>
          <div className="dv-split-legend small">
            <span><i className="a" />{fmt(ft)} full text ({pct}%)</span>
            <span><i className="b" />{fmt(stats?.metadata_only)} title only, flagged</span>
          </div>
          <div className="dv-mini">
            <span><b>{fmt(stats?.chunks)}</b>quotable passages</span>
            <span><b>{fmt(stats?.edges_confirmed)}</b>proven dependencies</span>
          </div>
        </div>
        <div className="dv-card">
          <h3>Is the right standard found?</h3>
          <Bars rows={[
            ['In top 1', 71, 'Ranked first for 10 of 14 procurement-language queries'],
            ['In top 3', 86, 'In the top three for 12 of 14'],
            ['In top 5', 100, 'In the top five for all 14, which is why candidates are always shown'],
          ]} />
          <p className="small muted" style={{ margin: '10px 0 0' }}>Hover a bar for detail.</p>
        </div>
        <div className="dv-card">
          <h3>Safety</h3>
          <div className="dv-safety">
            <div><b>3 of 4</b><span>vague requirements correctly refused</span></div>
            <div className="warn"><b>4 of 14</b><span>confident but wrong (one is a golden-set gap)</span></div>
          </div>
          <p className="small muted" style={{ margin: '10px 0 0' }}>We report our misses, too.</p>
        </div>
      </div>
      <h3 className="dv-sub">What a pilot would measure</h3>
      <div className="dv-pilot">
        {[['clock', 'Outdated citations caught per tender'], ['target', 'Officer acceptance rate'],
          ['stop', 'Confident-but-wrong rate (target: zero)'], ['revise', 'Time to draft the standards section'],
          ['search', 'Refusals resolved after rephrasing'], ['shield', 'Disputes over cited standards']].map(([i, t]) => (
          <span key={t}><Icon name={i} size={16} />{t}</span>
        ))}
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ coverage */
function Coverage() {
  const rows = [
    ['clause', 'Descriptions, specs & tenders', 'ok'],
    ['search', 'Semantic matching', 'ok'],
    ['graph', 'Allied standards (6 kinds)', 'ok'],
    ['clock', 'Latest edition & amendments', 'ok'],
    ['checklist', 'Compliance & testing checklist', 'ok'],
    ['badge', 'Certification flags', 'part'],
    ['globe', 'Multilingual input', 'design'],
  ]
  const label = { ok: 'Built', part: 'Partial', design: 'Designed' }
  return (
    <Section id="coverage" eyebrow="Coverage" title="What the problem statement asked for">
      <div className="dv-coverage">
        {rows.map(([icon, t, s]) => (
          <div key={t} className={`dv-cov ${s}`}>
            <Icon name={icon} /><span>{t}</span>
            <span className={`badge ${s === 'ok' ? 'ok' : 'warn'}`}><b>{s === 'ok' ? '✓' : '~'}</b>{label[s]}</span>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ margin: '12px 0 0' }}>
        Certification: Hallmarking covers gold and silver, which are outside this electrical corpus.
        Multilingual: translate, match in English, answer in the original language.
      </p>
    </Section>
  )
}

/* ------------------------------------------------------------------ architecture */
function Architecture() {
  const cols = [
    ['Sources', [['BIS catalogue', 'Every standard, via its search API'], ['Internet Archive', 'OCR text of the standards']]],
    ['Knowledge base', [['SQLite', 'Standards, passages, graph, audit log'], ['FAISS + bge-small', 'Meaning-based search, runs locally']]],
    ['Pipeline', [['Groq LLM', 'Drafts answers; never the source of an IS number'], ['Critic', 'Checks everything before it is shown']]],
    ['Delivery', [['FastAPI', 'Streams each stage live'], ['React dashboard', 'What you are using now']]],
  ]
  return (
    <Section id="stack" eyebrow="Architecture" title="From public data to a verified answer">
      <div className="dv-arch">
        {cols.map(([head, items], ci) => (
          <div key={head} className="dv-arch-col">
            <div className="dv-arch-head"><span className="mono">{ci + 1}</span>{head}</div>
            {items.map(([name, why]) => (
              <div key={name} className="dv-arch-node"><b>{name}</b><span>{why}</span></div>
            ))}
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ limits */
function Limits() {
  const meters = [
    ['Full text available', 58, 'The rest are matched on title and flagged.'],
    ['Text from the exact edition', 84, 'The rest is an older edition; confidence is lowered.'],
    ['Right standard ranked first', 71, 'So the top candidates are always shown.'],
  ]
  return (
    <Section id="limits" eyebrow="Limitations" title="Stated plainly">
      <div className="dv-limits">
        {meters.map(([t, v, d]) => (
          <div key={t} className="dv-limit">
            <div className="dv-ring" style={{ '--v': v }} role="img" aria-label={`${v}%`}><span>{v}%</span></div>
            <b>{t}</b><span className="small muted">{d}</span>
          </div>
        ))}
      </div>
      <ul className="dv-ticks">
        <li><b>Electrical & electronics only</b> (ETD + LITD). Scaling up is a re-run of the scraper.</li>
        <li><b>Certification rules</b> are a curated table: a flag to verify, not a legal ruling.</li>
        <li><b>Everyday phrasing</b> ("bulb that saves electricity") gets a refusal, not a guess.</li>
      </ul>
    </Section>
  )
}

/* ------------------------------------------------------------------ roadmap */
function Roadmap() {
  const steps = [
    ['books', 'All 24,000 standards', 'Same pipeline, full catalogue'],
    ['globe', 'Indian languages', 'Translate, match, answer back'],
    ['badge', 'Live certification rules', 'Synced with gazette notifications'],
    ['rank', 'Sharper ranking', 'Raise the top-1 rate'],
    ['target', 'Pilot', 'With a procurement agency'],
  ]
  return (
    <Section id="roadmap" eyebrow="Roadmap" title="What comes next">
      <ol className="dv-road">
        {steps.map(([icon, t, d], i) => (
          <li key={t}>
            <span className="dv-road-dot"><Icon name={icon} size={18} /></span>
            <span className="mono small muted">{String(i + 1).padStart(2, '0')}</span>
            <b>{t}</b><span className="small muted">{d}</span>
          </li>
        ))}
      </ol>
    </Section>
  )
}

/* ------------------------------------------------------------------ page */
export default function DocsScreen({ go }) {
  const [active, setActive] = useState(SECTIONS[0][0])
  const [stats, setStats] = useState(null)

  useEffect(() => { getStats().then(setStats).catch(() => {}) }, [])

  // Highlight whichever section is nearest the top of the viewport.
  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(`doc-${id}`)).filter(Boolean)
    const io = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (seen[0]) setActive(seen[0].target.id.slice(4))
    }, { rootMargin: '-90px 0px -65% 0px' })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const jump = (id) => {
    setActive(id)
    document.getElementById(`doc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="docs">
      <nav className="docs-toc" aria-label="Documentation contents">
        <div className="docs-toc-label">Contents</div>
        {SECTIONS.map(([id, label]) => (
          <button key={id} className={active === id ? 'on' : ''} onClick={() => jump(id)}>{label}</button>
        ))}
      </nav>
      <article className="docs-body">
        <Hero go={go} />
        <Problem />
        <Solution go={go} />
        <Different />
        <Pipeline />
        <Critic />
        <Kpis stats={stats} />
        <Coverage />
        <Architecture />
        <Limits />
        <Roadmap />
      </article>
    </div>
  )
}
