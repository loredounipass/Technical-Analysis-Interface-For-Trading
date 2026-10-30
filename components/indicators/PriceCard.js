"use client"

import React from "react"
import { ResponsiveContainer, AreaChart, Area, YAxis } from "recharts"

export default function PriceCard({
  precio,
  decimales = 2,
  symbol = "ETHUSDT",
  history = {},
  volumen = null,
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

  // Calculate 24h High, Low, and % Change from history
  let high24 = value * 1.015
  let low24 = value * 0.985
  let pctChange = 0
  let priceChartData = []

  try {
    if (history && Array.isArray(history.closes) && history.closes.length > 0) {
      const closes = history.closes.slice(-30)
      const highs = Array.isArray(history.highs) ? history.highs.slice(-30) : closes
      const lows = Array.isArray(history.lows) ? history.lows.slice(-30) : closes

      const validHighs = highs.filter((v) => Number.isFinite(Number(v)))
      const validLows = lows.filter((v) => Number.isFinite(Number(v)))

      if (validHighs.length > 0) high24 = Math.max(...validHighs)
      if (validLows.length > 0) low24 = Math.min(...validLows)

      const firstClose = Number(closes[0])
      const lastClose = value || Number(closes[closes.length - 1])
      if (firstClose > 0) {
        pctChange = ((lastClose - firstClose) / firstClose) * 100
      }

      priceChartData = closes.map((p, i) => ({
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

  const isPositive = pctChange >= 0
  const pctFormatted = `${isPositive ? "+" : ""}${pctChange.toFixed(2)}%`

  return (
    <div className="synapse-card p-4 relative overflow-hidden flex flex-col justify-between min-h-[160px] group transition-all duration-300">
      {/* Top row: CURRENT PRICE + LIVE FEED badge | HIGH 24H */}
      <div className="flex items-center justify-between text-[11px] font-mono tracking-wider mb-2">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-bold uppercase tracking-widest text-[11px]">
            CURRENT PRICE
          </span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#00f5c4]/10 border border-[#00f5c4]/30 text-[#00f5c4]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00f5c4] animate-ping" />
            <span className="text-[9px] font-bold tracking-widest uppercase">LIVE FEED</span>
          </div>
        </div>

        <div className="text-slate-400">
          HIGH 24H:{" "}
          <span className="text-white font-bold tabular-nums">
            ${formatWithDots(high24, decimales)}
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
              isPositive
                ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4] shadow-[0_0_10px_rgba(0,245,196,0.2)]"
                : "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69] shadow-[0_0_10px_rgba(255,59,105,0.2)]"
            }`}
          >
            <span>{isPositive ? "▲" : "▼"}</span>
            <span>{pctFormatted}</span>
          </div>
        </div>

        {/* Right sparkline chart */}
        <div className="sm:col-span-5 h-[55px] w-full relative">
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
            ${formatWithDots(low24, decimales)}
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
