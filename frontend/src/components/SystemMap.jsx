/** Live architecture diagram.
 *
 *  Laid out spatially rather than in bands: the query path runs across the top
 *  and right, the stores sit beneath what reads them, and ingestion occupies its
 *  own corner because it is a separate, continuously running concern.
 *
 *  Components light up from the same SSE stage events as the checklist, so what
 *  is highlighted is what the server actually reached. The ingestion cluster
 *  pulses on its own timer — it is genuinely always running, independent of any
 *  query, which is the thing that diagram is there to communicate.
 */

const ENGAGES = {
  retrieval:     ['ui', 'api', 'embed', 'faiss', 'retrieve', 'corpus'],
  graph:         ['api', 'graphx', 'corpus'],
  synthesis:     ['api', 'synth', 'groq'],
  critic:        ['api', 'critic', 'corpus'],
  currency:      ['api', 'critic', 'corpus'],
  certification: ['api', 'critic', 'certdb'],
}

const W = 1060, H = 690

// icon glyphs, drawn at the node's top-left + (14, 14), 20x20
const ICON = {
  browser: 'M2 3h16v12H2z M2 6h16 M4 4.5h1 M6 4.5h1',
  server:  'M2 3h16v5H2z M2 11h16v5H2z M5 5.5h.01 M5 13.5h.01',
  db:      'M3 4c0-1.1 3.1-2 7-2s7 .9 7 2v11c0 1.1-3.1 2-7 2s-7-.9-7-2z M3 4c0 1.1 3.1 2 7 2s7-.9 7-2',
  chip:    'M5 5h10v10H5z M8 2v3 M12 2v3 M8 15v3 M12 15v3 M2 8h3 M2 12h3 M15 8h3 M15 12h3',
  cloud:   'M5 14a3.5 3.5 0 0 1 .5-7 4.5 4.5 0 0 1 8.6 1.2A3 3 0 0 1 14.5 14z',
  shield:  'M10 2l7 3v5c0 4.2-2.9 7.4-7 8.5C5.9 17.4 3 14.2 3 10V5z M7 10l2 2 4-4',
  globe:   'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16 M2 10h16 M10 2c2.5 2.6 2.5 13.4 0 16 M10 2C7.5 4.6 7.5 15.4 10 18',
  gear:    'M10 7.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6 M10 1.5v2.2 M10 16.3v2.2 M3.9 3.9l1.6 1.6 M14.5 14.5l1.6 1.6 M1.5 10h2.2 M16.3 10h2.2 M3.9 16.1l1.6-1.6 M14.5 5.5l1.6-1.6',
  doc:     'M5 2h7l3 3v13H5z M12 2v3h3 M7 9h6 M7 12h6 M7 15h4',
}

const NODES = {
  // --- request path ---
  ui:       { x: 40,  y: 26,  w: 196, h: 58, icon: 'browser', label: 'Dashboard',
              sub: 'React · Vite', step: 1, kind: 'proc' },
  api:      { x: 40,  y: 128, w: 196, h: 58, icon: 'server', label: 'FastAPI',
              sub: 'REST + streaming', step: 2, kind: 'proc' },

  // --- engine ---
  embed:    { x: 300, y: 26,  w: 178, h: 58, icon: 'chip', label: 'Embedder',
              sub: 'bge-small · GPU', step: 3, kind: 'proc' },
  faiss:    { x: 300, y: 128, w: 178, h: 58, icon: 'db', label: 'FAISS index',
              sub: '87k passages', step: 4, kind: 'store' },
  retrieve: { x: 540, y: 26,  w: 168, h: 58, icon: 'gear', label: 'Retrieval',
              sub: 'semantic match', kind: 'proc' },
  graphx:   { x: 540, y: 128, w: 168, h: 58, icon: 'gear', label: 'Graph walk',
              sub: '1–2 hops', step: 5, kind: 'proc' },
  synth:    { x: 772, y: 26,  w: 168, h: 58, icon: 'doc', label: 'Synthesis',
              sub: 'cited claims', step: 6, kind: 'proc' },
  groq:     { x: 772, y: 128, w: 168, h: 58, icon: 'cloud', label: 'Groq LLM',
              sub: 'external service', kind: 'ext' },

  critic:   { x: 540, y: 246, w: 200, h: 70, icon: 'shield', label: 'CRITIC',
              sub: 'gates · currency · certification', step: 7, kind: 'critic' },

  // --- stores ---
  corpus:   { x: 262, y: 250, w: 236, h: 62, icon: 'db', label: 'SQLite',
              sub: 'standards · passages · edges', kind: 'store' },
  certdb:   { x: 40,  y: 250, w: 178, h: 62, icon: 'db', label: 'Rule table',
              sub: 'BIS · CRS schemes', kind: 'store' },

  // --- outcomes ---
  answer:   { x: 800, y: 236, w: 190, h: 52, icon: null, label: 'Recommend',
              sub: 'with citations', kind: 'good' },
  abstain:  { x: 800, y: 302, w: 190, h: 52, icon: null, label: 'ABSTAIN',
              sub: 'and say why', kind: 'abstain' },

  // --- continuous ingestion (its own concern, always running) ---
  // sources on the left, workers to their right, so ingestion reads L-to-R
  bis:      { x: 66,  y: 470, w: 196, h: 52, icon: 'globe', label: 'BIS catalogue',
              sub: 'services.bis.gov.in', kind: 'src' },
  ia:       { x: 66,  y: 546, w: 196, h: 52, icon: 'globe', label: 'Internet Archive',
              sub: 'public-domain scans', kind: 'src' },

  scraper:  { x: 300, y: 470, w: 190, h: 52, icon: 'doc', label: 'Catalogue scraper',
              sub: 'digit seeds 0–9', kind: 'ing' },
  fetcher:  { x: 300, y: 546, w: 190, h: 52, icon: 'doc', label: 'Full-text fetcher',
              sub: 'exact identifier', kind: 'ing' },
  builder:  { x: 528, y: 470, w: 190, h: 52, icon: 'chip', label: 'Chunk + embed',
              sub: 'rebuilds the index', kind: 'ing' },
  grapher:  { x: 528, y: 546, w: 190, h: 52, icon: 'gear', label: 'Graph builder',
              sub: 'reads citations', kind: 'ing' },
}

// [from, to, kind, fromPort, toPort, bend]
// Ports are explicit — 'l' 'r' 't' 'b' with an offset along that edge — because
// auto-picking the nearest edge routed Synthesis->CRITIC straight through the
// Groq box and stacked four arrowheads on the same point of SQLite.
const LINKS = [
  ['ui', 'api', 'call', ['b', 0], ['t', 0], 0],
  ['api', 'embed', 'call', ['r', 0], ['l', 8], 0],
  ['embed', 'faiss', 'call', ['b', 0], ['t', 0], 0],
  ['faiss', 'retrieve', 'read', ['r', 0], ['l', 8], 0],
  ['retrieve', 'graphx', 'call', ['b', 0], ['t', 0], 0],
  ['retrieve', 'synth', 'call', ['r', 0], ['l', 0], 0],
  ['synth', 'groq', 'call', ['b', 0], ['t', 0], 0],
  // leave Synthesis on its LEFT and drop down the gap, so the Groq box is clear
  ['synth', 'critic', 'call', ['l', 14], ['t', 62], -40],
  // three separate landing points on SQLite so the heads do not overlap
  ['retrieve', 'corpus', 'read', ['b', -52], ['t', 74], -30],
  ['graphx', 'corpus', 'read', ['b', -40], ['t', 20], -20],
  ['critic', 'corpus', 'read', ['l', 0], ['r', 0], 0],
  // pass beneath SQLite rather than through it
  ['critic', 'certdb', 'read', ['b', -60], ['b', 40], 0, 92],
  ['critic', 'answer', 'call', ['r', -14], ['l', 0], 0],
  ['critic', 'abstain', 'call', ['r', 14], ['l', 0], 0],
  // ingestion — always dashed, never lit by a query
  ['bis', 'scraper', 'feed', ['r', 0], ['l', 0], 0],
  ['ia', 'fetcher', 'feed', ['r', 0], ['l', 0], 0],
  ['scraper', 'corpus', 'write', ['t', -40], ['b', -60], -30],
  ['fetcher', 'corpus', 'write', ['t', 40], ['b', -20], -60],
  ['builder', 'faiss', 'write', ['t', 0], ['b', 40], 90],
  ['grapher', 'corpus', 'write', ['t', 40], ['b', 60], 40],
]

const INGEST = new Set(['scraper', 'fetcher', 'builder', 'grapher', 'bis', 'ia'])

const cx = (n) => n.x + n.w / 2
const cy = (n) => n.y + n.h / 2

/** A named point on a box edge: side plus an offset along that side. */
function port(n, [side, off]) {
  switch (side) {
    case 'l': return { x: n.x,        y: cy(n) + off }
    case 'r': return { x: n.x + n.w,  y: cy(n) + off }
    case 't': return { x: cx(n) + off, y: n.y }
    default:  return { x: cx(n) + off, y: n.y + n.h }
  }
}

export default function SystemMap({ stages, result, done }) {
  const live = new Set(), used = new Set()
  let liveStage = null

  for (const [key, s] of Object.entries(stages || {})) {
    const parts = ENGAGES[key] || []
    if (s?.status === 'running') { liveStage = key; parts.forEach((p) => live.add(p)) }
    else if (s?.status === 'done') { parts.forEach((p) => used.add(p)) }
  }
  if (Object.keys(stages || {}).length) { used.add('ui'); used.add('api') }

  const abstained = done && result?.status === 'abstained'
  const recommended = done && result?.status === 'recommended'

  const stateOf = (id) => {
    if (INGEST.has(id)) return 'ingest'
    if (id === 'answer') return recommended ? 'fired' : 'idle'
    if (id === 'abstain') return abstained ? 'fired' : 'idle'
    return live.has(id) ? 'live' : used.has(id) ? 'used' : 'idle'
  }

  const linkState = (a, b, kind) => {
    if (kind === 'write' || kind === 'feed') return 'ingest'
    if (b === 'answer') return recommended ? 'used' : 'idle'
    if (b === 'abstain') return abstained ? 'abstain' : 'idle'
    return live.has(a) || live.has(b) ? 'live'
      : used.has(a) && used.has(b) ? 'used' : 'idle'
  }

  return (
    <div className="panel sysmap">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0 }}>{done ? 'What just happened' : 'System, live'}</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Components light up as the server reaches them. Ingestion runs on its own
            schedule, continuously — it is never in the query path.
          </p>
        </div>
        {liveStage && (
          <span className="badge info sysmap-now">
            <b aria-hidden="true">●</b>{stages[liveStage]?.detail || liveStage}
          </span>
        )}
      </div>

      <svg className="sysmap-svg" viewBox={`0 0 ${W} ${H}`} role="img"
           aria-label="Architecture diagram with live component activity">
        <defs>
          <marker id="mk" markerWidth="8" markerHeight="8" refX="7" refY="4"
                  orient="auto" markerUnits="strokeWidth">
            <path d="M0,0.5 L8,4 L0,7.5 z" fill="currentColor" />
          </marker>
        </defs>

        {/* ingestion boundary — its own concern, always on */}
        <g className="sysmap-zone">
          <rect x={40} y={424} width={700} height={200} rx="14" />
          <text className="sysmap-zone-title" x={62} y={450}>
            CONTINUOUS INGESTION
          </text>
          <text className="sysmap-zone-note" x={716} y={450}>
            keeps the corpus current · never in the query path
          </text>
          <g className="sysmap-live-dot" transform="translate(228, 444)">
            <circle r="4" />
            <text x="12" y="4">running</text>
          </g>
        </g>

        {LINKS.map(([a, b, kind, fp, tp, bend, drop]) => {
          const A = NODES[a], B = NODES[b]
          const p1 = port(A, fp), p2 = port(B, tp)
          const mx = (p1.x + p2.x) / 2 + (bend || 0)
          const my = (p1.y + p2.y) / 2 + (drop || 0)
          return (
            <path key={`${a}-${b}`} className={`sysmap-link ${kind} ${linkState(a, b, kind)}`}
                  d={`M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`}
                  fill="none" markerEnd="url(#mk)" />
          )
        })}

        {Object.entries(NODES).map(([id, n]) => (
          <g key={id} className={`sysmap-node ${n.kind} ${stateOf(id)}`}>
            <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="10" />
            {n.icon && (
              <path className="sysmap-icon" transform={`translate(${n.x + 14},${n.y + n.h / 2 - 10})`}
                    d={ICON[n.icon]} />
            )}
            <text className="sysmap-label" x={n.x + (n.icon ? 44 : 16)} y={n.y + n.h / 2 - 3}>
              {n.label}
            </text>
            <text className="sysmap-sub" x={n.x + (n.icon ? 44 : 16)} y={n.y + n.h / 2 + 13}>
              {n.sub}
            </text>
            {n.step && (
              <g className="sysmap-step">
                <circle cx={n.x + n.w - 16} cy={n.y + 16} r="10" />
                <text x={n.x + n.w - 16} y={n.y + 20}>{n.step}</text>
              </g>
            )}
          </g>
        ))}
      </svg>

      <div className="legend sysmap-legend">
        <span><i className="dot" style={{ background: 'var(--accent)' }} /> working now</span>
        <span><i className="dot" style={{ background: 'var(--good)' }} /> used this query</span>
        <span><i className="dot" style={{ background: 'var(--warn)' }} /> ingestion, always on</span>
        <span><i className="dash" /> reads and writes to storage</span>
      </div>
    </div>
  )
}
