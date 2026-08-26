import { CertBadges, Citation, CurrencyBadge, Meter, MetaOnlyBadge, WithdrawnBadge, confColor } from './Common'
import GraphView from './GraphView'

/** The abstention response. Deliberately prominent — it is the key behaviour,
 *  not an error state to be tucked away. */
function Abstention({ r }) {
  return (
    <>
      <div className="statusbar abstain">
        <span className="icon" aria-hidden="true">⊘</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="big">Abstained — not confident enough to recommend a standard</div>
          <div className="small muted">
            No IS number is returned. Guessing one here would be worse than answering nothing.
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="confval" style={{ color: confColor(r.confidence) }}>
            {(r.confidence ?? 0).toFixed(2)}
          </div>
          <div className="small muted">threshold {r.threshold}</div>
        </div>
        <Meter value={r.confidence} />
      </div>

      <div className="panel">
        <h2>Why it abstained</h2>
        <ul className="reasons">
          {(r.reasons || []).map((x, i) => <li key={i}>{x}</li>)}
        </ul>

        {!!(r.closest_candidates || []).length && (
          <>
            <h3>Closest candidates (not recommended)</h3>
            <div className="scroll-x">
              <table>
                <thead>
                  <tr><th>Standard</th><th>Title</th><th>Similarity</th><th>Why not certain</th></tr>
                </thead>
                <tbody>
                  {r.closest_candidates.map((c, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                        {c.is_number} <WithdrawnBadge on={c.is_active === false} />
                      </td>
                      <td>{c.title}</td>
                      <td className="mono">{c.similarity}</td>
                      <td className="small muted">{c.why_not_certain}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h3>How to get a confident answer</h3>
        <ul className="reasons small">
          {(r.next_steps || []).map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      </div>
      <Signals v={r.verification} />
    </>
  )
}

function Signals({ v }) {
  if (!v?.signals) return null
  const s = v.signals
  const rows = [
    ['Grounding rate', s.grounding_rate, 'Share of claims actually supported by the passages they cite'],
    ['Retrieval strength', s.retrieval_strength, 'How closely the best passage matches the query'],
    ['Discrimination', s.discrimination, 'Topical coherence of the candidate set — scattered results mean a vague query'],
    ['Query relevance', s.query_relevance, 'Whether the recommended standard addresses what was actually asked'],
    ['Verification depth', s.verification_depth, 'Full source text available (1.0) vs catalogue metadata only'],
  ]
  return (
    <div className="panel">
      <h2>Verification signals</h2>
      <div className="scroll-x">
        <table>
          <thead><tr><th>Signal</th><th style={{ width: 160 }}>Value</th><th>Meaning</th></tr></thead>
          <tbody>
            {rows.map(([k, val, why]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    <Meter value={val} />
                    <span className="mono">{Number(val ?? 0).toFixed(2)}</span>
                  </div>
                </td>
                <td className="small muted">{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>
        Confidence combines these multiplicatively, so a near-zero signal collapses the
        score — strong retrieval cannot rescue an ungrounded claim, and vice versa.
      </p>
      {!!(v.fabricated_standards || []).length && (
        <p className="err" style={{ marginTop: 12 }}>
          Blocked fabricated standard(s): <b className="mono">{v.fabricated_standards.join(', ')}</b> —
          named by the model but absent from the ingested corpus.
        </p>
      )}
      <details style={{ marginTop: 10 }}>
        <summary>Raw verification report</summary>
        <pre className="raw">{JSON.stringify(v, null, 2)}</pre>
      </details>
    </div>
  )
}

function GraphPanel({ graph, onOpen }) {
  const n = graph?.nodes?.length || 0
  const e = graph?.edges?.length || 0
  const confirmed = (graph?.edges || []).filter((x) => x.confidence === 'confirmed').length
  return (
    <div className="panel">
      <h2>Dependency graph</h2>
      <div className="row small muted" style={{ marginBottom: 10 }}>
        <span>{n} standards · {e} relationships</span>
        <span className="badge ok"><b aria-hidden="true">✓</b>{confirmed} confirmed from source text</span>
        {e - confirmed > 0 && (
          <span className="badge warn"><b aria-hidden="true">!</b>{e - confirmed} inferred — unverified</span>
        )}
      </div>
      <GraphView graph={graph} onNodeClick={onOpen} />
    </div>
  )
}

export default function ResultView({ result, onOpen }) {
  const r = result
  if (!r) return null
  if (r.status === 'abstained') return <Abstention r={r} />

  const cites = Object.values(r.citations || {})
  return (
    <>
      <div className="statusbar ok">
        <span className="icon" aria-hidden="true">✓</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="big">Verified against source text</div>
          <div className="small muted">
            Every claim below cites a passage that the critic layer checked.
          </div>
        </div>
        {r.synthesis_method === 'rule_based' && (
          <span className="badge warn"
            title={r.llm_error
              ? `The language model was unavailable, so this used rule-based synthesis: ${r.llm_error}`
              : 'No LLM configured — synthesis came from catalogue titles plus semantic retrieval, then went through the same verification.'}>
            <b aria-hidden="true">!</b>
            {r.llm_error ? 'LLM unavailable — rule-based' : 'rule-based synthesis'}
          </span>
        )}
        <div style={{ textAlign: 'right' }}>
          <div className="confval" style={{ color: confColor(r.confidence) }}>
            {r.confidence?.toFixed(2)}
          </div>
          <div className="small muted">confidence</div>
        </div>
        <Meter value={r.confidence} />
      </div>

      <div className="panel">
        <h2>Primary standard{r.primary_standards?.length > 1 ? 's' : ''}</h2>
        {(r.primary_standards || []).map((s, i) => (
          <div className="std" key={i}>
            <div className="row">
              <span className="no">{s.is_number}</span>
              <CurrencyBadge currency={s.currency} />
              <MetaOnlyBadge on={s.metadata_only} />
            </div>
            <div className="title">{s.title}</div>
            {s.role && <div className="small muted" style={{ marginTop: 5 }}>{s.role}</div>}
            <div className="row" style={{ marginTop: 9 }}>
              <CertBadges certification={s.certification} />
            </div>
            {!!(s.currency?.flags || []).length && (
              <ul className="reasons small" style={{ color: 'var(--warn)' }}>
                {s.currency.flags.map((f, k) => <li key={k}>{f}</li>)}
              </ul>
            )}
          </div>
        ))}

        {!!(r.supporting_standards || []).length && (
          <>
            <h3>Supporting standards</h3>
            {r.supporting_standards.map((s, i) => (
              <div className="row" key={i} style={{ marginBottom: 6 }}>
                <span className="mono" style={{ color: 'var(--accent)' }}>{s.is_number}</span>
                <span className="small muted">{s.role}</span>
              </div>
            ))}
          </>
        )}

        {r.summary && (<><h3>Summary</h3><p style={{ margin: 0 }}>{r.summary}</p></>)}

        {!!(r.caveats || []).length && (
          <>
            <h3>Caveats</h3>
            <ul className="reasons small muted">
              {r.caveats.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </>
        )}
      </div>

      <div className="panel">
        <h2>Claims and their evidence</h2>
        {(r.claims || []).map((c, i) => (
          <div className="claim" key={i}>
            <div className="row" style={{ marginBottom: 6 }}>
              <span
                className={`badge ${c.support_score >= 0.9 ? 'ok' : c.support_score >= 0.5 ? 'warn' : 'danger'}`}
              >
                <b aria-hidden="true">{c.support_score >= 0.9 ? '✓' : c.support_score >= 0.5 ? '~' : '×'}</b>
                {c.llm_verdict || (c.support_score >= 0.5 ? 'supported' : 'weak')} · {c.support_score}
              </span>
              {c.uncited && <span className="badge danger"><b aria-hidden="true">×</b>no citation</span>}
            </div>
            <div>{c.claim}</div>
            {c.llm_reason && <div className="small muted" style={{ marginTop: 4 }}>{c.llm_reason}</div>}
            <div className="small muted mono" style={{ marginTop: 5 }}>
              cites: {(c.citations || []).join(', ') || '—'}
            </div>
          </div>
        ))}
      </div>

      {!!cites.length && (
        <div className="panel">
          <h2>Citation trail</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            Verbatim passages from the ingested standards that support the claims above.
          </p>
          {cites.map((c, i) => <Citation key={i} c={c} />)}
        </div>
      )}

      {r.dependency_graph && <GraphPanel graph={r.dependency_graph} onOpen={onOpen} />}
      <Signals v={r.verification} />
    </>
  )
}
