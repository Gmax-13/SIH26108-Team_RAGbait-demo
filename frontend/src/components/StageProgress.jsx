import { useState } from 'react'

const STAGES = [
  ['retrieval', 'Semantic retrieval'],
  ['graph', 'Graph expansion'],
  ['synthesis', 'Synthesis'],
  ['critic', 'Grounding check'],
  ['currency', 'Currency check'],
  ['certification', 'Certification flags'],
]

/** Live pipeline progress. These are real stage transitions streamed from the
 *  server, not a timed animation.
 *
 *  While running it is the main thing on screen; once finished it collapses to
 *  a single line, because the answer is what the reader came for and a finished
 *  checklist should not push it below the fold. */
export default function StageProgress({ stages, done }) {
  const [open, setOpen] = useState(false)
  const expanded = !done || open

  const finished = STAGES.filter(([k]) => stages[k]?.status === 'done').length
  const total = Math.max(...STAGES.map(([k]) => stages[k]?.elapsed ?? 0), 0)

  if (!expanded) {
    return (
      <div className="panel stage-summary">
        <span className="badge ok"><b aria-hidden="true">✓</b>{finished} checks passed</span>
        <span className="small muted">
          Retrieved, cross-referenced, synthesised, and verified against source text
          in {total.toFixed(1)}s
        </span>
        <span className="spacer" />
        <button className="ghost" onClick={() => setOpen(true)}>Show steps</button>
      </div>
    )
  }

  return (
    <div className="panel stages">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0 }}>{done ? 'How this was checked' : 'Analysing…'}</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Real stage transitions streamed from the server, not a timed animation.
          </p>
        </div>
        {done && <button className="ghost" onClick={() => setOpen(false)}>Hide</button>}
      </div>
      <ol className="stage-list">
        {STAGES.map(([key, label]) => {
          const s = stages[key]
          const state = s?.status === 'done' ? 'done' : s?.status === 'running' ? 'running' : 'idle'
          return (
            <li key={key} className={`stage ${state}`}>
              <span className="stage-mark" aria-hidden="true">{state === 'done' ? '✓' : ''}</span>
              <span className="stage-label">{label}</span>
              <span className="stage-detail small muted">{s?.detail || ''}</span>
              <span className="stage-time mono small muted">
                {s?.status === 'done' && s.elapsed !== undefined ? `${s.elapsed.toFixed(1)}s` : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
