import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/** A first-visit walkthrough for evaluators. It drives the dashboard through
 *  its own DOM — clicking the same sidebar and tab buttons a visitor would —
 *  so the dashboard needs no knowledge of it. A step whose target is not on
 *  screen (the sidebar is off-canvas on phones) shows as a centred card. */

const SEEN_KEY = 'manaksetu-tour-seen'
const PAD = 6

const byText = (sel, text) =>
  [...document.querySelectorAll(sel)].find((el) => el.textContent.trim() === text)
const nav = (label) => byText('.nav-item', label)
const tab = (label) => byText('.card .seg button', label)
const go = (label) => nav(label)?.click()
const goQuery = (t) => { go('New Query'); requestAnimationFrame(() => tab(t)?.click()) }

const STEPS = [
  {
    title: 'Welcome to ManakSetu',
    body: (
      <>
        ManakSetu finds the Indian Standards that govern a product requirement. It shows
        the evidence for every answer, and <b>refuses to answer when it isn't sure</b>.
        <br /><br />This tour takes about a minute.
      </>
    ),
  },
  {
    target: () => document.querySelector('.nav'),
    before: () => goQuery('Text Input'),
    title: 'Find your way around',
    body: 'Every screen is in this sidebar. The next steps show the ones worth seeing first.',
    place: 'right',
  },
  {
    target: () => document.querySelector('.example-row'),
    before: () => goQuery('Text Input'),
    title: 'Start with an example',
    body: (
      <>
        Click any example to run it. You'll see the six pipeline stages run, then the
        recommended standard with its confidence, citations and dependency graph.
        <br /><br />Try <b>⊘ good quality durable product</b> to see the system refuse a vague requirement.
      </>
    ),
  },
  {
    target: () => document.querySelector('.seg.lang'),
    before: () => goQuery('Text Input'),
    title: 'Hindi, Marathi and Tamil',
    body: 'Switch the language to see the same examples written in Indian languages.',
  },
  {
    target: () => tab('Tender Document'),
    before: () => goQuery('Tender Document'),
    title: 'Check a whole tender',
    body: (
      <>
        Click <b>Load sample tender</b>, then <b>Generate Compliance Report</b>. Every requirement
        is matched to a standard, and the report catches the tender citing
        <b> IS 3043:1987</b> when the 2018 edition is current. The report opens under <b>Reports</b>, with a compliance and testing checklist to tick off.
      </>
    ),
  },
  {
    target: () => nav('Standards Graph'),
    before: () => go('Standards Graph'),
    title: 'Standards Graph',
    body: 'Search any standard to see its catalogue record, currency and certification, and the standards it cites. Each link comes with the sentence that proves it.',
    place: 'right',
  },
  {
    target: () => nav('Dashboard'),
    before: () => go('Dashboard'),
    title: 'Dashboard',
    body: 'What is in the corpus and how it was built. Every ingestion step is logged, so the dataset can be inspected.',
    place: 'right',
  },
  {
    target: () => nav('Docs'),
    before: () => go('Docs'),
    title: 'Docs',
    body: 'The problem statement, our solution, what we do differently, KPIs and limitations, all in one place.',
    place: 'right',
  },
  {
    before: () => goQuery('Text Input'),
    title: "You're ready",
    body: (
      <>
        Start with an example query. You can replay this tour at any time from the
        <b> ?</b> button in the bottom-right corner.
      </>
    ),
    last: true,
  },
]

function visible(r) {
  return r && r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 &&
    r.left < window.innerWidth && r.top < window.innerHeight
}

/** Place the card beside the target, keeping it fully on screen. */
function placeCard(r, card, place) {
  const vw = window.innerWidth, vh = window.innerHeight, gap = 14
  const w = card.width, h = card.height
  let top, left
  if (place === 'right' && r.right + gap + w <= vw - 16) {
    left = r.right + gap
    top = r.top + r.height / 2 - h / 2
  } else if (r.bottom + gap + h <= vh - 16) {
    top = r.bottom + gap
    left = r.left
  } else {
    top = r.top - gap - h
    left = r.left
  }
  return {
    top: Math.max(16, Math.min(top, vh - h - 16)),
    left: Math.max(16, Math.min(left, vw - w - 16)),
  }
}

export default function Tour() {
  const [step, setStep] = useState(-1)
  const [rect, setRect] = useState(null)
  const [pos, setPos] = useState(null)
  const cardRef = useRef(null)
  const nextRef = useRef(null)

  const open = step >= 0
  const s = open ? STEPS[step] : null

  // First visit only. Storage can throw (private mode, blocked site data), in
  // which case the tour simply shows again next time.
  useEffect(() => {
    let seen = false
    try { seen = localStorage.getItem(SEEN_KEY) === '1' } catch { /* ignore */ }
    if (seen) return
    const t = setTimeout(() => setStep(0), 700)
    return () => clearTimeout(t)
  }, [])

  const close = useCallback(() => {
    setStep(-1)
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ }
  }, [])

  const measure = useCallback(() => {
    const el = s?.target?.()
    const r = el?.getBoundingClientRect()
    setRect(visible(r) ? r : null)
  }, [s])

  // Run the step's navigation, let the screen render, then find the target.
  useEffect(() => {
    if (!open) return
    s.before?.()
    setRect(null); setPos(null)
    const t = setTimeout(() => {
      const el = s.target?.()
      const r = el?.getBoundingClientRect()
      if (el && r && (r.top < 70 || r.bottom > window.innerHeight - 20) && r.right > 0) {
        el.scrollIntoView({ block: 'center' })
      }
      measure()
    }, 120)
    return () => clearTimeout(t)
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, measure])

  useLayoutEffect(() => {
    if (!open || !cardRef.current) return
    const card = cardRef.current.getBoundingClientRect()
    setPos(rect ? placeCard(rect, card, s.place) : null)
  }, [open, rect, s])

  useEffect(() => { if (open) nextRef.current?.focus() }, [step, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight' && step < STEPS.length - 1) setStep(step + 1)
      else if (e.key === 'ArrowLeft' && step > 0) setStep(step - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, step, close])

  if (!open) {
    return (
      <button className="tour-help" onClick={() => setStep(0)}
              aria-label="Take the tour" title="Take the tour">?</button>
    )
  }

  const next = () => (s.last ? close() : setStep(step + 1))

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div className="tour-spot" style={{
          top: rect.top - PAD, left: rect.left - PAD,
          width: rect.width + PAD * 2, height: rect.height + PAD * 2,
        }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div ref={cardRef} className={`tour-card ${pos ? '' : 'centred'}`}
           style={pos ? { top: pos.top, left: pos.left } : undefined}>
        <div className="tour-count">{step + 1} of {STEPS.length}</div>
        <h2 id="tour-title">{s.title}</h2>
        <div className="tour-body">{s.body}</div>
        <div className="tour-actions">
          {!s.last && <button className="tour-skip" onClick={close}>Skip tour</button>}
          <span className="spacer" />
          {step > 0 && <button className="ghost" onClick={() => setStep(step - 1)}>Back</button>}
          <button ref={nextRef} className="primary" onClick={next}>
            {step === 0 ? 'Start tour' : s.last ? 'Get started' : 'Next'}
          </button>
        </div>
        <div className="tour-dots" aria-hidden="true">
          {STEPS.map((_, i) => <i key={i} className={i === step ? 'on' : ''} />)}
        </div>
      </div>
    </div>
  )
}
