import { useEffect, useState } from 'react'
import { getGraph, getStandard } from '../api'
import { CertBadges, CurrencyBadge, MetaOnlyBadge, WithdrawnBadge } from './Common'
import GraphView from './GraphView'

const EDGE_LABEL = {
  normative_reference: 'normative reference',
  test_method: 'test method',
  terminology: 'terminology',
  safety: 'safety',
  related: 'related',
}

export default function StandardDetail({ isNumber, onOpen }) {
  const [std, setStd] = useState(null)
  const [graph, setGraph] = useState(null)
  const [err, setErr] = useState(null)
  const [hops, setHops] = useState(2)

  useEffect(() => {
    if (!isNumber) return
    setStd(null); setGraph(null); setErr(null)
    getStandard(isNumber).then(setStd).catch((e) => setErr(String(e)))
    getGraph(isNumber, hops).then(setGraph).catch(() => {})
  }, [isNumber, hops])

  if (!isNumber) return null
  if (err) return <div className="err">{err}</div>
  if (!std) return <p className="muted">Loading {isNumber}…</p>

  const confirmed = (std.outgoing_edges || []).filter((e) => e.confidence === 'confirmed')
  const inferred = (std.outgoing_edges || []).filter((e) => e.confidence !== 'confirmed')

  return (
    <>
      <div className="panel">
        <div className="row" style={{ marginBottom: 6 }}>
          <span className="no" style={{ fontSize: 17 }}>{std.is_number}</span>
          <WithdrawnBadge on={std.is_active === 0 || std.withdrawn_status === 'W'} />
          <CurrencyBadge currency={std.currency} />
          <MetaOnlyBadge on={std.metadata_only} />
          {std.aspect && <span className="badge info">{std.aspect}</span>}
        </div>
        <div style={{ fontSize: 15 }}>{std.title}</div>

        <h3>Catalogue record</h3>
        <div className="scroll-x">
          <table>
            <tbody>
              <tr><td className="muted">Technical committee</td><td className="mono">{std.technical_committee || '—'}</td></tr>
              <tr><td className="muted">Department</td><td className="mono">{std.department || '—'}</td></tr>
              <tr><td className="muted">Published</td><td className="mono">{std.year || '—'}</td></tr>
              <tr><td className="muted">Amendments</td><td className="mono">{std.amendment_count ?? 0}</td></tr>
              <tr>
                <td className="muted">ISO/IEC equivalent</td>
                <td className="mono">
                  {std.iso_equivalence || '—'}
                  {std.iso_equiv_degree && <span className="small muted"> · {std.iso_equiv_degree}</span>}
                </td>
              </tr>
              <tr>
                <td className="muted">Source text</td>
                <td className="mono">
                  {std.has_full_text
                    ? <>{std.full_text_chars?.toLocaleString()} chars · <span className="small muted">{std.archive_identifier}</span></>
                    : <span className="badge warn">none ingested — metadata only</span>}
                </td>
              </tr>
              <tr><td className="muted">Ingested</td><td className="mono small">{std.scraped_at}</td></tr>
            </tbody>
          </table>
        </div>

        {!!(std.currency?.flags || []).length && (
          <>
            <h3>Currency flags</h3>
            <ul className="reasons small" style={{ color: 'var(--warn)' }}>
              {std.currency.flags.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </>
        )}

        {!!(std.currency?.editions_known || []).length && (
          <>
            <h3>Known editions</h3>
            <div className="row">
              {std.currency.editions_known.map((e, i) => (
                <button key={i} className="ghost" onClick={() => onOpen?.(e.is_number)}
                  style={e.is_number === std.is_number ? { borderColor: 'var(--accent)' } : {}}>
                  {e.is_number}
                </button>
              ))}
            </div>
          </>
        )}

        <h3>Certification</h3>
        <div className="row"><CertBadges certification={std.certification} /></div>
        {std.certification?.note && (
          <p className="small muted" style={{ marginBottom: 0 }}>{std.certification.note}</p>
        )}
      </div>

      <div className="panel">
        <h2>Dependencies cited by this standard</h2>
        {!std.outgoing_edges?.length && (
          <p className="small muted" style={{ marginTop: 0 }}>
            No outgoing references recorded. {std.metadata_only
              ? 'No full text was ingested, so its citations could not be read.'
              : 'Its text contained no recognisable IS references.'}
          </p>
        )}

        {!!confirmed.length && (
          <>
            <h3>Confirmed from source text ({confirmed.length})</h3>
            {confirmed.map((e, i) => (
              <div className="cite" key={i}>
                <div className="head">
                  <button className="ghost mono" onClick={() => onOpen?.(e.dst_is_base)}>
                    {e.dst_is_base}
                  </button>
                  <span className="badge ok">{EDGE_LABEL[e.edge_type] || e.edge_type}</span>
                  {e.evidence_section && <span className="small muted">{e.evidence_section}</span>}
                </div>
                <div className="excerpt">{e.evidence_snippet}</div>
              </div>
            ))}
          </>
        )}

        {!!inferred.length && (
          <>
            <h3>Inferred — not verified ({inferred.length})</h3>
            {inferred.map((e, i) => (
              <div className="cite" key={i} style={{ borderLeftColor: 'var(--warn)' }}>
                <div className="head">
                  <button className="ghost mono" onClick={() => onOpen?.(e.dst_is_base)}>
                    {e.dst_is_base}
                  </button>
                  <span className="badge warn">{EDGE_LABEL[e.edge_type] || e.edge_type} · inferred</span>
                </div>
                <div className="excerpt">{e.evidence_snippet}</div>
              </div>
            ))}
          </>
        )}
      </div>

      {!!(std.incoming_edges || []).length && (
        <div className="panel">
          <h2>Standards that cite this one</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            {std.cited_by_count} reference{std.cited_by_count === 1 ? '' : 's'} in the
            ingested corpus. A heavily-cited standard is load-bearing: superseding it
            affects everything listed here.
          </p>
          <div className="scroll-x">
            <table>
              <thead><tr><th>Standard</th><th>Title</th><th>Relationship</th></tr></thead>
              <tbody>
                {std.incoming_edges.map((e, i) => (
                  <tr key={i}>
                    <td>
                      <button className="ghost mono" onClick={() => onOpen?.(e.src_is_number)}>
                        {e.src_is_number}
                      </button>
                    </td>
                    <td className="small">{e.src_title}</td>
                    <td>
                      <span className={`badge ${e.confidence === 'confirmed' ? 'ok' : 'warn'}`}>
                        {EDGE_LABEL[e.edge_type] || e.edge_type}
                        {e.confidence === 'confirmed' ? '' : ' · inferred'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {graph && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>Dependency graph</h2>
            <div className="row">
              <span className="small muted">hops</span>
              {[1, 2, 3].map((h) => (
                <button key={h} className="ghost"
                  style={hops === h ? { borderColor: 'var(--accent)', color: 'var(--text)' } : {}}
                  onClick={() => setHops(h)}>{h}</button>
              ))}
            </div>
          </div>
          <GraphView graph={graph} onNodeClick={onOpen} />
        </div>
      )}
    </>
  )
}
