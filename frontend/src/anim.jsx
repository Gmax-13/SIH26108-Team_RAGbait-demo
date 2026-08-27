import { useEffect, useRef, useState } from 'react'

/** True when the viewer has asked the OS to reduce motion. Every animation in
 *  this app checks it — motion is decoration here, never information. */
export function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Count a number up to its target.
 *
 *  Used for the corpus figures, where the point is to make the size of the
 *  dataset register rather than slide past as static text. Eases out, so it
 *  lands rather than stopping abruptly.
 */
export function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0))
  const frame = useRef(0)
  const start = useRef(0)

  useEffect(() => {
    const end = Number(target) || 0
    if (prefersReducedMotion()) { setValue(end); return }
    if (end === 0) { setValue(0); return }

    start.current = 0
    const step = (ts) => {
      if (!start.current) start.current = ts
      const t = Math.min(1, (ts - start.current) / duration)
      const eased = 1 - Math.pow(1 - t, 3)          // ease-out cubic
      setValue(Math.round(end * eased))
      if (t < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [target, duration])

  return value
}

/** Formats a counting number with thousands separators. */
export function CountUp({ value, duration }) {
  const n = useCountUp(value, duration)
  return <>{n.toLocaleString()}</>
}
