const j = async (r) => {
  if (!r.ok) throw new Error((await r.text()).slice(0, 300) || `HTTP ${r.status}`)
  return r.json()
}

export const getStats = () => fetch('/api/stats').then(j)
export const getLogs = (params = {}) =>
  fetch('/api/logs?' + new URLSearchParams(params)).then(j)
export const getStandard = (n) =>
  fetch(`/api/standards/${encodeURIComponent(n)}`).then(j)
export const getGraph = (n, hops = 2) =>
  fetch(`/api/graph/${encodeURIComponent(n)}?hops=${hops}`).then(j)

export const postRecommend = (body) =>
  fetch('/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(j)

export const postBatch = (body) =>
  fetch('/api/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(j)

export const postBatchUpload = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return fetch('/api/batch/upload', { method: 'POST', body: fd }).then(j)
}

/** Stream a recommendation, calling `onEvent` as each pipeline stage starts and
 *  finishes. Resolves with the final result.
 *
 *  EventSource cannot POST, so the SSE frames are parsed off a fetch body
 *  reader. Frames are separated by a blank line and may arrive split across
 *  chunks, so the tail is buffered until a separator shows up.
 */
export async function streamRecommend(body, onEvent) {
  const res = await fetch('/api/recommend/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error((await res.text()).slice(0, 300) || `HTTP ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let result = null

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    let sep
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, sep).trim()
      buf = buf.slice(sep + 2)
      if (!frame.startsWith('data:')) continue
      let ev
      try { ev = JSON.parse(frame.slice(5).trim()) } catch { continue }
      if (ev.event === 'result') result = ev.result
      else if (ev.event === 'error') throw new Error(ev.detail)
      else onEvent?.(ev)
    }
  }
  if (!result) throw new Error('Stream ended before a result arrived')
  return result
}
