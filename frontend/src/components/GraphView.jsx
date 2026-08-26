import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'

// Categorical hues validated for CVD and normal-vision separation on a light
// surface (worst all-pairs deutan dE 9.2, normal-vision 16.3). The legend below
// carries visible labels, so identity is never colour-alone.
const EDGE_COLOR = {
  normative_reference: '#2a78d6',
  test_method: '#1baf7a',
  terminology: '#eb6834',
  safety: '#4a3aa7',
  related: '#7b8798',
}
const EDGE_LABEL = {
  normative_reference: 'normative reference',
  test_method: 'test method',
  terminology: 'terminology',
  safety: 'safety',
  related: 'related',
}

// Hop distance from the query: the seed is the strongest, outer rings recede.
const HOP_COLOR = ['#6d4bc4', '#2a78d6', '#8fa6c2']
const SURFACE = '#f8fafc'
const INK = '#10151f'
const FLAG = '#b7791f'

export default function GraphView({ graph, height = 430, onNodeClick, focusId }) {
  const wrapRef = useRef(null)
  const fgRef = useRef(null)
  const [width, setWidth] = useState(800)
  const [hovered, setHovered] = useState(null)
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const data = useMemo(() => {
    const nodes = (graph?.nodes || []).map((n) => ({
      id: n.is_number,
      label: n.is_number,
      title: n.title,
      hop: n.hop ?? 0,
      seed: !!n.seed,
      aspect: n.aspect,
      inCorpus: n.in_corpus !== false,
      metadataOnly: !!n.metadata_only,
    }))
    const ids = new Set(nodes.map((n) => n.id))
    const links = (graph?.edges || [])
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        type: e.edge_type,
        confidence: e.confidence,
        section: e.evidence_section,
        snippet: e.evidence_snippet,
      }))
    return { nodes, links }
  }, [graph])

  // A default force layout bunches 40+ nodes into an unreadable knot. Push them
  // apart and lengthen the links so the structure is legible at fit-zoom.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    try {
      fg.d3Force('charge')?.strength(-260).distanceMax(520)
      fg.d3Force('link')?.distance(78).strength(0.35)
      fg.d3ReheatSimulation?.()
    } catch { /* forces not ready */ }
  }, [data])

  const isFocus = useCallback(
    (node) => (focusId ? node.id === focusId : node.seed),
    [focusId],
  )

  const fit = useCallback(() => {
    try { fgRef.current?.zoomToFit(500, 60) } catch { /* not mounted yet */ }
  }, [])

  const focusSelected = useCallback(() => {
    const n = data.nodes.find(isFocus)
    if (!n || n.x === undefined) return fit()
    try {
      fgRef.current?.centerAt(n.x, n.y, 600)
      fgRef.current?.zoom(2.4, 600)
    } catch { /* not mounted yet */ }
  }, [data, isFocus, fit])

  // Fit once the simulation has settled, so the whole graph is visible before
  // the reader decides where to look.
  useEffect(() => { setSettled(false) }, [data])

  const onEngineStop = useCallback(() => {
    if (settled) return
    setSettled(true)
    fit()
  }, [settled, fit])

  const zoomBy = (factor) => {
    try {
      const z = fgRef.current?.zoom() || 1
      fgRef.current?.zoom(Math.max(0.2, Math.min(8, z * factor)), 250)
    } catch { /* not mounted yet */ }
  }

  if (!data.nodes.length) {
    return <p className="small muted">No dependency edges recorded for this standard.</p>
  }

  const confirmed = data.links.filter((l) => l.confidence === 'confirmed').length

  return (
    <div>
      <div className="graph-toolbar">
        <span className="small muted">
          {data.nodes.length} standards · {data.links.length} relationships
        </span>
        <span className="spacer" />
        <button className="ghost" onClick={focusSelected} title="Centre and zoom on the selected standard">
          Focus selected
        </button>
        <button className="ghost" onClick={fit} title="Fit the whole graph in view">Fit all</button>
        <div className="zoomers">
          <button className="ghost" onClick={() => zoomBy(1.4)} aria-label="Zoom in">+</button>
          <button className="ghost" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">−</button>
        </div>
      </div>

      <div className="graphwrap" ref={wrapRef} style={{ height }}>
        <ForceGraph2D
          ref={fgRef}
          graphData={data}
          width={width}
          height={height}
          backgroundColor={SURFACE}
          cooldownTicks={220}
          d3VelocityDecay={0.28}
          onEngineStop={onEngineStop}
          nodeRelSize={5}
          minZoom={0.2}
          maxZoom={8}
          onNodeHover={setHovered}
          onNodeClick={(n) => onNodeClick?.(n.id)}
          linkColor={(l) => (EDGE_COLOR[l.type] || EDGE_COLOR.related) + (l.confidence === 'confirmed' ? 'e6' : '66')}
          linkWidth={(l) => (l.confidence === 'confirmed' ? 1.6 : 0.8)}
          linkLineDash={(l) => (l.confidence === 'confirmed' ? null : [3, 3])}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          nodeCanvasObject={(node, ctx, scale) => {
            const focus = isFocus(node)
            const r = focus ? 9 : node.hop === 1 ? 5.5 : 4.5

            // Halo behind the selected standard so it is findable at any zoom.
            if (focus) {
              ctx.beginPath()
              ctx.arc(node.x, node.y, r + 7, 0, 2 * Math.PI)
              ctx.fillStyle = 'rgba(109, 75, 196, 0.16)'
              ctx.fill()
            }

            ctx.beginPath()
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
            ctx.fillStyle = focus ? HOP_COLOR[0] : HOP_COLOR[Math.min(node.hop, 2)]
            ctx.fill()
            // 2px surface ring so overlapping nodes stay individually readable
            ctx.strokeStyle = SURFACE
            ctx.lineWidth = 2
            ctx.stroke()

            if (!node.inCorpus || node.metadataOnly) {
              ctx.beginPath()
              ctx.arc(node.x, node.y, r + 1.6, 0, 2 * Math.PI)
              ctx.strokeStyle = FLAG
              ctx.lineWidth = 1.3
              ctx.stroke()
            }

            // Label density has to follow zoom or 45 nodes overwrite each other
            // into noise. The selected standard is always named; its immediate
            // neighbours appear once zoomed in a little; the rest only close up.
            const showLabel = focus || (node.hop === 1 && scale > 1.8) || scale > 3.0
            if (showLabel) {
              const f = focus ? Math.max(11, 13 / Math.sqrt(scale)) : Math.max(8, 11 / Math.sqrt(scale))
              ctx.font = `${focus ? 700 : 400} ${f}px ui-monospace, monospace`
              ctx.textAlign = 'center'
              const y = node.y - r - 5
              if (focus) {
                const w = ctx.measureText(node.label).width
                ctx.fillStyle = 'rgba(255,255,255,0.88)'
                ctx.fillRect(node.x - w / 2 - 4, y - f, w + 8, f + 5)
              }
              ctx.fillStyle = INK
              ctx.fillText(node.label, node.x, y)
            }
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.arc(node.x, node.y, 10, 0, 2 * Math.PI)
            ctx.fill()
          }}
        />
      </div>

      <div className="legend">
        <span><i className="dot" style={{ background: HOP_COLOR[0] }} /> selected</span>
        <span><i className="dot" style={{ background: HOP_COLOR[1] }} /> 1 hop</span>
        <span><i className="dot" style={{ background: HOP_COLOR[2] }} /> 2 hops</span>
        {Object.entries(EDGE_COLOR).map(([k, v]) => (
          <span key={k}><i className="dot" style={{ background: v }} /> {EDGE_LABEL[k]}</span>
        ))}
        <span><i className="dash" /> inferred — not confirmed from source text</span>
        <span><i className="dot ring" /> metadata only / outside corpus</span>
      </div>

      <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
        Drag to pan, scroll to zoom, drag a node to pull it out of the tangle, click one to open it.
        Names appear as you zoom in — at full extent only the selected standard is labelled, so the
        shape of the dependency web stays readable.
        {confirmed > 0 && ` ${confirmed} of ${data.links.length} relationships were read from source text.`}
      </p>

      {hovered && (
        <div className="graph-hover">
          <div className="mono" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>{hovered.label}</div>
          <div className="small">
            {hovered.title || <span className="muted">Cited in source text but not present in the ingested corpus.</span>}
          </div>
          {onNodeClick && hovered.inCorpus && (
            <div className="small muted" style={{ marginTop: 3 }}>Click to open this standard</div>
          )}
        </div>
      )}
    </div>
  )
}
