"use client"

import React from "react"
import { ResponsiveContainer, LineChart, Line, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts"
import { Gauge } from "lucide-react"
import useChartCardNav from "@/components/indicators/useChartCardNav"
import { TOOLTIP_STYLE, safeToFixed, ensureMinPoints } from "@/components/indicators/chartCardUtils"

// RSI Oscillator (14): linea RSI + senal estocastica, con zonas 30/70.
const RsiOscillatorChart = ({ title, datos = {} }) => {
  const { win, chartInteraction, chartCursor, renderNavControls } = useChartCardNav(datos)

  let rsiFullData = []
  if (datos.history && Array.isArray(datos.history.rsi) && datos.history.rsi.length > 0) {
    rsiFullData = datos.history.rsi.map((v, i) => ({
      name: `${i}`,
      rsi: v,
      rsiSignal: datos.history.rsiStoch?.[i] ?? null,
    }))
    if (datos.rsi !== null && datos.rsi !== undefined && rsiFullData.length > 0) {
      rsiFullData[rsiFullData.length - 1].rsi = datos.rsi
    }
    if (datos.rsiStoch !== null && datos.rsiStoch !== undefined && rsiFullData.length > 0) {
      rsiFullData[rsiFullData.length - 1].rsiSignal = datos.rsiStoch
    }
  }
  if (rsiFullData.length === 0 && datos.rsi !== null && datos.rsi !== undefined) {
    rsiFullData = [{ name: "0", rsi: datos.rsi, rsiSignal: datos.rsiStoch || 50 }]
  }
  let rsiChartData = ensureMinPoints(rsiFullData.slice(win.start, win.effEnd))

  const rsiVal = Number(datos.rsi) || 50
  const isOB = rsiVal >= 70
  const isOS = rsiVal <= 30
  const statusText = isOB ? "Overbought" : isOS ? "Oversold" : "Neutral"
  const badgeColor = isOB
    ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]"
    : isOS
      ? "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69]"
      : "bg-amber-500/10 border border-amber-500/30 text-amber-400"

  return (
    <div className="synapse-card p-3.5 flex flex-col justify-between">
      {/* Header con squircle icon */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#142335] text-xs font-mono">
        <div className="flex items-center gap-2 font-bold tracking-wider text-white uppercase text-[11px]">
          <div className="w-6 h-6 rounded-md bg-[#00f5c4]/10 border border-[#00f5c4]/30 flex items-center justify-center text-[#00f5c4] shadow-[0_0_8px_rgba(0,245,196,0.25)] flex-shrink-0">
            <Gauge className="w-3.5 h-3.5" />
          </div>
          <span>{title || "RSI OSCILLATOR (14)"}</span>
        </div>
        <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${badgeColor}`}>
          {safeToFixed(rsiVal, 2)} {statusText}
        </div>
      </div>

      {/* Chart */}
      <div {...chartInteraction} className={`h-[120px] w-full my-1 ${chartCursor}`}>
        {rsiChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rsiChartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#132235" vertical={false} />
              <YAxis domain={[0, 100]} hide={true} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <ReferenceLine y={70} stroke="#00f5c4" strokeDasharray="3 3" strokeOpacity={0.3} />
              <ReferenceLine y={30} stroke="#ff3b69" strokeDasharray="3 3" strokeOpacity={0.3} />
              <Line
                type="monotone"
                dataKey="rsi"
                stroke="#00f5c4"
                strokeWidth={2}
                dot={false}
                connectNulls={true}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="rsiSignal"
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
            No historical RSI data
          </div>
        )}
      </div>

      {renderNavControls()}

      {/* Footer con zonas coloreadas: Oversold=rojo (sobre venta), Overbought=verde (sobre compra) */}
      <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider">
        <span className="text-[#ff3b69]">Oversold: <span className="text-[#ff3b69] font-medium">30</span></span>
        <span className="text-[#00f5c4]">Overbought: <span className="text-[#00f5c4] font-medium">70</span></span>
      </div>
    </div>
  )
}

export default React.memo(RsiOscillatorChart)
