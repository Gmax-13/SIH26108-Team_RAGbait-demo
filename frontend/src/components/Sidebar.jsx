import { CountUp } from '../anim'

/** Icons are inline 20x20 stroke paths rather than an icon font: one less
 *  network dependency, and they inherit currentColor so the active/idle states
 *  need no separate assets. */
const ICON = {
  query:    'M4 5h12M4 10h12M4 15h7 M15.5 13.5l3 3',
  dashboard:'M3 3h6v6H3z M11 3h6v4h-6z M11 9h6v8h-6z M3 11h6v6H3z',
  graph:    'M5 5.5a2 2 0 1 0 0-.1 M15 5.5a2 2 0 1 0 0-.1 M10 15a2 2 0 1 0 0-.1 M6.6 6.9 8.8 13 M13.4 6.9 11.2 13 M7 5.5h6',
  reports:  'M5 2h7l3 3v13H5z M12 2v3h3 M7.5 10h5 M7.5 13h5 M7.5 7h3',
  settings: 'M10 7.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6 M10 1.5v2.2 M10 16.3v2.2 M3.9 3.9l1.6 1.6 M14.5 14.5l1.6 1.6 M1.5 10h2.2 M16.3 10h2.2 M3.9 16.1l1.6-1.6 M14.5 5.5l1.6-1.6',
}

export const NAV = [
  ['query', 'New Query', 'query'],
  ['dashboard', 'Dashboard', 'dashboard'],
  ['graph', 'Standards Graph', 'graph'],
  ['reports', 'Reports', 'reports'],
  ['settings', 'Settings', 'settings'],
]

function Icon({ name }) {
  return (
    <svg className="nav-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d={ICON[name]} />
    </svg>
  )
}

export default function Sidebar({ screen, setScreen, health, open, onClose }) {
  return (
    <>
      <div className={`scrim ${open ? 'on' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 18V7l8-4 8 4v11 M4 12h16 M12 3v15" /></svg>
          </div>
          <div>
            <div className="brand-name">ManakSetu</div>
            <div className="brand-sub">Indian Standards Engine</div>
          </div>
        </div>

        <nav className="nav">
          {NAV.map(([key, label, icon]) => (
            <button key={key}
                    className={`nav-item ${screen === key ? 'active' : ''}`}
                    onClick={() => { setScreen(key); onClose?.() }}>
              <Icon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          {health === false ? (
            <div className="sb-alert">API unreachable</div>
          ) : health ? (
            <>
              <div className="sb-stat">
                <b><CountUp value={health.standards} /></b>
                <span>standards in scope</span>
              </div>
              <div className="sb-stat">
                <b><CountUp value={health.with_full_text} /></b>
                <span>with full text</span>
              </div>
              {health.scope?.scoped && (
                <div className="sb-scope" title={health.scope.note}>
                  {health.scope.departments.join(' · ')} scope
                </div>
              )}
              <div className={`sb-llm ${health.llm_configured ? 'ok' : 'off'}`}>
                <i />{health.llm_configured ? 'Model connected' : 'No model key'}
              </div>
            </>
          ) : (
            <div className="sb-stat"><span>Connecting…</span></div>
          )}
          <div className="sb-org">
            Ministry of Consumer Affairs,<br />Food &amp; Public Distribution · BIS
          </div>
        </div>
      </aside>
    </>
  )
}
