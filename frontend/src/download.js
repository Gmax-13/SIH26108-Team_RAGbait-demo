/** Client-side file export. Used for the compliance report and the ingestion
 *  audit trail, both of which people need to take away from the dashboard. */
export function downloadBlob(filename, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const downloadJSON = (filename, obj) =>
  downloadBlob(filename, JSON.stringify(obj, null, 2), 'application/json')

/** Minimal RFC4180 CSV writer — quotes fields containing quotes, commas or newlines. */
export function toCSV(rows, columns) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = columns.map((c) => esc(c.label ?? c.key)).join(',')
  const body = rows.map((r) => columns.map((c) => esc(
    typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','))
  return [head, ...body].join('\n')
}

export const downloadCSV = (filename, rows, columns) =>
  downloadBlob(filename, toCSV(rows, columns), 'text/csv')

export const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
