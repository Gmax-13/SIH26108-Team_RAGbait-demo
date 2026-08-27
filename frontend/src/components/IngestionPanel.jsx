import { useEffect, useState } from 'react'
import { getLogs, getStats } from '../api'
import { downloadCSV, downloadJSON, stamp } from '../download'
import { CountUp } from '../anim'

const fmt = (n) => (n ?? 0).toLocaleString()

function Tile({ n, l, cls = '' }) {
  return (
    <div className={`tile ${cls}`}>
      <div className="n"><CountUp value={n} /></div>
      <div className="l">{l}</div>
    </div>
  )
}

/** Magnitude comparison across categories: bars, sorted, one hue. A bare number
 *  column makes the reader do the comparing; the bar does it for them. */
function BarRows({ data, hue = 'var(--accent)' }) {
  const rows = Object.entries(data || {})
    .filter(([k]) => k && k !== 'null')
    .sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...rows.map(([, v]) => v))
  return (
    <div className="bars">
      {rows.map(([k, v]) => (
        <div className="bar-row" key={k}>
          <span className="bar-label" title={k}>{k.replace(/_/g, ' ')}</span>
          <span className="bar-track">
            <i style={{ width: `${Math.max(2, (v / max) * 100)}%`, background: hue }} />
          </span>
          <span className="bar-val">{fmt(v)}</span>
        </div>
      ))}
    </div>
  )
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
        <p className="sub">Built entirely from the BIS catalogue and Internet Archive — nothing hand-curated.</p>
        {stats.scope?.scoped && (
          <p className="scope-note small">
            <b>Scoped to {stats.scope.departments.join(' and ')}.</b>{' '}
            {stats.corpus_total_standards?.toLocaleString()} standards are ingested in
            total; the system answers only from the departments with full-text coverage,
            because a title-only match cannot be verified. Nothing is deleted — set
            <code> DEMO_STATUS=false</code> to use the whole catalogue.
          </p>
        )}
        <div className="tiles">
          <Tile n={stats.standards} l="Standards ingested" />
          <Tile n={stats.with_full_text} l={`Verifiable against full text (${ftPct}%)`} cls="good" />
          <Tile n={stats.metadata_only} l="Metadata only — flagged" cls="flag" />
          <Tile n={stats.chunks} l="Citable passages" />
          <Tile n={stats.edges_confirmed} l="Confirmed dependencies" cls="good" />
          <Tile n={stats.edges_inferred} l="Inferred — unverified" cls="flag" />
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
        <p className="sub">What the ingested corpus is actually made of.</p>
        <div className="composition">
          <div>
            <h3>By department</h3>
            <BarRows data={stats.by_department} />
          </div>
          <div>
            <h3>By aspect</h3>
            <BarRows data={stats.by_aspect} />
          </div>
          <div>
            <h3>Relationship types</h3>
            <BarRows data={stats.edge_types} hue="var(--cat-2)" />
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
