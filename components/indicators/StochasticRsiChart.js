"use client"

import React from "react"
import { ResponsiveContainer, LineChart, Line, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts"
import { Sparkles } from "lucide-react"
import useChartCardNav from "@/components/indicators/useChartCardNav"
import { TOOLTIP_STYLE, safeToFixed, ensureMinPoints } from "@/components/indicators/chartCardUtils"

// Stochastic RSI (14, 3, 3): %K tomado del historial rsiStoch y %D como media
// movil de 3 del propio %K, con zonas 20/80.
const StochasticRsiChart = ({ title, datos = {} }) => {
  const { win, chartInteraction, chartCursor, renderNavControls } = useChartCardNav(datos)

  let stochRsiFullData = []
  const stochRsiHistory = datos.history?.rsiStoch
  if (Array.isArray(stochRsiHistory) && stochRsiHistory.length > 0) {
    const kSeries = [...stochRsiHistory]
    if (datos.rsiStoch !== null && datos.rsiStoch !== undefined) {
      kSeries[kSeries.length - 1] = datos.rsiStoch
    }
    stochRsiFullData = kSeries.map((value, index) => {
      const dWindow = kSeries.slice(Math.max(0, index - 2), index + 1)
      const hasCompleteDWindow = index >= 2 && dWindow.length === 3 && dWindow.every(
        (v) => v !== null && v !== undefined && Number.isFinite(Number(v))
      )
      const d = hasCompleteDWindow
        ? dWindow.reduce((sum, v) => sum + Number(v), 0) / 3
        : null
      return { name: `${index}`, k: value, d }
    })
  }
  if (stochRsiFullData.length === 0 && datos.rsiStoch !== null && datos.rsiStoch !== undefined) {
    stochRsiFullData = [{ name: "0", k: datos.rsiStoch, d: null }]
  }
  let stochRsiChartData = ensureMinPoints(stochRsiFullData.slice(win.start, win.effEnd))

  const rsiStochVal = Number(datos.rsiStoch) || 50
  const stochRsiDVal = stochRsiFullData[stochRsiFullData.length - 1]?.d
  const isOB = rsiStochVal >= 80
  const isOS = rsiStochVal <= 20
  const statusText = isOB ? "Overbought" : isOS ? "Oversold" : "Neutral"
  const badgeColor = isOB
    ? "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69]"
    : isOS
    ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]"
    : "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400"

  return (
    <div className="synapse-card p-3.5 flex flex-col justify-between">
      {/* Header con squircle icon */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#142335] text-xs font-mono">
        <div className="flex items-center gap-2 font-bold tracking-wider text-white uppercase text-[11px]">
          <div className="w-6 h-6 rounded-md bg-[#00f5c4]/10 border border-[#00f5c4]/30 flex items-center justify-center text-[#00f5c4] shadow-[0_0_8px_rgba(0,245,196,0.25)] flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span>{title || "STOCHASTIC RSI (14, 3, 3)"}</span>
        </div>
        <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${badgeColor}`}>
          {safeToFixed(rsiStochVal, 2)} {statusText}
        </div>
      </div>

      {/* Chart */}
      <div {...chartInteraction} className={`h-[120px] w-full my-1 ${chartCursor}`}>
        {stochRsiChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stochRsiChartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#132235" vertical={false} />
              <YAxis domain={[0, 100]} hide={true} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name) => [`${safeToFixed(value, 2)}`, name === "d" ? "%D" : "%K"]}
              />
              <ReferenceLine y={80} stroke="#ff3b69" strokeDasharray="3 3" strokeOpacity={0.35} />
              <ReferenceLine y={20} stroke="#00f5c4" strokeDasharray="3 3" strokeOpacity={0.35} />
              <Line
                type="monotone"
                dataKey="k"
                name="%K"
                stroke="#00f5c4"
                strokeWidth={2}
                dot={false}
                connectNulls={true}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="d"
                name="%D"
                stroke="#ff3b69"
                strokeWidth={1.5}
                strokeDasharray="2 2"
                dot={false}
                connectNulls={true}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 font-mono text-xs">
            No historical Stoch RSI data
          </div>
        )}
      </div>

      {renderNavControls()}

      {/* Footer: lineas %K/%D (nomenclatura Stoch RSI) y zonas 20=verde / 80=rojo */}
      <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider">
        <span className="text-[#00f5c4]">%K: <span className="text-[#00f5c4] font-medium">{safeToFixed(rsiStochVal, 2)}</span></span>
        <span className="text-[#ff3b69]">%D: <span className="text-[#ff3b69] font-medium">
          {stochRsiDVal === null || stochRsiDVal === undefined ? "\u2014" : safeToFixed(stochRsiDVal, 2)}
        </span></span>
        <span>Zone: <span className="text-[#00f5c4] font-medium">20</span> / <span className="text-[#ff3b69] font-medium">80</span></span>
      </div>
    </div>
  )
}

export default React.memo(StochasticRsiChart)
