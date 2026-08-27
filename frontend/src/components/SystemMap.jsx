/** Live architecture diagram.
 *
 *  A layered view of the actual system — client, API, pipeline, knowledge base,
 *  and the offline ingestion that feeds it — rather than a sequence of steps.
 *  Components light up as the server reaches them, driven by the same SSE stage
 *  events as the checklist, so nothing here is on a timer.
 *
 *  The ingestion tier deliberately never lights during a query: it runs offline,
 *  and showing that it sits outside the request path is part of the point.
 */

// Which components each pipeline stage engages.
const ENGAGES = {
  retrieval:     ['ui', 'api', 'retrieve', 'embed', 'faissdb', 'corpus'],
  graph:         ['api', 'graphx', 'corpus'],
  synthesis:     ['api', 'synth', 'groq'],
  critic:        ['api', 'critic', 'corpus'],
  currency:      ['api', 'currency', 'corpus'],
  certification: ['api', 'cert', 'certdb'],
}

const W = 1000

// Tiers: a titled boundary with components inside it.
const TIERS = [
  { id: 'client',  y: 14,  h: 74,  title: 'CLIENT',
    note: 'browser', kind: 'client' },
  { id: 'api',     y: 100, h: 74,  title: 'API  ·  FastAPI',
    note: 'REST + server-sent events', kind: 'api' },
  { id: 'pipe',    y: 186, h: 166, title: 'RECOMMENDATION PIPELINE',
    note: 'six stages, in order', kind: 'pipe' },
  { id: 'kb',      y: 364, h: 96,  title: 'KNOWLEDGE BASE  ·  local, no network',
    note: 'read-only while answering', kind: 'kb' },
  { id: 'ingest',  y: 472, h: 96,  title: 'INGESTION  ·  offline, outside the query path',
    note: 'builds the knowledge base', kind: 'ingest' },
  { id: 'src',     y: 580, h: 74,  title: 'PUBLIC DATA SOURCES',
    note: 'nothing hand-curated', kind: 'src' },
]

const NODES = {
  // client
  ui:       { x: 34,  y: 40,  w: 214, h: 38, label: 'Dashboard (React)', kind: 'proc' },

  // api
  api:      { x: 34,  y: 126, w: 214, h: 38, label: 'Routes + streaming', kind: 'proc' },

  // pipeline
  retrieve: { x: 34,  y: 228, w: 138, h: 44, label: 'Retrieval',     sub: 'semantic', kind: 'proc' },
  graphx:   { x: 184, y: 228, w: 138, h: 44, label: 'Graph',         sub: '1–2 hops', kind: 'proc' },
  synth:    { x: 334, y: 228, w: 138, h: 44, label: 'Synthesis',     sub: 'cited',    kind: 'proc' },
  critic:   { x: 484, y: 228, w: 150, h: 44, label: 'CRITIC',        sub: 'gates + signals', kind: 'critic' },
  currency: { x: 646, y: 228, w: 138, h: 44, label: 'Currency',      sub: 'editions', kind: 'proc' },
  cert:     { x: 796, y: 228, w: 138, h: 44, label: 'Certification', sub: 'BIS / CRS', kind: 'proc' },
  // The one hosted dependency, drawn inside the tier that calls it but marked
  // external: it is the only part of answering that leaves this machine.
  groq:     { x: 334, y: 292, w: 138, h: 38, label: 'Groq LLM', sub: 'external', kind: 'ext' },

  // knowledge base
  embed:    { x: 34,  y: 400, w: 172, h: 44, label: 'Embedder',   sub: 'bge-small · GPU', kind: 'proc' },
  faissdb:  { x: 218, y: 400, w: 172, h: 44, label: 'FAISS index', sub: '87k passages',   kind: 'store' },
  corpus:   { x: 402, y: 400, w: 218, h: 44, label: 'SQLite',      sub: 'standards · passages · edges', kind: 'store' },
  certdb:   { x: 632, y: 400, w: 150, h: 44, label: 'Rule table',  sub: 'schemes',        kind: 'store' },
  audit:    { x: 794, y: 400, w: 140, h: 44, label: 'Audit log',   sub: 'every step',     kind: 'store' },

  // ingestion
  scraper:  { x: 34,  y: 508, w: 190, h: 44, label: 'Catalogue scraper', sub: 'digit seeds 0–9', kind: 'off' },
  fetcher:  { x: 236, y: 508, w: 190, h: 44, label: 'Full-text fetcher', sub: 'exact identifier', kind: 'off' },
  builder:  { x: 438, y: 508, w: 182, h: 44, label: 'Chunk + embed',     sub: 'index build',     kind: 'off' },
  grapher:  { x: 632, y: 508, w: 182, h: 44, label: 'Graph builder',     sub: 'cited references', kind: 'off' },

  // sources — data only; the hosted LLM is not a source of standards
  bis:      { x: 34,  y: 606, w: 214, h: 38, label: 'BIS catalogue API', kind: 'ext' },
  ia:       { x: 260, y: 606, w: 214, h: 38, label: 'Internet Archive',  kind: 'ext' },
}

// Tier-to-tier calls, drawn as vertical connectors.
const LINKS = [
  ['ui', 'api', 'call'],
  ['api', 'retrieve', 'call'],
  ['retrieve', 'embed', 'read'],
  ['retrieve', 'faissdb', 'read'],
  ['retrieve', 'corpus', 'read'],
  ['graphx', 'corpus', 'read'],
  ['critic', 'corpus', 'read'],
  ['currency', 'corpus', 'read'],
  ['cert', 'certdb', 'read'],
  ['synth', 'groq', 'call'],
  ['scraper', 'corpus', 'write'],
  ['fetcher', 'corpus', 'write'],
  ['builder', 'faissdb', 'write'],
  ['grapher', 'corpus', 'write'],
  ['bis', 'scraper', 'call'],
  ['ia', 'fetcher', 'call'],
]

const OFFLINE = new Set(['scraper', 'fetcher', 'builder', 'grapher', 'bis', 'ia'])
const cx = (n) => n.x + n.w / 2

export default function SystemMap({ stages, result, done }) {
  const live = new Set()
  const used = new Set()
  let liveStage = null

  for (const [key, s] of Object.entries(stages || {})) {
    const parts = ENGAGES[key] || []
    if (s?.status === 'running') { liveStage = key; parts.forEach((p) => live.add(p)) }
    else if (s?.status === 'done') { parts.forEach((p) => used.add(p)) }
  }
  if (Object.keys(stages || {}).length) { used.add('ui'); used.add('api') }

  const abstained = done && result?.status === 'abstained'

  const stateOf = (id) =>
    OFFLINE.has(id) ? 'offline'
      : live.has(id) ? 'live'
        : used.has(id) ? 'used' : 'idle'

  const linkState = (a, b, kind) =>
    kind === 'write' || OFFLINE.has(a) || OFFLINE.has(b) ? 'offline'
      : live.has(a) || live.has(b) ? 'live'
        : used.has(a) && used.has(b) ? 'used' : 'idle'

  return (
    <div className="panel sysmap">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0 }}>{done ? 'What just happened' : 'System, live'}</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            The running architecture. Components light up as the server reaches them —
            the ingestion tier stays grey because it runs offline, not per query.
          </p>
        </div>
        {liveStage && (
          <span className="badge info sysmap-now">
            <b aria-hidden="true">●</b>{stages[liveStage]?.detail || liveStage}
          </span>
        )}
      </div>

      <svg className="sysmap-svg" viewBox={`0 0 ${W} 668`} role="img"
           aria-label="Layered architecture diagram with live component activity">
        <defs>
          <marker id="amk" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
                  orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L7,3.5 L0,7 z" fill="currentColor" />
          </marker>
        </defs>

        {/* tier boundaries */}
        {TIERS.map((t) => (
          <g key={t.id} className={`sysmap-tier ${t.kind}`}>
            <rect x={10} y={t.y} width={W - 20} height={t.h} rx="12" />
            <text className="sysmap-tier-title" x={24} y={t.y + 19}>{t.title}</text>
            <text className="sysmap-tier-note" x={W - 24} y={t.y + 19}>{t.note}</text>
          </g>
        ))}

        {/* connectors */}
        {LINKS.map(([a, b, kind]) => {
          const A = NODES[a], B = NODES[b]
          const st = linkState(a, b, kind)
          const down = B.y > A.y
          const y1 = down ? A.y + A.h : A.y
          const y2 = down ? B.y - 5 : B.y + B.h + 5
          const mx = (cx(A) + cx(B)) / 2
          const my = (y1 + y2) / 2
          return (
            <path key={`${a}-${b}`} className={`sysmap-link ${kind} ${st}`}
                  d={`M ${cx(A)} ${y1} C ${cx(A)} ${my}, ${mx} ${my}, ${cx(B)} ${y2}`}
                  fill="none" markerEnd="url(#amk)" />
          )
        })}

        {/* components */}
        {Object.entries(NODES).map(([id, n]) => (
          <g key={id} className={`sysmap-node ${n.kind} ${stateOf(id)}`}>
            <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="8" />
            <text className="sysmap-label" x={cx(n)} y={n.y + (n.sub ? 20 : 24)}>{n.label}</text>
            {n.sub && <text className="sysmap-sub" x={cx(n)} y={n.y + 34}>{n.sub}</text>}
          </g>
        ))}

        {/* the outcome, stated where the critic decides it */}
        {done && (
          <g className={`sysmap-verdict ${abstained ? 'abstain' : 'good'}`}>
            <rect x={484} y={292} width={150} height={24} rx="12" />
            <text x={559} y={308}>{abstained ? 'ABSTAINED' : 'RECOMMENDED'}</text>
          </g>
        )}
      </svg>

      <div className="legend sysmap-legend">
        <span><i className="dot" style={{ background: 'var(--accent)' }} /> working now</span>
        <span><i className="dot" style={{ background: 'var(--good)' }} /> used this query</span>
        <span><i className="dot" style={{ background: 'var(--line-strong)' }} /> idle</span>
        <span><i className="dash" /> offline — not in the query path</span>
      </div>
    </div>
  )
}
