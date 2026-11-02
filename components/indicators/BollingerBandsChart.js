"use client"

import React from "react"
import { ResponsiveContainer, LineChart, Line, YAxis, CartesianGrid, Tooltip } from "recharts"
import { Waves } from "lucide-react"
import useChartCardNav from "@/components/indicators/useChartCardNav"
import { TOOLTIP_STYLE, safeToFixed, ensureMinPoints } from "@/components/indicators/chartCardUtils"

// Bollinger Bands (20, 2σ): bandas superior/media/inferior + linea de precio,
// con dominio Y dinamico segun la ventana visible.
const BollingerBandsChart = ({ title, datos = {} }) => {
  const { win, chartInteraction, chartCursor, renderNavControls } = useChartCardNav(datos)

  let bbFullData = []
  if (datos.history && Array.isArray(datos.history.closes) && datos.history.closes.length > 0) {
    bbFullData = datos.history.closes.map((c, i) => ({
      name: `${i}`,
      upper: datos.history.bb_upper?.[i] ?? null,
      middle: datos.history.bb_middle?.[i] ?? null,
      lower: datos.history.bb_lower?.[i] ?? null,
      price: c,
    }))
    if (datos.precio !== null && datos.precio !== undefined && bbFullData.length > 0) {
      const last = bbFullData.length - 1
      bbFullData[last] = {
        name: `${last}`,
        upper: datos.bbUpper ?? bbFullData[last].upper,
        middle: datos.bbMiddle ?? bbFullData[last].middle,
        lower: datos.bbLower ?? bbFullData[last].lower,
        price: datos.precio,
      }
    }
  }
  let bbChartData = ensureMinPoints(bbFullData.slice(win.start, win.effEnd))

  const bbValues = bbChartData
    .flatMap((d) => [d.upper, d.middle, d.lower, d.price])
    .filter((v) => Number.isFinite(v))
  const minBb = bbValues.length > 0 ? Math.min(...bbValues) : 0
  const maxBb = bbValues.length > 0 ? Math.max(...bbValues) : 100
  const padBb = Math.max((maxBb - minBb) * 0.1, 0.001)
  const bbDomain = [minBb - padBb, maxBb + padBb]

  const isAbove = datos.precio > datos.bbUpper
  const isBelow = datos.precio < datos.bbLower

  return (
    <div className="synapse-card p-3.5 flex flex-col justify-between">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#142335] text-xs font-mono">
        <div className="flex items-center gap-2 font-bold tracking-wider text-white uppercase text-[11px]">
          <div className="w-6 h-6 rounded-md bg-[#38bdf8]/10 border border-[#38bdf8]/30 flex items-center justify-center text-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.25)] flex-shrink-0">
            <Waves className="w-3.5 h-3.5" />
          </div>
          <span>{title || "BOLLINGER BANDS (20, 2σ)"}</span>
        </div>
        <div
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
            isAbove
              ? "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69]"
              : isBelow
              ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]"
              : "bg-slate-800 text-slate-200 border border-slate-700"
          }`}
        >
          {isAbove ? "Upper Break" : isBelow ? "Lower Break" : "In Band"}
        </div>
      </div>

      <div {...chartInteraction} className={`h-[120px] w-full my-1 ${chartCursor}`}>
        {bbChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={bbChartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#132235" vertical={false} />
              <YAxis domain={bbDomain} hide={true} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name) => {
                  const val = `$${safeToFixed(value, datos.decimales)}`
                  if (name === "upper") return [val, "Upper (+2σ)"]
                  if (name === "middle") return [val, "Middle (SMA 20)"]
                  if (name === "lower") return [val, "Lower (-2σ)"]
                  if (name === "price") return [val, "Price"]
                  return [val, name]
                }}
              />
              <Line
                type="monotone"
                dataKey="upper"
                stroke="#ff3b69"
                strokeWidth={1.5}
                dot={false}
                connectNulls={true}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="middle"
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
                connectNulls={true}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="lower"
                stroke="#00f5c4"
                strokeWidth={1.5}
                dot={false}
                connectNulls={true}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#f1f5f9"
                strokeWidth={1}
                strokeOpacity={0.65}
                dot={false}
                connectNulls={true}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 font-mono text-xs">
            No Bollinger Bands data
          </div>
        )}
      </div>

      {renderNavControls()}

      <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-slate-300">
        <span>Upper: <span className="text-[#ff3b69] font-medium">${safeToFixed(datos.bbUpper, datos.decimales)}</span></span>
        <span>Middle: <span className="text-amber-400 font-medium">${safeToFixed(datos.bbMiddle, datos.decimales)}</span></span>
        <span>Lower: <span className="text-[#00f5c4] font-medium">${safeToFixed(datos.bbLower, datos.decimales)}</span></span>
      </div>
    </div>
  )
}

export default React.memo(BollingerBandsChart)
