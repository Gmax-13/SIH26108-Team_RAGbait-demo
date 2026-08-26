export function confColor(c) {
  if (c === null || c === undefined) return 'var(--muted)'
  if (c >= 0.75) return 'var(--ok)'
  if (c >= 0.55) return 'var(--warn)'
  return 'var(--abstain)'
}

export function Meter({ value }) {
  const v = Math.max(0, Math.min(1, value || 0))
  return (
    <span className="meter" title={`${(v * 100).toFixed(0)}%`}>
      <i style={{ width: `${v * 100}%`, background: confColor(value) }} />
    </span>
  )
}

export function CurrencyBadge({ currency }) {
  if (!currency) return null
  const s = currency.status
  const map = {
    current: ['ok', 'Current edition'],
    superseded: ['danger', `Superseded → ${currency.latest_known_edition || 'newer edition'}`],
    withdrawn: ['danger', 'Withdrawn'],
    unknown_year: ['warn', 'Year unknown'],
    unknown: ['muted', 'Not in corpus'],
  }
  const [cls, label] = map[s] || ['muted', s]
  return <span className={`badge ${cls}`}>{label}</span>
}

export function CertBadges({ certification }) {
  const schemes = certification?.schemes || []
  if (!schemes.length) return <span className="badge muted">No certification rule matched</span>
  return (
    <>
      {schemes.map((s, i) => (
        <span
          key={i}
          className={`badge ${s.mandatory ? 'warn' : 'muted'}`}
          title={`${s.match} — ${s.notes || ''}`}
        >
          {s.scheme}
          {s.mandatory ? ' (mandatory)' : ''}
          {s.confidence === 'low' ? ' ?' : ''}
        </span>
      ))}
    </>
  )
}

export function WithdrawnBadge({ on }) {
  if (!on) return null
  return (
    <span className="badge danger" title="This standard is marked withdrawn in the BIS catalogue and should not be specified for new work.">
      WITHDRAWN
    </span>
  )
}

export function MetaOnlyBadge({ on }) {
  if (!on) return null
  return (
    <span className="badge warn" title="No full text was ingested for this standard, so its content could not be verified against source text.">
      metadata only — unverified
    </span>
  )
}

export function Citation({ c }) {
  return (
    <div className="cite">
      <div className="head">
        <span className="mono" style={{ color: 'var(--accent)' }}>{c.is_number}</span>
        {c.section && <span className="small muted">{c.section}</span>}
        {c.similarity !== undefined && (
          <span className="badge muted">sim {c.similarity}</span>
        )}
        <span className="mono small muted">{c.chunk_id}</span>
      </div>
      <div className="excerpt">{c.excerpt}</div>
    </div>
  )
}
