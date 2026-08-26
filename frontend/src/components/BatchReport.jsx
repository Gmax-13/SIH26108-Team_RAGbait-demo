import { useState } from 'react'
import { downloadCSV, downloadJSON, stamp } from '../download'
import { CurrencyBadge } from './Common'
import ResultView from './ResultView'

const fmt = (n) => (n ?? 0).toLocaleString()

function Tile({ n, l, cls = '' }) {
  return (
    <div className={`tile ${cls}`}>
      <div className="n">{fmt(n)}</div>
      <div className="l">{l}</div>
    </div>
  )
}

export default function BatchReport({ report }) {
  const [open, setOpen] = useState(null)
  if (!report) return null
  const s = report.summary

  return (
    <>
      <div className="panel">
        <h2>Compliance summary</h2>
        <p className="sub">Every requirement ran through the same verification as a single query.</p>
        <div className="tiles">
          <Tile n={s.requirements_extracted} l="Requirements extracted" />
          <Tile n={s.standards_identified} l="Standards identified" cls="good" />
          <Tile n={s.outdated_document_citations} l="Outdated references in the tender"
                cls={s.outdated_document_citations ? 'bad' : ''} />
          <Tile n={s.certification_flags} l="Certification flags"
                cls={s.certification_flags ? 'flag' : ''} />
          <Tile n={s.requirements_abstained} l="Abstained — no confident match"
                cls={s.requirements_abstained ? 'flag' : ''} />
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="ghost" onClick={() => downloadJSON(`compliance-report-${stamp()}.json`, report)}>
            export full report (JSON)
          </button>
          <button className="ghost" onClick={() => downloadCSV(
            `compliance-requirements-${stamp()}.csv`,
            report.results || [],
            [
              { label: 'requirement_id', get: (x) => x.requirement.id },
              { label: 'requirement', get: (x) => x.requirement.text },
              { label: 'category', get: (x) => x.requirement.category },
              { label: 'outcome', get: (x) => x.result.status },
              { label: 'standard', get: (x) => (x.result.primary_standards || [])[0]?.is_number || '' },
              { label: 'title', get: (x) => (x.result.primary_standards || [])[0]?.title || '' },
              { label: 'confidence', get: (x) => x.result.confidence ?? '' },
              { label: 'currency', get: (x) => (x.result.primary_standards || [])[0]?.currency?.status || '' },
              { label: 'cited_in_document', get: (x) => (x.requirement.cited_standards || []).join('; ') },
            ])}>
            export requirements (CSV)
          </button>
        </div>
        <p className="small muted" style={{ marginBottom: 0, marginTop: 12 }}>
          Extraction method: <b>{report.extraction?.method}</b>
          {' · '}{report.elapsed_sec}s
          {(report.extraction?.notes || []).map((n, i) => (
            <span key={i}><br />{n}</span>
          ))}
        </p>
      </div>

      {!!(report.outdated_document_citations || []).length && (
        <div className="panel">
          <h2>Outdated standards cited by the tender</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            The document references these editions; the BIS catalogue has newer ones.
          </p>
          <div className="scroll-x">
            <table>
              <thead>
                <tr><th>Cited as</th><th>Resolved</th><th>Status</th><th>Latest edition</th></tr>
              </thead>
              <tbody>
                {report.outdated_document_citations.map((c, i) => (
                  <tr key={i}>
                    <td className="mono">{c.cited_as}</td>
                    <td className="mono">{c.is_number}</td>
                    <td><CurrencyBadge currency={c} /></td>
                    <td className="mono">{c.latest_known_edition || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!!(report.certification_flags || []).length && (
        <div className="panel">
          <h2>Certification requirements to verify</h2>
          <div className="scroll-x">
            <table>
              <thead>
                <tr><th>Standard</th><th>Scheme</th><th>Confidence</th><th>Authority</th><th>Req.</th></tr>
              </thead>
              <tbody>
                {report.certification_flags.map((c, i) => (
                  <tr key={i}>
                    <td className="mono">{c.is_number}</td>
                    <td><span className="badge warn">{c.scheme}</span></td>
                    <td className="small">{c.confidence}</td>
                    <td className="small muted">{c.authority}</td>
                    <td className="mono small">{c.requirement_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Flags come from a curated rule table and are prompts to verify against the
            current BIS/MeitY notifications — not legal determinations.
          </p>
        </div>
      )}

      <div className="panel">
        <h2>Requirement-by-requirement</h2>
        <div className="scroll-x">
          <table>
            <thead>
              <tr><th>#</th><th>Requirement</th><th>Outcome</th><th>Standard</th><th>Conf.</th><th /></tr>
            </thead>
            <tbody>
              {(report.results || []).map((item, i) => {
                const r = item.result
                const abst = r.status === 'abstained'
                const primary = (r.primary_standards || [])[0]
                return (
                  <tr key={i}>
                    <td className="mono">{item.requirement.id}</td>
                    <td style={{ maxWidth: 460 }}>{item.requirement.text}</td>
                    <td>
                      <span className={`badge ${abst ? 'abstain-b muted' : 'ok'}`}>
                        {abst ? 'abstained' : 'recommended'}
                      </span>
                    </td>
                    <td className="mono">{primary?.is_number || '—'}</td>
                    <td className="mono">{r.confidence != null ? r.confidence.toFixed(2) : '—'}</td>
                    <td>
                      <button className="ghost" onClick={() => setOpen(open === i ? null : i)}>
                        {open === i ? 'hide' : 'detail'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {open !== null && report.results[open] && (
        <div className="panel">
          <h2>Detail — {report.results[open].requirement.id}</h2>
          <p className="small muted">{report.results[open].requirement.text}</p>
          <ResultView result={report.results[open].result} />
        </div>
      )}
    </>
  )
}
