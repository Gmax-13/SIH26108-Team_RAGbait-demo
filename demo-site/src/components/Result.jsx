import { useState } from 'react'

const pct = (v) => `${Math.round((v ?? 0) * 100)}%`

function CopyButton({ text, label = 'Copy' }) {
  const [hit, setHit] = useState(false)
  return (
    <button className="ghost" onClick={() => {
      navigator.clipboard?.writeText(text).then(() => {
        setHit(true)
        setTimeout(() => setHit(false), 1400)
      }).catch(() => {})
    }}>
      {hit ? 'Copied' : label}
    </button>
  )
}

/** The one number a procurement officer acts on. Shown as a bar rather than a
 *  bare decimal, with the abstention threshold marked, because "0.73" means
 *  nothing without knowing where the cut-off sits. */
function ConfidenceBar({ value, threshold, abstained }) {
  return (
    <div className="conf">
      <div className="conf-head">
        <span className="conf-val">{pct(value)}</span>
        <span className="small muted">
          confidence · abstains below {pct(threshold)}
        </span>
      </div>
      <div className="conf-track">
        <i className={abstained ? 'bad' : 'good'} style={{ width: pct(value) }} />
        <u style={{ left: pct(threshold) }} title={`threshold ${pct(threshold)}`} />
      </div>
    </div>
  )
}

const EDGE_LABEL = {
  normative: 'Normative reference',
  test: 'Test method',
  terminology: 'Terminology',
  safety: 'Safety',
  installation: 'Installation',
  related: 'Related',
}

function Abstained({ r }) {
  return (
    <div className="panel abstain-panel">
      <div className="row split">
        <h2>No confident recommendation</h2>
        <span className="badge abstain">ABSTAINED</span>
      </div>
      <p className="lede">{r.message}</p>

      <ConfidenceBar value={r.confidence} threshold={r.threshold} abstained />

      <h3>Why it stopped</h3>
      <ul className="reasons">
        {(r.reasons || []).map((x, i) => <li key={i}>{x}</li>)}
      </ul>

      {!!r.next_steps?.length && (
        <>
          <h3>What to do instead</h3>
          <ul className="reasons plain">
            {r.next_steps.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </>
      )}

      {!!r.closest_candidates?.length && (
        <>
          <h3>Closest matches, shown but not endorsed</h3>
          <div className="scroll-x">
            <table>
              <thead><tr><th>Standard</th><th>Title</th><th>Similarity</th></tr></thead>
              <tbody>
                {r.closest_candidates.map((c, i) => (
                  <tr key={i}>
                    <td className="mono nowrap">{c.is_number}</td>
                    <td>{c.title}</td>
                    <td className="mono">{(c.similarity ?? 0).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="small muted footnote">
        This is the behaviour the brief called for: an explicit refusal, with the
        reason stated, instead of a plausible-looking IS number that nobody checked.
      </p>
    </div>
  )
}

function Recommended({ r }) {
  const [evidence, setEvidence] = useState(false)
  const primary = r.primary_standards?.[0]
  const cur = primary?.currency
  const schemes = primary?.certification?.schemes || []

  return (
    <>
      <div className="panel answer">
        <div className="row split">
          <h2>Cite this standard</h2>
          <span className="badge ok">RECOMMENDED</span>
        </div>

        {primary && (
          <div className="headline">
            <div className="is-number mono">{primary.is_number}</div>
            <div className="is-title">{primary.title}</div>
            <div className="chips">
              {cur?.status === 'current' && <span className="chip good">Current edition</span>}
              {cur?.withdrawn && <span className="chip bad">Withdrawn</span>}
              {cur?.amendment_count > 0 &&
                <span className="chip warn">{cur.amendment_count} amendment(s)</span>}
              {primary.metadata_only
                ? <span className="chip warn">Metadata only — not verified against full text</span>
                : <span className="chip good">Verified against full text</span>}
              {cur?.text_edition_mismatch &&
                <span className="chip warn">Text is the {cur.full_text_year} edition</span>}
            </div>
          </div>
        )}

        <ConfidenceBar value={r.confidence} threshold={r.threshold} />

        {!!schemes.length && (
          <>
            <h3>Certification</h3>
            <ul className="reasons plain">
              {schemes.map((s, i) => (
                <li key={i}><b>{s.scheme}</b> — {s.note || s.requirement}</li>
              ))}
            </ul>
          </>
        )}

        {!!r.caveats?.length && (
          <div className="caveats">
            {r.caveats.map((c, i) => <p key={i} className="small">{c}</p>)}
          </div>
        )}
      </div>

      {!!r.allied_standards?.length && (
        <div className="panel">
          <h2>Read alongside it</h2>
          <p className="sub">
            Pulled from citations inside the standard's own text, not guessed.
          </p>
          <div className="scroll-x">
            <table>
              <thead>
                <tr><th>Standard</th><th>Title</th><th>Relationship</th><th>Cited at</th></tr>
              </thead>
              <tbody>
                {r.allied_standards.slice(0, 8).map((a, i) => (
                  <tr key={i}>
                    <td className="mono nowrap">
                      {a.is_number}
                      {a.withdrawn && <span className="chip bad tiny">withdrawn</span>}
                    </td>
                    <td>{a.title}</td>
                    <td><span className={`badge cat-${a.edge_type}`}>
                      {EDGE_LABEL[a.edge_type] || a.edge_type}</span></td>
                    <td className="small muted">{a.cited_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {r.tender_clause && (
        <div className="panel">
          <div className="row split">
            <div>
              <h2>Paste-ready tender clause</h2>
              <p className="sub">Every IS number below exists in the corpus and was checked.</p>
            </div>
            <CopyButton text={r.tender_clause} label="Copy clause" />
          </div>
          <blockquote className="clause">{r.tender_clause}</blockquote>
        </div>
      )}

      <div className="panel">
        <div className="row split">
          <div>
            <h2>Evidence</h2>
            <p className="sub">
              Every claim, the passage it rests on, and how well it is supported.
            </p>
          </div>
          <button className="ghost" onClick={() => setEvidence((v) => !v)}>
            {evidence ? 'Hide' : 'Show the receipts'}
          </button>
        </div>

        {evidence && (
          <>
            {(r.claims || []).map((c, i) => (
              <div className="claim" key={i}>
                <p className="claim-text">{c.claim}</p>
                <div className="claim-meta small muted">
                  support {pct(c.support_score)} · {c.citations.length} citation(s)
                </div>
                {c.citations.map((cid) => {
                  const cit = r.citations?.[cid]
                  if (!cit) return null
                  return (
                    <blockquote className="excerpt" key={cid}>
                      <div className="excerpt-head mono small">
                        {cit.is_number} · {cit.section} · similarity {cit.similarity?.toFixed(3)}
                      </div>
                      {cit.excerpt}
                    </blockquote>
                  )
                })}
              </div>
            ))}

            <h3>Critic signals</h3>
            <div className="signals">
              {Object.entries(r.verification?.signals || {}).map(([k, v]) => (
                <div className="sig" key={k}>
                  <span className="sig-k">{k.replace(/_/g, ' ')}</span>
                  <span className="sig-v mono">
                    {typeof v === 'number' ? v.toFixed(3) : String(v)}
                  </span>
                </div>
              ))}
            </div>
            <p className="small muted footnote">
              Two of these are hard gates, not weights: a standard that is not in the
              corpus, or a citation that does not resolve to a real passage, fails the
              answer outright regardless of the rest.
            </p>
          </>
        )}
      </div>
    </>
  )
}

export default function Result({ run }) {
  const r = run.result
  return r.status === 'abstained' ? <Abstained r={r} /> : <Recommended r={r} />
}
