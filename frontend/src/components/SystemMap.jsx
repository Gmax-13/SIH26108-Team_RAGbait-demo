/** Live architecture map.
 *
 *  Driven by the same SSE stage events as the checklist, so what lights up is
 *  what the server is actually doing — the compute step, and the data stores it
 *  touches. Nothing here is on a timer.
 */

// Which parts of the system each pipeline stage engages.
const ENGAGES = {
  // ids are the node keys below; a stage names both the compute box it runs in
  // and every store it reads, so the map shows the read, not just the step.
  retrieval:     ['embed', 'faiss', 'faissdb', 'corpus'],
  graph:         ['graph', 'corpus'],
  synthesis:     ['llm'],
  critic:        ['critic', 'corpus'],
  currency:      ['currency', 'corpus'],
  certification: ['cert', 'certdb'],
}

// Boxes: compute steps along the top, the things they read underneath.
const NODES = {
  query:    { x: 14,  y: 58,  w: 108, h: 50, label: 'Query',        sub: 'plain English',   kind: 'io' },
  embed:    { x: 148, y: 58,  w: 108, h: 50, label: 'Embedder',     sub: 'local, on GPU',   kind: 'proc' },
  faiss:    { x: 282, y: 58,  w: 108, h: 50, label: 'Retrieval',    sub: 'cosine search',   kind: 'proc' },
  graph:    { x: 416, y: 58,  w: 108, h: 50, label: 'Graph',        sub: '1–2 hops',        kind: 'proc' },
  llm:      { x: 550, y: 58,  w: 108, h: 50, label: 'Synthesis',    sub: 'LLM, cited',      kind: 'ext' },
  critic:   { x: 684, y: 58,  w: 122, h: 50, label: 'CRITIC',       sub: 'gates + signals', kind: 'critic' },
  currency: { x: 550, y: 214, w: 108, h: 44, label: 'Currency',     sub: 'edition check',   kind: 'proc' },
  cert:     { x: 416, y: 214, w: 108, h: 44, label: 'Certification', sub: 'BIS / CRS',      kind: 'proc' },

  // stores
  faissdb:  { x: 282, y: 214, w: 108, h: 44, label: 'FAISS',        sub: '87k passages',    kind: 'store' },
  corpus:   { x: 148, y: 214, w: 108, h: 44, label: 'SQLite',       sub: 'corpus + edges',  kind: 'store' },
  certdb:   { x: 14,  y: 214, w: 108, h: 44, label: 'Rule table',   sub: 'schemes',         kind: 'store' },

  // outcomes
  answer:   { x: 838, y: 28,  w: 118, h: 46, label: 'Recommend',    sub: 'with citations',  kind: 'good' },
  abstain:  { x: 838, y: 96,  w: 118, h: 46, label: 'ABSTAIN',      sub: 'and say why',     kind: 'abstain' },
}

const FLOW = [
  ['query', 'embed'], ['embed', 'faiss'], ['faiss', 'graph'],
  ['graph', 'llm'], ['llm', 'critic'],
]

// vertical reads: compute step -> the store it touches
const READS = [
  ['faiss', 'faissdb'], ['faiss', 'corpus'], ['graph', 'corpus'],
  ['critic', 'corpus'], ['currency', 'corpus'], ['cert', 'certdb'],
]

const cx = (n) => n.x + n.w / 2
const cy = (n) => n.y + n.h / 2

export default function SystemMap({ stages, result, done }) {
  // A part is "live" while its stage runs, and "used" once that stage finished.
  const live = new Set()
  const used = new Set()
  let liveStage = null

  for (const [key, s] of Object.entries(stages || {})) {
    const parts = ENGAGES[key] || []
    if (s?.status === 'running') {
      liveStage = key
      parts.forEach((p) => live.add(p))
    } else if (s?.status === 'done') {
      parts.forEach((p) => used.add(p))
    }
  }
  if (Object.keys(stages || {}).length) used.add('query')
  if (liveStage) live.add('query')

  const abstained = done && result?.status === 'abstained'
  const recommended = done && result?.status === 'recommended'
  if (recommended) used.add('answer')
  if (abstained) used.add('abstain')

  const stateOf = (id) =>
    live.has(id) ? 'live'
      : (id === 'answer' && recommended) || (id === 'abstain' && abstained) ? 'fired'
        : used.has(id) ? 'used' : 'idle'

  const edgeState = (a, b) =>
    live.has(a) || live.has(b) ? 'live'
      : used.has(a) && used.has(b) ? 'used' : 'idle'

  return (
    <div className="panel sysmap">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0 }}>{done ? 'What just happened' : 'System, live'}</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Each part lights up as the server actually reaches it — compute steps on
            top, the stores they read underneath.
          </p>
        </div>
        {liveStage && (
          <span className="badge info sysmap-now">
            <b aria-hidden="true">●</b>{stages[liveStage]?.detail || liveStage}
          </span>
        )}
      </div>

      <svg className="sysmap-svg" viewBox="0 0 970 276" role="img"
           aria-label="Live map of the recommendation pipeline">
        <defs>
          <marker id="ar" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
                  orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L7,3.5 L0,7 z" fill="currentColor" />
          </marker>
        </defs>

        {/* vertical reads first, so they sit behind the boxes */}
        {READS.map(([a, b]) => {
          const A = NODES[a], B = NODES[b]
          return (
            <line key={`r-${a}-${b}`} className={`sysmap-read ${edgeState(a, b)}`}
                  x1={cx(A)} y1={A.y + A.h} x2={cx(B)} y2={B.y} />
          )
        })}

        {/* main left-to-right flow */}
        {FLOW.map(([a, b]) => {
          const A = NODES[a], B = NODES[b]
          return (
            <line key={`f-${a}-${b}`} className={`sysmap-flow ${edgeState(a, b)}`}
                  x1={A.x + A.w} y1={cy(A)} x2={B.x - 6} y2={cy(B)} markerEnd="url(#ar)" />
          )
        })}

        {/* critic branches to the two outcomes */}
        <path className={`sysmap-flow ${recommended ? 'used' : 'idle'}`}
              d={`M ${NODES.critic.x + NODES.critic.w} ${cy(NODES.critic)}
                  C 820 ${cy(NODES.critic)}, 810 ${cy(NODES.answer)}, ${NODES.answer.x - 6} ${cy(NODES.answer)}`}
              fill="none" markerEnd="url(#ar)" />
        <path className={`sysmap-flow ${abstained ? 'abstain' : 'idle'}`}
              d={`M ${NODES.critic.x + NODES.critic.w} ${cy(NODES.critic)}
                  C 820 ${cy(NODES.critic)}, 810 ${cy(NODES.abstain)}, ${NODES.abstain.x - 6} ${cy(NODES.abstain)}`}
              fill="none" markerEnd="url(#ar)" />

        {Object.entries(NODES).map(([id, n]) => {
          const st = stateOf(id)
          return (
            <g key={id} className={`sysmap-node ${n.kind} ${st}`}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="9" />
              <text className="sysmap-label" x={cx(n)} y={n.y + (n.h > 46 ? 22 : 20)}>
                {n.label}
              </text>
              <text className="sysmap-sub" x={cx(n)} y={n.y + (n.h > 46 ? 38 : 34)}>
                {n.sub}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="legend sysmap-legend">
        <span><i className="dot" style={{ background: 'var(--accent)' }} /> working now</span>
        <span><i className="dot" style={{ background: 'var(--good)' }} /> done</span>
        <span><i className="dot" style={{ background: 'var(--abstain)' }} /> abstained</span>
        <span className="muted">stores are read, never written, while answering</span>
      </div>
    </div>
  )
}
