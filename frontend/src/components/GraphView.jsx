import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'

const EDGE_COLOR = {
  normative_reference: '#4493f8',
  test_method: '#3fb950',
  terminology: '#d29922',
  safety: '#f85149',
  related: '#8b949e',
}

const HOP_COLOR = ['#a371f7', '#4493f8', '#546a82']

export default function GraphView({ graph, height = 430, onNodeClick }) {
  const wrapRef = useRef(null)
  const fgRef = useRef(null)
  const [width, setWidth] = useState(800)
  const [hovered, setHovered] = useState(null)

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

  useEffect(() => {
    const t = setTimeout(() => {
      try { fgRef.current?.zoomToFit(400, 45) } catch { /* not ready yet */ }
    }, 500)
    return () => clearTimeout(t)
  }, [data])

  if (!data.nodes.length) {
    return <p className="small muted">No dependency edges found for this standard.</p>
  }

  return (
    <div>
      <div className="graphwrap" ref={wrapRef} style={{ height }}>
        <ForceGraph2D
          ref={fgRef}
          graphData={data}
          width={width}
          height={height}
          backgroundColor="#0b0e13"
          cooldownTicks={90}
          nodeRelSize={5}
          onNodeHover={setHovered}
          onNodeClick={(n) => onNodeClick?.(n.id)}
          linkColor={(l) => (EDGE_COLOR[l.type] || '#8b949e') + (l.confidence === 'confirmed' ? 'cc' : '55')}
          linkWidth={(l) => (l.confidence === 'confirmed' ? 1.6 : 0.8)}
          linkLineDash={(l) => (l.confidence === 'confirmed' ? null : [3, 3])}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          nodeCanvasObject={(node, ctx, scale) => {
            const r = node.seed ? 7 : 4.5
            ctx.beginPath()
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
            ctx.fillStyle = HOP_COLOR[Math.min(node.hop, 2)]
            ctx.fill()
            if (!node.inCorpus || node.metadataOnly) {
              ctx.strokeStyle = '#d29922'
              ctx.lineWidth = 1.3
              ctx.stroke()
            }
            if (scale > 1.1 || node.seed) {
              const f = Math.max(8, 11 / Math.sqrt(scale))
              ctx.font = `${f}px ui-monospace, monospace`
              ctx.fillStyle = '#e6edf3'
              ctx.textAlign = 'center'
              ctx.fillText(node.label, node.x, node.y - r - 3)
            }
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.arc(node.x, node.y, 9, 0, 2 * Math.PI)
            ctx.fill()
          }}
        />
      </div>

      <div className="legend">
        <span><i className="dot" style={{ background: HOP_COLOR[0] }} /> seed</span>
        <span><i className="dot" style={{ background: HOP_COLOR[1] }} /> 1 hop</span>
        <span><i className="dot" style={{ background: HOP_COLOR[2] }} /> 2 hops</span>
        {Object.entries(EDGE_COLOR).map(([k, v]) => (
          <span key={k}><i className="dot" style={{ background: v }} /> {k.replace('_', ' ')}</span>
        ))}
        <span style={{ color: 'var(--warn)' }}>dashed = inferred, not confirmed from source text</span>
      </div>

      {hovered && (
        <div className="panel" style={{ marginTop: 10, marginBottom: 0 }}>
          <div className="mono" style={{ color: 'var(--accent)' }}>{hovered.label}</div>
          <div className="small">{hovered.title || <span className="muted">Cited but not present in the ingested corpus.</span>}</div>
          {onNodeClick && hovered.inCorpus && (
            <div className="small muted" style={{ marginTop: 4 }}>click to open this standard</div>
          )}
        </div>
      )}
    </div>
  )
}
