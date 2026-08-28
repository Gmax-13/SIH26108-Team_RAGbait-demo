import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SystemMap from './components/SystemMap'
import Result from './components/Result'
import { useReplay } from './replay'
import runs from './fixtures/runs.json'
import corpus from './fixtures/corpus.json'

const LABEL = {
  earthing: 'Substation earthing',
  conduit: 'Non-metallic conduit',
  led: 'LED street lighting',
  switchgear: 'LV switchgear',
  vague: 'A vague requirement',
}

const n = (v) => (v ?? 0).toLocaleString('en-IN')

function Stat({ value, label, note }) {
  return (
    <div className="stat">
      <div className="stat-n">{value}</div>
      <div className="stat-l">{label}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  )
}

export default function App() {
  const [slug, setSlug] = useState(runs[0].slug)
  const run = useMemo(() => runs.find((r) => r.slug === slug), [slug])
  const { stages, done, playing, play, reset, realElapsed } = useReplay(run)
  const mapRef = useRef(null)

  // Switching query resets the map; the viewer presses Run to start it.
  useEffect(() => { reset() }, [slug, reset])

  // The map is the whole point of pressing Run, and on a laptop it sits below
  // the fold — so bring it into view rather than animating where nobody looks.
  const runAndScroll = useCallback(() => {
    play()
    // Deferred a tick: scrolling in the same handler as the state update that
    // starts the replay lands before React commits, and the scroll is dropped.
    setTimeout(() => {
      mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }, [play])

  const c = corpus.scoped
  const ruleBased = run.result.synthesis_method === 'rule_based'
    || run.result.llm_error

  return (
    <div className="wrap">
      <header className="hero">
        <div className="tag">Smart India Hackathon 2026 · SIH26108 · Team RAGbait</div>
        <h1>An engine that names the right Indian Standard — or says it cannot.</h1>
        <p className="hero-sub">
          Procurement officers cite IS numbers from memory and from PDFs that may be
          three revisions out of date. This system matches a requirement written in
          plain English to real BIS standards, pulls in the standards they normatively
          reference, flags withdrawn editions and certification schemes, and shows the
          exact passage behind every claim. When the evidence is thin it abstains
          instead of inventing a number.
        </p>
        <div className="stats">
          <Stat value={n(c.standards)} label="Standards ingested"
                note={`${n(corpus.whole_catalogue.standards)} in the full catalogue`} />
          <Stat value={n(c.with_full_text)} label="With full text"
                note="verifiable against real document text" />
          <Stat value={n(c.chunks)} label="Citable passages" />
          <Stat value={n(c.edges_confirmed)} label="Confirmed dependencies"
                note="read out of the standards' own citations" />
        </div>
      </header>

      <section className="panel runner">
        <div className="row split">
          <div>
            <h2>Run a query</h2>
            <p className="sub">
              Each is a recorded run of the real pipeline — real timings, real
              citations, real confidence. Watch the architecture below light up.
            </p>
          </div>
          <div className="row">
            <button className="primary" onClick={runAndScroll} disabled={playing}>
              {playing ? 'Running…' : done ? 'Run again' : 'Run'}
            </button>
          </div>
        </div>

        <div className="chips picker">
          {runs.map((r) => (
            <button key={r.slug}
                    className={`chip-btn ${r.slug === slug ? 'on' : ''} ${r.result.status === 'abstained' ? 'ab' : ''}`}
                    onClick={() => setSlug(r.slug)}>
              {LABEL[r.slug] || r.slug}
              {r.result.status === 'abstained' && <i>abstains</i>}
            </button>
          ))}
        </div>

        <blockquote className="query">{run.query}</blockquote>

        {done && (
          <p className="small muted timing">
            Real server time for this run: <b>{realElapsed.toFixed(2)}s</b>. The map
            is replayed slower than that so the stages are readable — the relative
            durations are the recorded ones.
          </p>
        )}
      </section>

      <div ref={mapRef} className="map-anchor">
        <SystemMap stages={stages} result={done ? run.result : null} done={done} />
      </div>

      {done && (
        <div className="results">
          <Result run={run} />
        </div>
      )}

      <footer className="foot">
        {ruleBased && (
          <p className="notice">
            <b>Note on this capture.</b> When these runs were recorded the hosted
            language model was unreachable (HTTP 403 from the provider), so synthesis
            fell back to the rule-based path and the critic scored that weaker output.
            That fallback is deliberate: a model outage is not the same thing as
            insufficient evidence, so the system degrades and says so rather than
            reporting an outage as an abstention. Re-running
            <code> python scripts/capture_demo_fixtures.py </code>
            with the model reachable regenerates these fixtures.
          </p>
        )}
        <p className="small muted">
          Static build — no backend. Everything on this page was produced by the real
          pipeline and recorded to JSON on {corpus.captured_at}. Corpus scoped to
          {' '}{corpus.scoped_departments.join(' and ')} for the demo; the ingested
          catalogue covers {n(corpus.whole_catalogue.standards)} standards across
          {' '}{corpus.whole_catalogue.departments} departments.
        </p>
      </footer>
    </div>
  )
}
