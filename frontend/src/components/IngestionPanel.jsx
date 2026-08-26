import { useEffect, useState } from 'react'
import { getLogs, getStats } from '../api'
import { downloadCSV, downloadJSON, stamp } from '../download'

function Tile({ n, l, cls = '' }) {
  return <div className={`tile ${cls}`}><div className="n">{n}</div><div className="l">{l}</div></div>
}

const STATUS_CLS = { ok: 'ok', skip: 'warn', error: 'danger' }

export default function IngestionPanel() {
  const [stats, setStats] = useState(null)
  const [logs, setLogs] = useState(null)
  const [phase, setPhase] = useState('')
  const [err, setErr] = useState(null)

  const load = () => {
    getStats().then(setStats).catch((e) => setErr(String(e)))
    getLogs({ limit: 250, ...(phase ? { phase } : {}) }).then(setLogs).catch(() => {})
  }
  useEffect(load, [phase])

  if (err) return <div className="err">{err}</div>
  if (!stats) return <p className="muted">Loading…</p>

  const ftPct = stats.standards ? ((stats.with_full_text / stats.standards) * 100).toFixed(1) : 0

  return (
    <>
      <div className="panel">
        <h2>Corpus</h2>
        <div className="tiles">
          <Tile n={stats.standards} l="Standards ingested" />
          <Tile n={stats.with_full_text} l={`With full text (${ftPct}%)`} cls="good" />
          <Tile n={stats.metadata_only} l="Metadata only" cls="flag" />
          <Tile n={stats.chunks} l="Citable chunks" />
          <Tile n={stats.edges_confirmed} l="Confirmed edges" cls="good" />
          <Tile n={stats.edges_inferred} l="Inferred edges" cls="flag" />
        </div>
        <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
          Standards without full text stay flagged as <b>metadata only</b>: they remain
          searchable, but the system says so rather than presenting them as verified.
          {stats.edges_dangling > 0 && (
            <> {stats.edges_dangling} edges point at standards cited in source text but
            outside the ingested departments.</>
          )}
          {' '}LLM configured: <b>{String(stats.llm_configured)}</b>.
        </p>
      </div>

      <div className="panel">
        <h2>Composition</h2>
        <div className="row" style={{ alignItems: 'flex-start', gap: 32 }}>
          <div>
            <h3>By department</h3>
            <table style={{ minWidth: 200 }}>
              <tbody>
                {Object.entries(stats.by_department || {}).map(([k, v]) => (
                  <tr key={k}><td className="mono">{k || '—'}</td><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3>By aspect</h3>
            <table style={{ minWidth: 240 }}>
              <tbody>
                {Object.entries(stats.by_aspect || {}).map(([k, v]) => (
                  <tr key={k}><td>{k}</td><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3>Edge types</h3>
            <table style={{ minWidth: 220 }}>
              <tbody>
                {Object.entries(stats.edge_types || {}).map(([k, v]) => (
                  <tr key={k}><td>{k.replace('_', ' ')}</td><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Ingestion audit trail</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Every scrape action is logged, so the dataset build is inspectable rather than
          a black box.
        </p>
        <div className="row" style={{ marginBottom: 10 }}>
          {['', 'catalogue', 'fulltext', 'graph', 'embed'].map((p) => (
            <button key={p} className="ghost"
              style={phase === p ? { borderColor: 'var(--accent)', color: 'var(--text)' } : {}}
              onClick={() => setPhase(p)}>
              {p || 'all phases'}
            </button>
          ))}
          <button className="ghost" onClick={load}>refresh</button>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="ghost" onClick={() => downloadCSV(
            `ingestion-log-${stamp()}.csv`, logs?.events || [],
            [{ key: 'ts' }, { key: 'run_id' }, { key: 'phase' },
             { key: 'status' }, { key: 'target' }, { key: 'message' }])}>
            export log (CSV)
          </button>
          <button className="ghost" onClick={() => downloadJSON(
            `corpus-stats-${stamp()}.json`, { stats, runs: logs?.runs })}>
            export stats (JSON)
          </button>
        </div>

        {!!logs?.runs?.length && (
          <>
            <h3>Runs</h3>
            <div className="scroll-x">
              <table>
                <thead><tr><th>Run</th><th>Phase</th><th>Started</th><th>Events</th></tr></thead>
                <tbody>
                  {logs.runs.map((r, i) => (
                    <tr key={i}>
                      <td className="mono small">{r.run_id}</td>
                      <td><span className="badge info">{r.phase}</span></td>
                      <td className="small muted">{r.started}</td>
                      <td>{r.events}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h3>Events</h3>
        <div className="scroll-x" style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table>
            <thead><tr><th>Phase</th><th>Status</th><th>Target</th><th>Message</th></tr></thead>
            <tbody>
              {(logs?.events || []).map((e, i) => (
                <tr key={i}>
                  <td className="small">{e.phase}</td>
                  <td><span className={`badge ${STATUS_CLS[e.status] || 'muted'}`}>{e.status}</span></td>
                  <td className="mono small" style={{ maxWidth: 260 }}>{e.target}</td>
                  <td className="small muted" style={{ maxWidth: 420 }}>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
