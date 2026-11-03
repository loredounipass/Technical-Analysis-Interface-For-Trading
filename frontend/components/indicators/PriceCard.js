"use client"

import React from "react"
import { ResponsiveContainer, AreaChart, Area, YAxis } from "recharts"

export default function PriceCard({
  precio,
  decimales = 2,
  symbol = "ETHUSDT",
  history = {},
  volumen = null,
  time = "",
}) {
  const parsePrecio = (p) => {
    const n = Number(p)
    return Number.isFinite(n) ? n : 0
  }

  const formatWithDots = (n, d) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(n)
  }

  const value = parsePrecio(precio)
  const formattedPrice = formatWithDots(value, decimales)

  // HIGH/LOW y % de variacion REALES de las ultimas 24h, derivados de las velas
  // cuyo timestamp cae dentro de la ventana de 24h respecto a la ultima vela.
  // Sin inventar bandas: si no hay velas en la ventana, se muestra "—".
  let high24 = null
  let low24 = null
  let pctChange = null
  let priceChartData = []

  try {
    if (history && Array.isArray(history.closes) && history.closes.length > 0) {
      const closes = history.closes
      const highs = Array.isArray(history.highs) ? history.highs : closes
      const lows = Array.isArray(history.lows) ? history.lows : closes
      const times = Array.isArray(history.times) ? history.times : []
      const lastT = times.length ? Number(times[times.length - 1]) : 0
      const DAY_MS = 86400000

      // Indices dentro de las ultimas 24h (todos si no hay timestamps reales).
      const idx = []
      for (let i = 0; i < closes.length; i++) {
        const t = Number(times[i])
        if (!lastT || !Number.isFinite(t) || t > lastT - DAY_MS) idx.push(i)
      }

      const validHighs = idx.map((i) => Number(highs[i])).filter((v) => Number.isFinite(v))
      const validLows = idx.map((i) => Number(lows[i])).filter((v) => Number.isFinite(v))
      if (validHighs.length > 0) high24 = Math.max(...validHighs)
      if (validLows.length > 0) low24 = Math.min(...validLows)

      const baseClose = idx.length ? Number(closes[idx[0]]) : NaN
      const lastClose = value || Number(closes[closes.length - 1])
      if (Number.isFinite(baseClose) && baseClose > 0 && Number.isFinite(lastClose)) {
        pctChange = ((lastClose - baseClose) / baseClose) * 100
      }

      // Sparkline: ultimas ~30 velas del timeframe seleccionado.
      const spark = closes.slice(-30)
      priceChartData = spark.map((p, i) => ({
        index: i,
        price: Number(p),
      }))

      if (priceChartData.length > 0) {
        priceChartData[priceChartData.length - 1].price = value
      }
    }
  } catch (e) {
    priceChartData = []
  }

  // Format volume
  const formatVol = (v) => {
    const n = Number(v)
    if (!Number.isFinite(n) || n === 0) return "—"
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
    if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
    return `$${n.toFixed(2)}`
  }

  const hasPct = pctChange !== null && Number.isFinite(pctChange)
  const isPositive = hasPct && pctChange >= 0
  const pctFormatted = hasPct ? `${isPositive ? "+" : ""}${pctChange.toFixed(2)}%` : "\u2014"

  return (
    <div className="synapse-card p-5 relative overflow-hidden flex flex-col justify-between min-h-[200px] group transition-all duration-300">
      {/* Top row: CURRENT PRICE + LIVE MARKET PRICE badge | HIGH 24H */}
      <div className="flex items-center justify-between text-[11px] font-mono tracking-wider mb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400 font-bold uppercase tracking-widest text-[11px]">
            CURRENT PRICE
          </span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#00f5c4]/10 border border-[#00f5c4]/30 text-[#00f5c4]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00f5c4] animate-ping" />
            <span className="text-[9px] font-bold tracking-widest uppercase">LIVE MARKET PRICE</span>
          </div>
          {time && (
            <span className="text-[10px] text-slate-400 font-semibold tabular-nums whitespace-nowrap">
              UTC {time}
            </span>
          )}
        </div>

        <div className="text-slate-400">
          HIGH 24H:{" "}
          <span className="text-white font-bold tabular-nums">
            {high24 !== null ? `$${formatWithDots(high24, decimales)}` : "\u2014"}
          </span>
        </div>
      </div>

      {/* Middle row: Big Price & Change Badge on left, Sparkline Chart on right */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center my-1">
        {/* Left price info */}
        <div className="sm:col-span-7 flex flex-wrap items-baseline gap-2.5">
          <div className="text-3xl sm:text-4xl font-extrabold text-white font-mono tracking-tight tabular-nums">
            ${formattedPrice}
          </div>

          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold font-mono ${
              !hasPct
                ? "bg-slate-500/15 border border-slate-500/40 text-slate-400"
                : isPositive
                ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4] shadow-[0_0_10px_rgba(0,245,196,0.2)]"
                : "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69] shadow-[0_0_10px_rgba(255,59,105,0.2)]"
            }`}
          >
            <span>{!hasPct ? "\u2022" : isPositive ? "\u25b2" : "\u25bc"}</span>
            <span>{pctFormatted}</span>
          </div>
        </div>

        {/* Right sparkline chart */}
        <div className="sm:col-span-5 h-[70px] w-full relative">
          {priceChartData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={priceChartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                <defs>
                  <linearGradient id="cyanSparkline" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f5c4" stopOpacity={0.35} />
                    <stop offset="90%" stopColor="#00f5c4" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <YAxis domain={["dataMin", "dataMax"]} hide />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#00f5c4"
                  strokeWidth={2}
                  fill="url(#cyanSparkline)"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-end text-slate-500 font-mono text-[10px]">
              No sparkline data
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: Low & Vol 24h */}
      <div className="text-[11px] font-mono text-slate-400 tracking-wide mt-1 flex items-center gap-2">
        <span>
          Low:{" "}
          <span className="text-slate-300 font-medium tabular-nums">
            {low24 !== null ? `$${formatWithDots(low24, decimales)}` : "\u2014"}
          </span>
        </span>
        <span className="text-slate-400">•</span>
        <span>
          Vol 24h:{" "}
          <span className="text-slate-300 font-medium tabular-nums">
            {formatVol(volumen)}
          </span>
        </span>
      </div>
    </div>
  )
}
