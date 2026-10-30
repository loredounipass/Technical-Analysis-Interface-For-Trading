"use client"

import React from "react"

export default function RecommendationCard({
  recomendacion = "NEUTRAL",
  buySignals = 0,
  sellSignals = 0,
  neutralSignals = 0,
}) {
  const buys = Number(buySignals) || 0
  const sells = Number(sellSignals) || 0
  const neutrals = Number(neutralSignals) || 0
  const totalSignals = buys + sells + neutrals

  // Calculate flow ratios (if no signals, default 50/50)
  const activeTotal = buys + sells
  let bullishPct = 50.0
  let bearishPct = 50.0

  if (activeTotal > 0) {
    bullishPct = (buys / activeTotal) * 100
    bearishPct = (sells / activeTotal) * 100
  } else if (totalSignals > 0) {
    bullishPct = (buys / totalSignals) * 100
    bearishPct = (sells / totalSignals) * 100
  }

  // Determine phrasing based on recommendation
  const isVenta = recomendacion === "VENTA"
  const isCompra = recomendacion === "COMPRA"

  const summaryText = isVenta
    ? "Predominancia bajista de corto plazo"
    : isCompra
      ? "Predominancia alcista de corto plazo"
      : "Consolidación neutral de mercado"

  return (
    <div className="synapse-card p-4 relative overflow-hidden flex flex-col justify-between min-h-[160px] group transition-all duration-300">
      {/* Top row: MARKET SIGNAL + dot | TOTAL SIGNALS */}
      <div className="flex items-center justify-between text-[11px] font-mono tracking-wider mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 font-bold uppercase tracking-widest text-[11px]">
            MARKET SIGNAL
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${isVenta
                ? "bg-[#ff3b69] shadow-[0_0_8px_#ff3b69]"
                : isCompra
                  ? "bg-[#00f5c4] shadow-[0_0_8px_#00f5c4]"
                  : "bg-amber-400 shadow-[0_0_8px_#fbbf24]"
              }`}
          />
        </div>

        <div className="text-slate-400">
          TOTAL SIGNALS:{" "}
          <span className="text-white font-bold tabular-nums">
            {totalSignals || 0}
          </span>
        </div>
      </div>

      {/* Middle row: Badge + Explanation + Signal Counts */}
      <div className="flex flex-wrap items-center justify-between gap-2 my-1">
        <div className="flex items-center gap-2.5">
          {/* Signal Badge */}
          <div
            className={`px-3 py-1 rounded-full text-xs font-bold font-mono tracking-wider flex items-center gap-1.5 ${isVenta
                ? "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69] shadow-[0_0_12px_rgba(255,59,105,0.25)]"
                : isCompra
                  ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4] shadow-[0_0_12px_rgba(0,245,196,0.25)]"
                  : "bg-amber-500/15 border border-amber-500/40 text-amber-400"
              }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${isVenta ? "bg-[#ff3b69]" : isCompra ? "bg-[#00f5c4]" : "bg-amber-400"
                }`}
            />
            <span>{recomendacion}</span>
          </div>

          {/* Descriptive text */}
          <span className="text-xs text-slate-300 font-medium font-mono hidden sm:inline">
            {summaryText}
          </span>
        </div>

        {/* Signal counts: BUY | HOLD | SELL */}
        <div className="text-[11px] font-mono tracking-wider flex items-center gap-2">
          <span className="text-[#00f5c4] font-bold">{buys} BUY</span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-400 font-medium">{neutrals} HOLD</span>
          <span className="text-slate-400">|</span>
          <span className="text-[#ff3b69] font-bold">{sells} SELL</span>
        </div>
      </div>

      {/* Bottom row: Dual Progress Bar + Flow Percentages */}
      <div className="mt-2 space-y-1.5">
        {/* Dual Bar */}
        <div className="w-full h-2 rounded-full bg-[#08111a] border border-[#16283d] overflow-hidden flex p-0.5">
          <div
            className="h-full bg-[#00f5c4] rounded-l-full transition-all duration-500 shadow-[0_0_10px_rgba(0,245,196,0.5)]"
            style={{ width: `${Math.max(4, Math.min(96, bullishPct))}%` }}
          />
          <div
            className="h-full bg-[#ff3b69] rounded-r-full transition-all duration-500 shadow-[0_0_10px_rgba(255,59,105,0.5)]"
            style={{ width: `${Math.max(4, Math.min(96, bearishPct))}%` }}
          />
        </div>

        {/* Labels below bar */}
        <div className="flex justify-between items-center text-[10px] font-mono tracking-wider">
          <span className="text-[#00f5c4] font-medium">
            {bullishPct.toFixed(1)}% Bullish Flow
          </span>
          <span className="text-[#ff3b69] font-medium">
            {bearishPct.toFixed(1)}% Bearish Pressure
          </span>
        </div>
      </div>
    </div>
  )
}
