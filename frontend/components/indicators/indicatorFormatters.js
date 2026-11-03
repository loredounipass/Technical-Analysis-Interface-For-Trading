// Helpers de formato puro para los paneles del grid de indicadores.
// Separados de IndicatorGrid para reutilizarlos sin acoplar el render.

// Formats USDT volume compactly: 1.25B / 350.00M / 45.00K
export function formatVolume(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return "0.00"
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B"
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M"
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K"
  return n.toFixed(2)
}

export function formatLevel(v, decimales = 2) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—"
  return `$${Number(v).toFixed(decimales)}`
}

export function levelDistance(a, b) {
  const na = Number(a)
  const nb = Number(b)
  if (!Number.isFinite(na) || !Number.isFinite(nb) || nb === 0) return "0.00"
  return (((na - nb) / nb) * 100).toFixed(2)
}

export function fmt(v, d = 2) {
  const n = Number(v)
  // Un valor no numerico (undefined/NaN) se muestra como ausencia veraz "---",
  // nunca como un 0.00 que podria leerse como una medida real.
  return Number.isFinite(n) ? n.toFixed(d) : "\u2014"
}

export function formatZoneTime(timestamp) {
  const time = Number(timestamp)
  if (!Number.isFinite(time) || time <= 0) return "—"
  return new Date(time).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

export function formatMetric(value, suffix = "", decimals = 2) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? `${numeric.toFixed(decimals)}${suffix}` : "—"
}
