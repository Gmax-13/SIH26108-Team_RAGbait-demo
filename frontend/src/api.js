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
