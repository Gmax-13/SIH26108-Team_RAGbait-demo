import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { getFullGraph, searchStandards } from '../api'
import StandardDetail from './StandardDetail'

const EDGE_COLOR = {
  normative_reference: '#2a78d6',
  test_method: '#1baf7a',
  terminology: '#eb6834',
  safety: '#4a3aa7',
  installation: '#0e7490',
  related: '#7b8798',
}
const EDGE_LABEL = {
  normative_reference: 'normative reference',
  test_method: 'test method',
  terminology: 'terminology',
  safety: 'safety',
  installation: 'installation',
  related: 'related',
}

const DIM_NODE = 'rgba(148,163,184,0.30)'
const DIM_LINK = 'rgba(148,163,184,0.13)'
const SEL = '#1d4ed8'
const NEIGHBOUR = '#0ea5e9'
const BASE = '#94a3b8'
const SURFACE = '#ffffff'

/** Search box with a type-ahead list.
 *
 *  Debounced, and every request carries a sequence number: without it a slow
 *  response for "IS 6" can land after the fast one for "IS 64" and overwrite
 *  the newer list with stale rows.
 */
function SearchBox({ onPick, scope, setScope }) {
  const [text, setText] = useState('')
  const [list, setList] = useState([])
  const [meta, setMeta] = useState(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const seq = useRef(0)
  const boxRef = useRef(null)
  const picked = useRef(false)

  useEffect(() => {
    // Choosing a row writes the number back into the input, which would
    // otherwise re-run the search and pop the list open over the graph.
    if (picked.current) { picked.current = false; return }
    if (text.trim().length < 2) { setList([]); setMeta(null); return }
    const mine = ++seq.current
    const t = setTimeout(() => {
      searchStandards(text, { limit: 12, scope })
        .then((d) => {
          if (mine !== seq.current) return
          setList(d.results || [])
          setMeta(d)
          setOpen(true)
          setActive(0)
        })
        .catch(() => {})
    }, 160)
    return () => clearTimeout(t)
  }, [text, scope])

  useEffect(() => {
    const away = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  const choose = (r) => {
    picked.current = true
    setText(r.is_number)
    setOpen(false)
    onPick(r.is_number)
  }

  const onKey = (e) => {
    if (!open || !list.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % list.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + list.length) % list.length) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(list[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="searchbox" ref={boxRef}>
      <svg className="search-icon" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M9 3a6 6 0 1 0 0 12A6 6 0 0 0 9 3z M13.5 13.5 17 17" />
      </svg>
      <input
        type="text" value={text} placeholder="Search a standard — try “IS 64” or “earthing”"
        onChange={(e) => setText(e.target.value)}
        onFocus={() => list.length && setOpen(true)}
        onKeyDown={onKey}
        aria-label="Search standards" autoComplete="off" />
      {text && (
        <button className="search-clear" onClick={() => { setText(''); setList([]); onPick(null) }}
                aria-label="Clear search">×</button>
      )}

      {open && (
        <div className="typeahead">
          {list.length === 0 && <div className="ta-empty">No standard matches “{text}”.</div>}
          {list.map((r, i) => (
            <button key={r.is_number}
                    className={`ta-row ${i === active ? 'on' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(r)}>
              <span className="ta-num mono">{r.is_number}</span>
              <span className="ta-title">{r.title}</span>
              <span className="ta-meta">
                {r.department}
                {!r.is_active && <i className="ta-flag bad">withdrawn</i>}
                {r.metadata_only ? <i className="ta-flag warn">metadata only</i> : null}
              </span>
            </button>
          ))}
          {meta?.out_of_scope > 0 && scope === 'demo' && (
            <button className="ta-widen" onClick={() => setScope('all')}>
              {meta.out_of_scope} more match outside the {`demo`} scope — search the whole catalogue
            </button>
          )}
          {scope === 'all' && (
            <button className="ta-widen" onClick={() => setScope('demo')}>
              Searching all 17 departments. Standards outside the demo scope have no
              dependency graph — click to go back to in-scope results.
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function GraphExplorer({ focus, setFocus }) {
  const wrapRef = useRef(null)
  const fgRef = useRef(null)
  const [width, setWidth] = useState(900)
  const [graph, setGraph] = useState(null)
  const [err, setErr] = useState(null)
  const [hovered, setHovered] = useState(null)
  const [scope, setScope] = useState('demo')
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    getFullGraph(5000).then(setGraph).catch((e) => setErr(String(e)))
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [graph])

  const data = useMemo(() => {
    if (!graph) return { nodes: [], links: [] }
    const nodes = graph.nodes.map((n) => ({
      id: n.is_number, title: n.title, department: n.department,
      aspect: n.aspect, degree: n.degree || 1,
      active: n.is_active !== 0, metadataOnly: !!n.metadata_only,
    }))
    const ids = new Set(nodes.map((n) => n.id))
    const links = graph.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, type: e.edge_type, confidence: e.confidence }))
    return { nodes, links }
  }, [graph])

  /** The selected standard plus everything one edge away. Computed off the raw
   *  edge list rather than the rendered links, because force-graph mutates
   *  link.source/target from ids into node objects once the layout starts. */
  const neighbourhood = useMemo(() => {
    if (!focus || !graph) return null
    const near = new Set([focus])
    const edges = new Set()
    graph.edges.forEach((e, i) => {
      if (e.source === focus || e.target === focus) {
        near.add(e.source); near.add(e.target); edges.add(i)
      }
    })
    return { near, edges }
  }, [focus, graph])

  const linkKey = (l) => `${typeof l.source === 'object' ? l.source.id : l.source}->${typeof l.target === 'object' ? l.target.id : l.target}`
  const focusLinks = useMemo(() => {
    if (!neighbourhood || !graph) return null
    const s = new Set()
    graph.edges.forEach((e, i) => { if (neighbourhood.edges.has(i)) s.add(`${e.source}->${e.target}`) })
    return s
  }, [neighbourhood, graph])

  // A 4,000-node graph knots into an unreadable ball on default forces. Spread
  // it hard and cap the link distance so clusters stay distinguishable.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg || !data.nodes.length) return
    try {
      fg.d3Force('charge')?.strength(-70).distanceMax(400)
      fg.d3Force('link')?.distance(38).strength(0.28)
    } catch { /* forces not ready */ }
  }, [data])

  const fit = useCallback(() => {
    try { fgRef.current?.zoomToFit(600, 40) } catch { /* not mounted */ }
  }, [])

  // Frame the selected standard WITH its neighbours. A fixed zoom level cannot
  // work here: a standard with three relationships and one with sixty need very
  // different magnifications to be readable, and a fixed 3.2x threw most of a
  // hub's neighbours off-canvas.
  useEffect(() => {
    if (!focus || !settled || !neighbourhood) return
    const sel = data.nodes.find((x) => x.id === focus)
    if (!sel || sel.x === undefined) return
    const near = data.nodes.filter((x) => neighbourhood.near.has(x.id) && x.x !== undefined)
    // Bounding box of the neighbourhood, then the zoom that would fit it.
    const xs = near.map((x) => x.x), ys = near.map((x) => x.y)
    const w = Math.max(40, Math.max(...xs) - Math.min(...xs))
    const h = Math.max(40, Math.max(...ys) - Math.min(...ys))
    const fitZoom = Math.min((width - 120) / w, (560 - 120) / h)
    // Clamped, and centred on the SELECTED node rather than the box centre.
    // A hub's neighbours are scattered right across the layout, so fitting them
    // honestly is the same as zooming all the way out — which is not what
    // "zoom to the standard" means to anyone looking at it.
    const zoom = Math.max(1.4, Math.min(4, fitZoom))
    try {
      fgRef.current?.centerAt(sel.x, sel.y, 700)
      fgRef.current?.zoom(zoom, 700)
    } catch { /* not mounted */ }
  }, [focus, settled, data, neighbourhood, width])

  const onEngineStop = useCallback(() => {
    if (settled) return
    setSettled(true)
    if (!focus) fit()
  }, [settled, fit, focus])

  if (err) return <div className="err">{err}</div>

  const dimmed = !!focus
  const total = graph?.nodes?.length || 0

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div>
            <h2>Standards knowledge graph</h2>
            <p className="sub">
              Every dependency read out of the standards' own text. Search a standard
              to isolate it and its direct relationships.
            </p>
          </div>
        </div>

        <SearchBox onPick={setFocus} scope={scope} setScope={setScope} />

        <div className="graph-toolbar">
          <span className="small muted">
            {graph ? <>{total.toLocaleString()} standards · {data.links.length.toLocaleString()} relationships</> : 'Loading graph…'}
            {focus && neighbourhood && (
              <> · <b style={{ color: SEL }}>{focus}</b> and {neighbourhood.near.size - 1} directly connected</>
            )}
          </span>
          <span className="spacer" />
          {focus && <button className="ghost" onClick={() => setFocus(null)}>Clear selection</button>}
          <button className="ghost" onClick={fit}>Fit all</button>
          <div className="zoomers">
            <button className="ghost" onClick={() => { const z = fgRef.current?.zoom() || 1; fgRef.current?.zoom(Math.min(12, z * 1.5), 250) }} aria-label="Zoom in">+</button>
            <button className="ghost" onClick={() => { const z = fgRef.current?.zoom() || 1; fgRef.current?.zoom(Math.max(0.05, z / 1.5), 250) }} aria-label="Zoom out">−</button>
          </div>
        </div>

        <div className="graphwrap tall" ref={wrapRef}>
          {!graph && <div className="graph-loading">Laying out {total || 'the'} standards…</div>}
          {graph && (
            <ForceGraph2D
              ref={fgRef}
              graphData={data}
              width={width}
              height={560}
              backgroundColor={SURFACE}
              cooldownTicks={140}
              warmupTicks={40}
              d3VelocityDecay={0.35}
              onEngineStop={onEngineStop}
              minZoom={0.05}
              maxZoom={12}
              onNodeHover={setHovered}
              onNodeClick={(n) => setFocus(n.id)}
              onBackgroundClick={() => setFocus(null)}
              linkColor={(l) => {
                if (!dimmed) return (EDGE_COLOR[l.type] || EDGE_COLOR.related) + '55'
                return focusLinks?.has(linkKey(l)) ? (EDGE_COLOR[l.type] || EDGE_COLOR.related) : DIM_LINK
              }}
              linkWidth={(l) => (dimmed && focusLinks?.has(linkKey(l)) ? 2.2 : 0.5)}
              linkDirectionalArrowLength={(l) => (dimmed && focusLinks?.has(linkKey(l)) ? 5 : 0)}
              linkDirectionalArrowRelPos={1}
              nodeCanvasObject={(node, ctx, scale) => {
                const isSel = focus === node.id
                const isNear = !isSel && neighbourhood?.near.has(node.id)
                // Degree drives size: a standard that fifty others cite should
                // read as a hub without needing a label at low zoom.
                const r = isSel ? 8 : isNear ? 4.5 : Math.min(4.5, 1.6 + Math.log2(node.degree + 1) * 0.7)

                if (isSel) {
                  ctx.beginPath()
                  ctx.arc(node.x, node.y, r + 8, 0, 2 * Math.PI)
                  ctx.fillStyle = 'rgba(29,78,216,0.16)'
                  ctx.fill()
                }
                ctx.beginPath()
                ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
                ctx.fillStyle = dimmed
                  ? (isSel ? SEL : isNear ? NEIGHBOUR : DIM_NODE)
                  : BASE
                ctx.fill()
                if (isSel || isNear) {
                  ctx.strokeStyle = SURFACE
                  ctx.lineWidth = 1.6
                  ctx.stroke()
                }

                // Sixty neighbour labels drawn at once overprint each other into
                // mush, so they are rationed: the selection is always named, and
                // neighbours earn a label only as the reader zooms in. Every label
                // gets a white plate so the ones that do overlap stay readable.
                const showLabel = isSel || (isNear && scale > 1.5) || (!dimmed && scale > 5)
                if (showLabel) {
                  const f = isSel ? Math.max(11, 15 / Math.sqrt(scale)) : Math.max(7.5, 10 / Math.sqrt(scale))
                  ctx.font = `${isSel ? 700 : 500} ${f}px ui-monospace, monospace`
                  ctx.textAlign = 'center'
                  const y = node.y - r - 5
                  const w = ctx.measureText(node.id).width
                  ctx.fillStyle = isSel ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.78)'
                  ctx.fillRect(node.x - w / 2 - 4, y - f, w + 8, f + 4)
                  ctx.fillStyle = isSel ? SEL : '#334155'
                  ctx.fillText(node.id, node.x, y)
                }
              }}
              nodePointerAreaPaint={(node, color, ctx) => {
                ctx.fillStyle = color
                ctx.beginPath()
                ctx.arc(node.x, node.y, 7, 0, 2 * Math.PI)
                ctx.fill()
              }}
            />
          )}
          {hovered && (
            <div className="graph-hover">
              <div className="mono hv-num">{hovered.id}</div>
              <div className="small">{hovered.title}</div>
              <div className="small muted">
                {hovered.department} · {hovered.degree} relationship{hovered.degree === 1 ? '' : 's'} · click to isolate
              </div>
            </div>
          )}
        </div>

        <div className="legend">
          {focus ? (
            <>
              <span><i className="dot" style={{ background: SEL }} /> selected</span>
              <span><i className="dot" style={{ background: NEIGHBOUR }} /> directly connected</span>
              <span><i className="dot" style={{ background: DIM_NODE }} /> rest of the corpus</span>
            </>
          ) : (
            <span><i className="dot" style={{ background: BASE }} /> node size follows how often a standard is cited</span>
          )}
          {Object.entries(EDGE_COLOR).map(([k, v]) => (
            <span key={k}><i className="dot" style={{ background: v }} /> {EDGE_LABEL[k]}</span>
          ))}
        </div>
      </div>

      {focus && <StandardDetail isNumber={focus} onOpen={setFocus} showGraph={false} />}
    </>
  )
}
