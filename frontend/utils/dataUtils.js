export const getRecommendation = (data) => {
  if (data.buySignals > data.sellSignals) return "COMPRA"
  if (data.sellSignals > data.buySignals) return "VENTA"
  return "NEUTRAL"
}

export const getRecommendationColor = (rec) => {
  switch (rec) {
    case "COMPRA":
      return "bg-trading-green-600"
    case "VENTA":
      return "bg-trading-red-600"
    default:
      return "bg-trading-dark-600"
  }
}

// Label visible del instrumento: quita el sufijo de exchange de Yahoo (=X forex,
// =F futuros) que NO debe aparecer en la UI, y formatea pares forex de 6 letras
// con slash (EURUSD=X -> EUR/USD) para consistencia con crypto. El symbol real
// para llamadas API/peticiones permanece intacto; esto es solo presentacion.
export const formatDisplaySymbol = (symbol) => {
  if (!symbol) return ""
  const s = String(symbol)
  const isForex = /=X$/i.test(s)
  const clean = s.replace(/=(X|F)$/i, "")
  if (isForex && /^[A-Z]{6}$/i.test(clean)) {
    return `${clean.slice(0, 3).toUpperCase()}/${clean.slice(3).toUpperCase()}`
  }
  return clean
}
