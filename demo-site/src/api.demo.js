/** Offline stand-in for frontend/src/api.js — same exports, same shapes.
 *
 *  Every answer comes from public/fixtures, written by
 *  scripts/capture_demo_fixtures.py from the real API handlers and pipeline.
 *  Nothing is generated here: a request the recording does not cover is refused
 *  with a message saying so, rather than answered with something invented.
 */

const BASE = import.meta.env.BASE_URL
const cache = new Map()

function load(name) {
  if (!cache.has(name)) {
    const p = fetch(`${BASE}fixtures/${name}`).then((r) => {
      if (!r.ok) throw new Error(`Offline demo data is missing (${name}).`)
      return r.json()
    })
    p.catch(() => cache.delete(name))
    cache.set(name, p)
  }
  return cache.get(name)
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

export const OFFLINE_QUERY =
  'This offline demo replays recorded examples only — pick one of the examples below.'
export const OFFLINE_BATCH =
  'This offline demo replays the sample tender only — click “Load sample tender”, or upload sample_tender.pdf.'

export const getStats = () => load('stats.json')

export async function getLogs(params = {}) {
  const { runs, events } = await load('logs.json')
  const limit = Math.min(Number(params.limit ?? 200), 2000)
  const rows = events
    .filter((e) => !params.phase || e.phase === params.phase)
    .filter((e) => !params.status || e.status === params.status)
    .slice(0, limit)
  return { runs, events: rows }
}

/** Must match shard_of() in scripts/capture_demo_fixtures.py. */
function shardOf(isNumber) {
  let h = 0
  for (const ch of isNumber) h = (h * 31 + ch.codePointAt(0)) % 4294967296
  return h % 64
}

export async function getStandard(n) {
  const shard = await load(`standards/shard-${String(shardOf(n)).padStart(2, '0')}.json`)
  if (!shard[n]) throw new Error(`${n} is not in the offline demo's recorded corpus.`)
  return shard[n]
}

export async function getGraph() {
  throw new Error('Per-standard graphs are not recorded in the offline demo.')
}

export const getFullGraph = () => load('graph.json')

const IS_PREFIX = /^(?:IS\s*)?(\d[\d.]*)/i

/** Type-ahead over the recorded graph, ordered the way the API orders it:
 *  a numeric fragment matches as a number prefix (IS 64 → IS 645, IS 649), sorted
 *  numerically; a word matches titles, with titles that start with it first. */
export async function searchStandards(q, { limit = 12 } = {}) {
  const query = norm(q)
  if (query.length < 2) return { query, results: [], out_of_scope: 0 }
  const { nodes } = await load('graph.json')
  const m = query.match(IS_PREFIX)
  const ql = query.toLowerCase()

  let rows
  let key
  if (m) {
    const prefix = `is ${m[1]}`
    rows = nodes.filter((n) =>
      (n.is_number || '').toLowerCase().startsWith(prefix) ||
      (n.is_base || '').toLowerCase().startsWith(prefix))
    key = (n) => {
      const head = (n.is_base || '').match(IS_PREFIX)?.[1] || ''
      return [...head.split('.').filter((x) => /^\d+$/.test(x)).map(Number), Infinity, -(n.year || 0)]
    }
  } else {
    rows = nodes.filter((n) => (n.title || '').toLowerCase().includes(ql))
    key = (n) => {
      const t = (n.title || '').toLowerCase()
      return [t.startsWith(ql) ? 0 : 1, t.length, -(n.year || 0)]
    }
  }
  const cmp = (a, b) => {
    const ka = key(a), kb = key(b)
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      const x = ka[i] ?? -Infinity, y = kb[i] ?? -Infinity
      if (x !== y) return x < y ? -1 : 1
    }
    return 0
  }
  rows.sort(cmp)
  return { query, results: rows.slice(0, limit), out_of_scope: 0, total_matches: rows.length, scope: 'demo' }
}

async function findRun(query) {
  const runs = await load('runs.json')
  const want = norm(query).toLowerCase()
  return runs.find((r) => norm(r.query).toLowerCase() === want)
}

// The recorded runs took from under a second to two minutes (the language
// model dominates). Replaying them in a fixed window keeps the stage order and
// each stage's share of the time; the true seconds still show in the UI.
const REPLAY_MS = 6000
const MIN_STEP_MS = 160

export async function streamRecommend(body, onEvent) {
  const run = await findRun(body?.query)
  if (!run) throw new Error(OFFLINE_QUERY)
  const events = run.events || []
  const total = events.length ? events[events.length - 1].elapsed || 0 : 0

  const times = []
  events.forEach((ev, i) => {
    const share = total > 0 ? (ev.elapsed / total) * REPLAY_MS : (i / Math.max(1, events.length - 1)) * REPLAY_MS
    times.push(Math.max(share, i ? times[i - 1] + MIN_STEP_MS : 0))
  })

  let now = 0
  for (let i = 0; i < events.length; i++) {
    await wait(times[i] - now)
    now = times[i]
    onEvent?.(events[i])
  }
  await wait(300)
  return run.result
}

export async function postRecommend(body) {
  const run = await findRun(body?.query)
  if (!run) throw new Error(OFFLINE_QUERY)
  await wait(1200)
  return run.result
}

let sampleText = null
async function isSampleTender(text) {
  sampleText ??= fetch(`${BASE}sample_tender.txt`).then((r) => r.text()).then(norm)
  return norm(text) === (await sampleText)
}

const capFile = (cap) => {
  const c = Number(cap)
  return `batch-cap-${[3, 5, 10].includes(c) ? c : 0}.json`
}

export async function postBatch(body) {
  if (!(await isSampleTender(body?.text))) throw new Error(OFFLINE_BATCH)
  await wait(3200)
  return load(capFile(body?.max_requirements))
}

export async function postBatchUpload(file, maxRequirements = 0) {
  if (!/^sample_tender\.(pdf|txt)$/i.test(file?.name || '')) throw new Error(OFFLINE_BATCH)
  await wait(3200)
  return load(capFile(maxRequirements))
}
