import { useEffect, useState } from 'react'
import { downloadBlob, downloadCSV, stamp } from '../download'

/** The report's compliance and testing checklist (backend/pipeline/checklist.py).
 *  Ticks are the officer's working state for this session only; the exports
 *  carry an empty status column so the list can be worked offline. */

function toMarkdown(cl) {
  const lines = ['# Compliance and testing checklist', '', `_${cl.note}_`, '']
  for (const s of cl.sections) {
    if (!s.items.length) continue
    lines.push(`## ${s.title}`, '', s.about, '')
    for (const i of s.items) {
      const reqs = i.requirement_ids.length ? ` (${i.requirement_ids.join(', ')})` : ''
      lines.push(`- [ ] **${i.id}** ${i.action}${reqs}`)
      if (i.basis) lines.push(`  - ${i.basis}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export default function ComplianceChecklist({ checklist, onRequirement }) {
  const [done, setDone] = useState({})
  useEffect(() => setDone({}), [checklist])
  if (!checklist) return null

  const sections = checklist.sections.filter((s) => s.items.length)
  const ticked = Object.values(done).filter(Boolean).length
  const toggle = (id) => setDone((d) => ({ ...d, [id]: !d[id] }))

  const exportCSV = () => downloadCSV(
    `compliance-checklist-${stamp()}.csv`,
    sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.title }))),
    [
      { label: 'id', key: 'id' },
      { label: 'section', key: 'section' },
      { label: 'action', key: 'action' },
      { label: 'standard', get: (i) => i.standard || '' },
      { label: 'requirements', get: (i) => i.requirement_ids.join('; ') },
      { label: 'basis', key: 'basis' },
      { label: 'done', get: (i) => (done[i.id] ? 'yes' : '') },
    ])

  return (
    <div className="panel checklist">
      <div className="card-head">
        <div>
          <h2>Compliance &amp; testing checklist</h2>
          <p className="small muted" style={{ margin: '2px 0 0' }}>
            Generated from this report. Every item names the standard and requirement it comes from.
          </p>
        </div>
        <span className={`badge ${ticked && ticked === checklist.total ? 'ok' : 'muted'}`}>
          {ticked} of {checklist.total} done
        </span>
      </div>

      {!sections.length && <p className="muted">No actions: nothing in this report needs attention.</p>}

      {sections.map((s) => (
        <section key={s.key} className={`cl-section cl-${s.key}`}>
          <h3>{s.title} <span className="cl-count">{s.items.length}</span></h3>
          <p className="small muted cl-about">{s.about}</p>
          <ul className="cl-list">
            {s.items.map((i) => (
              <li key={i.id} className={done[i.id] ? 'done' : ''}>
                <input type="checkbox" id={`cl-${i.id}`} checked={!!done[i.id]}
                       onChange={() => toggle(i.id)} />
                <div className="cl-text">
                  <label htmlFor={`cl-${i.id}`}>
                    <span className="mono cl-id">{i.id}</span>{i.action}
                  </label>
                  {(i.basis || i.requirement_ids.length > 0) && (
                    <div className="cl-meta small">
                      {i.requirement_ids.map((r) => (
                        <button key={r} className="cl-req mono" onClick={() => onRequirement?.(r)}
                                title={`Show requirement ${r}`}>{r}</button>
                      ))}
                      {i.basis && <span className="muted">{i.basis}</span>}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="row" style={{ marginTop: 14 }}>
        <button className="ghost" onClick={exportCSV}>export checklist (CSV)</button>
        <button className="ghost" onClick={() => downloadBlob(
          `compliance-checklist-${stamp()}.md`, toMarkdown(checklist), 'text/markdown')}>
          export checklist (Markdown)
        </button>
      </div>
      <p className="small muted" style={{ margin: '10px 0 0' }}>{checklist.note}</p>
    </div>
  )
}
