"use client"

import React from "react"
import { ResponsiveContainer, ComposedChart, Line, Bar, Cell, CartesianGrid, Tooltip, ReferenceLine } from "recharts"
import { Crosshair } from "lucide-react"
import useChartCardNav from "@/components/indicators/useChartCardNav"
import { TOOLTIP_STYLE, safeToFixed, ensureMinPoints } from "@/components/indicators/chartCardUtils"

// MACD (12, 26, 9): histograma de barras + lineas MACD y senal.
const MacdIndicatorChart = ({ title, datos = {} }) => {
  const { win, chartInteraction, chartCursor, renderNavControls } = useChartCardNav(datos)

  let macdFullData = []
  if (datos.history && Array.isArray(datos.history.macd) && datos.history.macd.length > 0) {
    macdFullData = datos.history.macd.map((m, i) => {
      const s = datos.history.macd_signal?.[i] ?? null
      const h = m !== null && s !== null ? m - s : 0
      return { name: `${i}`, macd: m, signal: s, hist: h }
    })
    if (datos.macdValue !== null && datos.macdValue !== undefined && macdFullData.length > 0) {
      const last = macdFullData.length - 1
      macdFullData[last].macd = datos.macdValue
      macdFullData[last].signal = datos.macdSignal
      macdFullData[last].hist = datos.macdValue - (datos.macdSignal || 0)
    }
  }
  if (macdFullData.length === 0 && datos.macdValue !== null && datos.macdValue !== undefined) {
    macdFullData = [
      {
        name: "0",
        macd: datos.macdValue,
        signal: datos.macdSignal,
        hist: datos.macdValue - (datos.macdSignal || 0),
      },
    ]
  }
  let macdChartData = ensureMinPoints(macdFullData.slice(win.start, win.effEnd))
  const histBarSize = Math.min(Math.max((win.plotWidth / win.effCount) * 0.5, 1), 10)

  const macdVal = Number(datos.macdValue)
  const hasMacd = Number.isFinite(macdVal)
  const histVal = Number(datos.macdHistogram ?? (datos.macdValue - (datos.macdSignal || 0)))
  const hasHist = Number.isFinite(histVal)
  const isBull = macdVal > 0
  const badgeColor = !hasMacd
    ? "bg-slate-500/15 border border-slate-500/40 text-slate-400"
    : isBull
    ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]"
    : "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69]"

  return (
    <div className="synapse-card p-3.5 flex flex-col justify-between">
      {/* Header con squircle icon */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#142335] text-xs font-mono">
        <div className="flex items-center gap-2 font-bold tracking-wider text-white uppercase text-[11px]">
          <div className="w-6 h-6 rounded-md bg-[#00f5c4]/10 border border-[#00f5c4]/30 flex items-center justify-center text-[#00f5c4] shadow-[0_0_8px_rgba(0,245,196,0.25)] flex-shrink-0">
            <Crosshair className="w-3.5 h-3.5" />
          </div>
          <span>{title || "MACD (12, 26, 9)"}</span>
        </div>
        <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${badgeColor}`}>
          {hasMacd ? safeToFixed(macdVal, 2) : "\u2014"} {hasMacd ? (isBull ? "Bullish" : "Bearish") : "NO DATA"}
        </div>
      </div>

      {/* Chart with Histogram Bars + MACD & Signal curves */}
      <div {...chartInteraction} className={`h-[120px] w-full my-1 ${chartCursor}`}>
        {macdChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={macdChartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#132235" vertical={false} />
              <ReferenceLine y={0} stroke="#1f3752" />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: "#ffffff" }}
                itemStyle={{ color: "#ffffff" }}
                formatter={(value, name) => {
                  const formattedValue = safeToFixed(value, 2)
                  if (name === "hist") {
                    return [
                      <span style={{ color: "#ffffff" }}>{formattedValue}</span>,
                      <span style={{ color: "#ffffff" }}>hist</span>,
                    ]
                  }
                  return [formattedValue, name]
                }}
              />

              {/* Histogram Bars */}
              <Bar dataKey="hist" barSize={histBarSize} isAnimationActive={false}>
                {macdChartData.map((entry, index) => (
                  <Cell
                    key={`hist-${index}`}
                    fill={(entry.hist || 0) >= 0 ? "#00f5c4" : "#ff3b69"}
                    fillOpacity={0.7}
                  />
                ))}
              </Bar>

              {/* MACD Line (Cyan) */}
              <Line
                type="monotone"
                dataKey="macd"
                stroke="#00f5c4"
                strokeWidth={1.5}
                dot={false}
                connectNulls={true}
                isAnimationActive={false}
              />

              {/* Signal Line (Pink/Coral) */}
              <Line
                type="monotone"
                dataKey="signal"
                stroke="#ff3b69"
                strokeWidth={1.5}
                dot={false}
                connectNulls={true}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 font-mono text-xs">
            No historical MACD data
          </div>
        )}
      </div>

      {renderNavControls()}

      {/* Footer con letras blancas */}
      <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-white">
        <span>
          Histogram:{" "}
          <span className={histVal >= 0 ? "text-[#00f5c4] font-medium" : "text-[#ff3b69] font-medium"}>
            {hasHist ? safeToFixed(histVal, 2) : "\u2014"}
          </span>
        </span>
        <span>
          Signal:{" "}
          <span className="text-white font-medium">
            {Math.abs(histVal) < 0.05 ? "Convergence" : "Divergence"}
          </span>
        </span>
      </div>
    </div>
  )
}

export default React.memo(MacdIndicatorChart)
