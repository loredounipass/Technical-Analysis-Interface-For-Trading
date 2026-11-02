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
        timeZone: "UTC",
      })

      candleData.push({
        time: t,
        open: o,
        high: h,
        low: l,
        close: c,
        wickRange: [l, h],
        bodyRange: [o, c],
        // EMAs canonicas del backend (compute_ema_series, sembradas con SMA),
        // alineadas por indice con closes. Se usan como overlay del grafico de
        // velas en lugar de recalcularlas aqui con un seed ingenuo.
        ema50: datos.history.ema50?.[i] ?? null,
        ema100: datos.history.ema100?.[i] ?? null,
        ema200: datos.history.ema200?.[i] ?? null,
      })

      volumeChartData.push({
        time: t,
        // Volumen real de la vela (quote USDT). Si una vela no tuvo volumen, se
        // muestra 0 (ausencia veraz) en lugar de inventar una altura.
        volume: Number.isFinite(vol) ? vol : 0,
        isBull,
      })
    }
  }

  return { candleData, volumeChartData }
}
