import { useState } from 'react'
import { CurrencyBadge, WithdrawnBadge } from './Common'

const GROUPS = [
  ['normative_reference', 'Normative references', 'Binding — cited as requirements by the primary standard.'],
  ['test_method', 'Test methods', 'How conformity is proven. Omit these and acceptance criteria are ambiguous.'],
  ['safety', 'Safety standards', 'Safety requirements the primary standard relies on.'],
  ['terminology', 'Terminology', 'Defines the terms your specification uses.'],
  ['related', 'Related standards', 'Referenced; relationship unclassified.'],
]

function CopyButton({ text, label = 'Copy for the tender' }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // clipboard API is unavailable outside a secure context; fall back
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button className="primary" onClick={copy}>
      {copied ? '✓ Copied' : label}
    </button>
  )
}

/** The answer as a procurement officer needs it: what to cite, what else to
 *  reference, whether certification applies, and text they can paste. Evidence
 *  is one click away rather than in the way. */
export default function OfficerView({ r, onOpen, onShowEvidence }) {
  const primary = (r.primary_standards || [])[0]
  if (!primary) return null

  const allied = r.allied_standards || []
  const cert = (primary.certification?.schemes || []).filter((s) => s.mandatory)
  const cur = primary.currency || {}
  const flags = cur.flags || []

  const grouped = GROUPS
    .map(([key, title, note]) => [key, title, note, allied.filter((a) => a.edge_type === key)])
    .filter(([, , , items]) => items.length > 0)

  return (
    <>
      <div className="answer">
        <div className="answer-head">
          <span className="answer-eyebrow">Cite this standard</span>
          <div className="answer-no">{primary.is_number}</div>
          <div className="answer-title">{primary.title}</div>
          <div className="row" style={{ marginTop: 12 }}>
            <WithdrawnBadge on={cur.withdrawn} />
            <CurrencyBadge currency={cur} />
            {cert.length > 0 && (
              <span className="badge warn">
                <b aria-hidden="true">!</b>
                {cert.map((c) => c.scheme.replace(/_/g, ' ')).join(', ')} certification required
              </span>
            )}
          </div>
        </div>

        {!!flags.length && (
          <ul className="reasons small answer-flags">
            {flags.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        )}
      </div>

      {!!grouped.length && (
        <div className="panel">
          <h2>Also reference these in your specification</h2>
          <p className="sub">
            {primary.is_number} depends on the standards below. Tenders that omit them are a
            common source of ambiguity — each row was read out of the standard&rsquo;s own text.
          </p>
          {grouped.map(([key, title, note, items]) => (
            <div className="allied-group" key={key}>
              <h3>{title}</h3>
              <p className="small muted allied-note">{note}</p>
              <div className="allied-list">
                {items.map((a, i) => (
                  <div className="allied-item" key={i}>
                    {a.in_corpus
                      ? <button className="linkish mono" onClick={() => onOpen?.(a.is_number)}>
                          {a.is_number}
                        </button>
                      : <span className="mono">{a.is_number}</span>}
                    <span className="allied-title small">
                      {a.title || <span className="muted">outside the ingested departments</span>}
                    </span>
                    {a.withdrawn && <span className="badge danger"><b aria-hidden="true">⊘</b>Withdrawn</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {r.tender_clause && (
        <div className="panel clause">
          <h2>Ready for your tender</h2>
          <p className="sub">Paste this into the technical specification and edit as needed.</p>
          <blockquote className="clause-text">{r.tender_clause}</blockquote>
          <div className="row" style={{ marginTop: 14 }}>
            <CopyButton text={r.tender_clause} />
            <button className="ghost" onClick={onShowEvidence}>
              Show the evidence behind this
            </button>
          </div>
        </div>
      )}
    </>
  )
}
