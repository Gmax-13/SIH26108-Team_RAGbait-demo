import { useCallback, useEffect, useRef, useState } from 'react'

/** Replay a recorded pipeline run.
 *
 *  The events in src/fixtures/runs.json are the real ones the server emitted,
 *  carrying the real `elapsed` seconds. Played back at true speed the whole
 *  pipeline finishes in well under a second, which is accurate but shows the
 *  viewer nothing — the map would flash once and stop. So the recorded timeline
 *  is stretched to a watchable length while keeping every stage's share of the
 *  total intact: the relative durations are real, the wall-clock is slowed.
 *
 *  The true elapsed time is reported alongside, so the slowdown is stated
 *  rather than passed off as the system's actual speed.
 */
const MIN_TOTAL_MS = 5600

export function useReplay(run) {
  const [stages, setStages] = useState({})
  const [done, setDone] = useState(false)
  const [playing, setPlaying] = useState(false)
  const timers = useRef([])

  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  const reset = useCallback(() => {
    clear()
    setStages({})
    setDone(false)
    setPlaying(false)
  }, [clear])

  const play = useCallback(() => {
    if (!run) return
    clear()
    setStages({})
    setDone(false)
    setPlaying(true)

    const events = run.events
    const realTotal = events.length ? events[events.length - 1].elapsed : 0
    // Stretch, never compress: a run that genuinely took longer keeps its pace.
    const scale = realTotal > 0 ? Math.max(1, MIN_TOTAL_MS / (realTotal * 1000)) : 1

    events.forEach((ev) => {
      timers.current.push(setTimeout(() => {
        setStages((s) => ({
          ...s,
          [ev.stage]: { status: ev.status, detail: ev.detail, elapsed: ev.elapsed },
        }))
      }, ev.elapsed * 1000 * scale))
    })

    const endAt = realTotal * 1000 * scale + 260
    timers.current.push(setTimeout(() => {
      setDone(true)
      setPlaying(false)
    }, endAt))
  }, [run, clear])

  useEffect(() => clear, [clear])

  const realElapsed = run?.result?.elapsed_sec
    ?? (run?.events?.length ? run.events[run.events.length - 1].elapsed : 0)

  return { stages, done, playing, play, reset, realElapsed }
}
