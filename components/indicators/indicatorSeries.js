// Construcción de series OHLC/volumen a partir de `datos.history`.
// Se extrae de IndicatorGrid para que el orquestador solo mapee y renderice.

// Prepara velas (hasta 500 para navegación profunda) y barras de volumen
// alineadas con el mismo eje temporal.
export function buildCandleAndVolumeSeries(datos) {
  const candleData = []
  const volumeChartData = []

  if (datos.history && Array.isArray(datos.history.opens)) {
    const len = datos.history.closes.length
    const startIdx = Math.max(0, len - 500)

    for (let i = startIdx; i < len; i++) {
      const o = Number(datos.history.opens[i])
      const h = Number(datos.history.highs[i])
      const l = Number(datos.history.lows[i])
      const c = Number(datos.history.closes[i])
      const vol = datos.history.volumes ? Number(datos.history.volumes[i]) : Math.abs(c - o) * 100
      const isBull = c >= o

      const t = new Date(datos.history.times[i]).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Chicago",
      })

      candleData.push({
        time: t,
        open: o,
        high: h,
        low: l,
        close: c,
        wickRange: [l, h],
        bodyRange: [o, c],
      })

      volumeChartData.push({
        time: t,
        volume: vol || 10,
        isBull,
      })
    }
  }

  return { candleData, volumeChartData }
}
