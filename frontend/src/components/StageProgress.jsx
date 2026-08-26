const STAGES = [
  ['retrieval', 'Semantic retrieval'],
  ['graph', 'Graph expansion'],
  ['synthesis', 'Synthesis'],
  ['critic', 'Grounding check'],
  ['currency', 'Currency check'],
  ['certification', 'Certification flags'],
]

/** Live pipeline progress. These are real stage transitions streamed from the
 *  server, not a timed animation — the detail line under each finished stage is
 *  what that step actually produced. */
export default function StageProgress({ stages, done }) {
  return (
    <div className="panel stages">
      <h2>{done ? 'Pipeline complete' : 'Analysing…'}</h2>
      <p className="sub">
        These are real stage transitions streamed from the server, not a timed
        animation. Nothing is shown until the grounding check has run.
      </p>
      <ol className="stage-list">
        {STAGES.map(([key, label]) => {
          const s = stages[key]
          const state = s?.status === 'done' ? 'done' : s?.status === 'running' ? 'running' : 'idle'
          return (
            <li key={key} className={`stage ${state}`}>
              <span className="stage-mark" aria-hidden="true">
                {state === 'done' ? '✓' : state === 'running' ? '' : ''}
              </span>
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
