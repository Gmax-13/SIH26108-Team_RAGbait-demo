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

const fmt = (n) => (n ?? 0).toLocaleString()

/** One expandable dependency row: the relationship, plus the verbatim sentence
 *  from the source text that proves it. */
function EdgeRow({ e, label, openTarget, title, onOpen, openRow, setOpenRow, idx }) {
  const open = openRow === idx
  const confirmed = e.confidence === 'confirmed'
  // A cited standard may sit outside the ingested departments; then there is no
  // record to open and saying so beats a link that 404s.
  const inCorpus = Boolean(openTarget)
  return (
    <>
      <tr>
        <td style={{ whiteSpace: 'nowrap' }}>
          {inCorpus
            ? <button className="linkish mono" onClick={() => onOpen?.(openTarget)}>{label}</button>
            : <span className="mono">{label}</span>}
        </td>
        <td className="small">
          {title || <span className="muted">not in the ingested corpus</span>}
        </td>
        <td>
          <span className={`badge ${confirmed ? 'ok' : 'warn'}`}>
            <b aria-hidden="true">{confirmed ? '✓' : '!'}</b>
            {EDGE_LABEL[e.edge_type] || e.edge_type}
          </span>
        </td>
        <td className="small muted">{confirmed ? 'From source text' : 'Inferred'}</td>
        <td style={{ textAlign: 'right' }}>
          <button className="ghost" onClick={() => setOpenRow(open ? null : idx)}>
            {open ? 'Hide' : 'Evidence'}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} style={{ background: 'var(--surface-2)' }}>
            {e.evidence_section && (
              <div className="small muted" style={{ marginBottom: 5 }}>{e.evidence_section}</div>
            )}
            <div className="excerpt">{e.evidence_snippet}</div>
          </td>
        </tr>
      )}
    </>
  )
}

function Field({ label, children }) {
  return (
    <tr>
      <td className="field-label">{label}</td>
      <td>{children}</td>
    </tr>
  )
}

/** `showGraph=false` when the caller already draws a graph — the explorer puts
 *  this panel underneath the full knowledge graph, and rendering a second
 *  dependency graph inside it just repeated the same picture. */
export default function StandardDetail({ isNumber, onOpen, showGraph = true }) {
  const [std, setStd] = useState(null)
  const [graph, setGraph] = useState(null)
  const [err, setErr] = useState(null)
  const [hops, setHops] = useState(2)
  const [outRow, setOutRow] = useState(null)
  const [inRow, setInRow] = useState(null)

  useEffect(() => {
    if (!isNumber) return
    setStd(null); setGraph(null); setErr(null); setOutRow(null); setInRow(null)
    getStandard(isNumber).then(setStd).catch((e) => setErr(String(e)))
    if (!showGraph) return
    getGraph(isNumber, hops).then(setGraph).catch(() => {})
  }, [isNumber, hops, showGraph])

  if (!isNumber) return null
  if (err) return <div className="err">{err}</div>
  if (!std) return <p className="muted">Loading {isNumber}…</p>

  const outgoing = std.outgoing_edges || []
  const incoming = std.incoming_edges || []
  const withdrawn = std.is_active === 0 || std.withdrawn_status === 'W'

  return (
    <>
      {/* ---- identity ---- */}
      <div className="panel std-head">
        <div>
          <div className="row" style={{ marginBottom: 6 }}>
            <span className="no" style={{ fontSize: 20 }}>{std.is_number}</span>
            <WithdrawnBadge on={withdrawn} />
            <CurrencyBadge currency={std.currency} />
            <MetaOnlyBadge on={std.metadata_only} />
            {std.aspect && <span className="badge info">{std.aspect}</span>}
          </div>
          <div style={{ fontSize: 15.5 }}>{std.title}</div>
        </div>
        <div className="std-head-stats">
          <div><b>{fmt(outgoing.length)}</b><span>cites</span></div>
          <div><b>{fmt(std.cited_by_count)}</b><span>cited by</span></div>
          <div><b>{std.has_full_text ? fmt(std.full_text_chars) : '—'}</b><span>chars of text</span></div>
        </div>
      </div>

      {/* ---- graph first: the whole web, with this standard highlighted ---- */}
      {showGraph && graph && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <h2 style={{ margin: 0 }}>Dependency graph</h2>
              <p className="sub" style={{ margin: '4px 0 0' }}>
                {std.is_number} and everything it depends on, {hops} hop{hops > 1 ? 's' : ''} out.
              </p>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <span className="small muted">hops</span>
              {[1, 2, 3].map((h) => (
                <button key={h} className={`ghost ${hops === h ? 'on' : ''}`}
                  onClick={() => setHops(h)}>{h}</button>
              ))}
            </div>
          </div>
          <GraphView graph={graph} height={560} onNodeClick={onOpen} focusId={std.is_number} />
        </div>
      )}

      {/* ---- catalogue record ---- */}
      <div className="detail-grid">
        <div className="panel">
          <h2>Catalogue record</h2>
          <p className="sub">Exactly as published by BIS.</p>
          <table className="fields">
            <tbody>
              <Field label="IS number"><span className="mono">{std.is_number}</span></Field>
              <Field label="Base number"><span className="mono">{std.is_base}</span></Field>
              <Field label="Part / Section">
                <span className="mono">{std.part ? `Part ${std.part}` : '—'}
                  {std.section ? ` / Sec ${std.section}` : ''}</span>
              </Field>
              <Field label="Published"><span className="mono">{std.year || '—'}</span></Field>
              <Field label="Technical committee"><span className="mono">{std.technical_committee || '—'}</span></Field>
              <Field label="Department"><span className="mono">{std.department || '—'}</span></Field>
              <Field label="Aspect">{std.aspect || '—'}</Field>
              <Field label="Amendments">
                <span className="mono">{std.amendment_count ?? 0}</span>
                {std.amendment_count > 0 && (
                  <span className="small muted"> — not part of the base document</span>
                )}
              </Field>
              <Field label="ISO / IEC equivalent">
                <span className="mono">{std.iso_equivalence || '—'}</span>
                {std.iso_equiv_degree && <div className="small muted">{std.iso_equiv_degree}</div>}
              </Field>
              <Field label="Catalogue status">{std.status_note || '—'}</Field>
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2>Provenance &amp; trust</h2>
          <p className="sub">What this record is actually backed by.</p>
          <table className="fields">
            <tbody>
              <Field label="Source">{std.source || '—'}</Field>
              <Field label="Full text">
                {std.has_full_text
                  ? <><span className="mono">{fmt(std.full_text_chars)}</span> characters ingested</>
                  : <span className="badge warn"><b aria-hidden="true">!</b>None — metadata only</span>}
              </Field>
              <Field label="Archive item">
                <span className="mono small">{std.archive_identifier || '—'}</span>
              </Field>
              <Field label="Text edition">
                {std.currency?.full_text_year
                  ? <>
                      <span className="mono">{std.currency.full_text_year}</span>
                      {std.currency.text_edition_mismatch && (
                        <span className="badge warn" style={{ marginLeft: 8 }}>
                          <b aria-hidden="true">!</b>differs from catalogue year
                        </span>
                      )}
                    </>
                  : '—'}
              </Field>
              <Field label="Ingested"><span className="mono small">{std.scraped_at}</span></Field>
            </tbody>
          </table>

          <h3>Certification</h3>
          <div className="row"><CertBadges certification={std.certification} /></div>
          {std.certification?.note && (
            <p className="small muted" style={{ marginBottom: 0, marginTop: 8 }}>{std.certification.note}</p>
          )}
        </div>
      </div>

      {/* ---- currency ---- */}
      <div className="panel">
        <h2>Currency</h2>
        <p className="sub">Whether this is the edition that should be specified today.</p>
        <div className="row" style={{ marginBottom: 12 }}>
          <CurrencyBadge currency={std.currency} />
          {std.currency?.latest_known_edition && (
            <span className="small muted">
              Latest edition in the corpus: <span className="mono">{std.currency.latest_known_edition}</span>
            </span>
          )}
        </div>

        {!!(std.currency?.flags || []).length && (
          <ul className="reasons small flags">
            {std.currency.flags.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        )}

        {!!(std.currency?.editions_known || []).length && (
          <>
            <h3>Known editions</h3>
            <div className="row">
              {std.currency.editions_known.map((e, i) => (
                <button key={i} className={`ghost mono ${e.is_number === std.is_number ? 'on' : ''}`}
                  onClick={() => onOpen?.(e.is_number)}>
                  {e.is_number}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ---- dependencies ---- */}
      <div className="panel">
        <h2>Standards this one cites</h2>
        <p className="sub">
          {outgoing.length
            ? 'Each confirmed row carries the verbatim sentence it was read from.'
            : std.metadata_only
              ? 'No full text was ingested, so its citations could not be read.'
              : 'Its text contained no recognisable IS references.'}
        </p>
        {!!outgoing.length && (
          <div className="scroll-x">
            <table>
              <thead>
                <tr><th>Standard</th><th>Title</th><th>Relationship</th><th>Basis</th><th /></tr>
              </thead>
              <tbody>
                {outgoing.map((e, i) => (
                  <EdgeRow key={i} idx={i} e={e}
                    label={e.dst_is_number || e.dst_is_base}
                    openTarget={e.dst_is_number}
                    title={e.dst_title}
                    onOpen={onOpen} openRow={outRow} setOpenRow={setOutRow} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- reverse dependencies ---- */}
      {!!incoming.length && (
        <div className="panel">
          <h2>Standards that cite this one</h2>
          <p className="sub">
            {fmt(std.cited_by_count)} reference{std.cited_by_count === 1 ? '' : 's'} in the corpus.
            A heavily-cited standard is load-bearing — superseding it affects everything listed here.
          </p>
          <div className="scroll-x">
            <table>
              <thead>
                <tr><th>Standard</th><th>Title</th><th>Relationship</th><th>Basis</th><th /></tr>
              </thead>
              <tbody>
                {incoming.map((e, i) => (
                  <EdgeRow key={i} idx={i} e={e}
                    label={e.src_is_number}
                    openTarget={e.src_is_number}
                    title={e.src_title}
                    onOpen={onOpen} openRow={inRow} setOpenRow={setInRow} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
