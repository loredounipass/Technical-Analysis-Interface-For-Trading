"use client"

import React from "react"
import { ResponsiveContainer, LineChart, Line, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts"
import { Percent } from "lucide-react"
import useChartCardNav from "@/components/indicators/useChartCardNav"
import { TOOLTIP_STYLE, safeToFixed, ensureMinPoints } from "@/components/indicators/chartCardUtils"

// Stochastic Oscillator (14, 3, 3): lineas %K (rapida) y %D (lenta), zonas 20/80.
const StochasticOscillatorChart = ({ title, datos = {} }) => {
  const { win, chartInteraction, chartCursor, renderNavControls } = useChartCardNav(datos)

  let stochFullData = []
  if (datos.history && Array.isArray(datos.history.stochK) && datos.history.stochK.length > 0) {
    stochFullData = datos.history.stochK.map((k, i) => ({
      name: `${i}`,
      k: k,
      d: datos.history.stochD?.[i] ?? null,
    }))
    if (datos.stochK !== null && datos.stochK !== undefined && stochFullData.length > 0) {
      const last = stochFullData.length - 1
      stochFullData[last] = {
        name: `${last}`,
        k: datos.stochK,
        d: datos.stochD,
      }
    }
  }
  if (stochFullData.length === 0 && datos.stochK !== null && datos.stochK !== undefined) {
    stochFullData = [
      { name: "0", k: datos.stochK, d: datos.stochD },
      { name: "1", k: datos.stochK, d: datos.stochD },
    ]
  }
  let stochChartData = ensureMinPoints(stochFullData.slice(win.start, win.effEnd))

  const kVal = Number(datos.stochK) || 50
  const dVal = Number(datos.stochD) || 50
  const isOB = kVal >= 80
  const isOS = kVal <= 20
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
            <Percent className="w-3.5 h-3.5" />
          </div>
          <span>{title || "STOCHASTIC OSCILLATOR (14, 3, 3)"}</span>
        </div>
        <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${badgeColor}`}>
          %K: {safeToFixed(kVal, 2)} {statusText}
        </div>
      </div>

      {/* Chart */}
      <div {...chartInteraction} className={`h-[120px] w-full my-1 ${chartCursor}`}>
        {stochChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stochChartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#132235" vertical={false} />
              <YAxis domain={[0, 100]} hide={true} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name) => {
                  const val = safeToFixed(value, 2)
                  if (name === "k") return [val, "%K Line (Fast)"]
                  if (name === "d") return [val, "%D Line (Slow)"]
                  return [val, name]
                }}
              />
              <ReferenceLine y={80} stroke="#ff3b69" strokeDasharray="3 3" strokeOpacity={0.35} />
              <ReferenceLine y={20} stroke="#00f5c4" strokeDasharray="3 3" strokeOpacity={0.35} />
              {/* %K Line: Neon Cyan */}
              <Line
                type="monotone"
                dataKey="k"
                stroke="#00f5c4"
                strokeWidth={2}
                dot={false}
                connectNulls={true}
                isAnimationActive={false}
              />
              {/* %D Line: Coral Pink dashed */}
              <Line
                type="monotone"
                dataKey="d"
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
            No historical Stochastic data
          </div>
        )}
      </div>

      {renderNavControls()}

      {/* Footer con letras blancas */}
      <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-slate-300">
        <span>Fast Line (%K): <span className="text-[#00f5c4] font-medium">{safeToFixed(kVal, 2)}</span></span>
        <span>Slow Line (%D): <span className="text-[#ff3b69] font-medium">{safeToFixed(dVal, 2)}</span></span>
        <span>Zone: <span className="text-white font-medium">20 / 80</span></span>
      </div>
    </div>
  )
}

export default React.memo(StochasticOscillatorChart)
