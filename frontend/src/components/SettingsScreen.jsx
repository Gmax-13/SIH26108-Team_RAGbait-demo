const DEFAULTS = { threshold: 0.55, top_k: 12, hops: 2, use_llm: true }

function Row({ label, hint, children }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <b>{label}</b>
        <span className="small muted">{hint}</span>
      </div>
      <div className="set-control">{children}</div>
    </div>
  )
}

/** These are not cosmetic preferences — every field here is a parameter the
 *  recommendation endpoint already accepts, and changing one changes the next
 *  answer. The abstention threshold in particular is the system's safety dial:
 *  raising it makes the engine refuse more often. */
export default function SettingsScreen({ settings, setSettings, health }) {
  const set = (patch) => setSettings((p) => ({ ...p, ...patch }))
  const changed = JSON.stringify(settings) !== JSON.stringify(DEFAULTS)

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div>
            <h2>Retrieval and safety</h2>
            <p className="sub">
              Applied to the next query you run. Nothing here is stored on the server.
            </p>
          </div>
          {changed && <button className="ghost" onClick={() => setSettings(DEFAULTS)}>Reset to defaults</button>}
        </div>

        <Row label="Abstention threshold"
             hint="Below this confidence the engine refuses to answer rather than guessing.">
          <div className="slider-row">
            <input type="range" min="0.2" max="0.9" step="0.01" value={settings.threshold}
                   onChange={(e) => set({ threshold: Number(e.target.value) })} />
            <span className="mono val">{settings.threshold.toFixed(2)}</span>
          </div>
          <p className="small muted set-note">
            Default 0.55. Raise it to make the system more cautious — a query that
            currently answers will start abstaining.
          </p>
        </Row>

        <Row label="Candidates retrieved"
             hint="How many passages the semantic search pulls before ranking.">
          <div className="slider-row">
            <input type="range" min="4" max="30" step="1" value={settings.top_k}
                   onChange={(e) => set({ top_k: Number(e.target.value) })} />
            <span className="mono val">{settings.top_k}</span>
          </div>
        </Row>

        <Row label="Graph hops"
             hint="How far to walk the dependency graph from each candidate.">
          <div className="seg small-seg">
            {[1, 2, 3].map((h) => (
              <button key={h} className={settings.hops === h ? 'on' : ''}
                      onClick={() => set({ hops: h })}>{h}</button>
            ))}
          </div>
        </Row>

        <Row label="Use the language model"
             hint="Off falls back to rule-based synthesis. The critic still runs either way.">
          <button className={`toggle ${settings.use_llm ? 'on' : ''}`}
                  role="switch" aria-checked={settings.use_llm}
                  onClick={() => set({ use_llm: !settings.use_llm })}>
            <i />
          </button>
        </Row>
      </div>

      <div className="card">
        <h2>System</h2>
        <p className="sub">Read-only — these come from the server's configuration.</p>
        <div className="kv">
          <div><span>Corpus scope</span>
            <b>{health?.scope?.scoped ? health.scope.departments.join(', ') : 'Whole catalogue'}</b></div>
          <div><span>Standards answerable</span>
            <b>{(health?.standards ?? 0).toLocaleString()}</b></div>
          <div><span>Ingested in total</span>
            <b>{(health?.corpus_total_standards ?? 0).toLocaleString()}</b></div>
          <div><span>Language model</span>
            <b>{health?.llm_configured ? 'Connected' : 'Not configured'}</b></div>
        </div>
        {health?.scope?.scoped && (
          <p className="small muted set-note">{health.scope.note}</p>
        )}
      </div>
    </>
  )
}
