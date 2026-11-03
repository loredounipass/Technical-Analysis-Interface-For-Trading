"use client"

import React from "react"
import { ResponsiveContainer, LineChart, Line, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts"
import { Gauge } from "lucide-react"
import useChartCardNav from "@/components/indicators/useChartCardNav"
import { TOOLTIP_STYLE, safeToFixed, ensureMinPoints } from "@/components/indicators/chartCardUtils"

// ADX (14) + DI: fuerza de tendencia (linea ADX) con las direccionales +DI / -DI.
// Mismo patron de grafico navegable que RSI/MACD (useChartCardNav) y datos
// SOLO del backend (history.adx / plusDi / minusDi; el valor vivo se pisa con
// los escalares datos.adx / plusDi / minusDi).
const AdxChart = ({ title, datos = {} }) => {
  const { win, chartInteraction, chartCursor, renderNavControls } = useChartCardNav(datos)

  let adxFullData = []
  if (datos.history && Array.isArray(datos.history.adx) && datos.history.adx.length > 0) {
    adxFullData = datos.history.adx.map((v, i) => ({
      name: `${i}`,
      adx: v,
      plusDi: datos.history.plusDi?.[i] ?? null,
      minusDi: datos.history.minusDi?.[i] ?? null,
    }))
    if (adxFullData.length > 0) {
      const last = adxFullData.length - 1
      if (datos.adx !== null && datos.adx !== undefined) adxFullData[last].adx = datos.adx
      if (datos.plusDi !== null && datos.plusDi !== undefined) adxFullData[last].plusDi = datos.plusDi
      if (datos.minusDi !== null && datos.minusDi !== undefined) adxFullData[last].minusDi = datos.minusDi
    }
  }
  if (adxFullData.length === 0 && datos.adx !== null && datos.adx !== undefined) {
    adxFullData = [{ name: "0", adx: datos.adx, plusDi: datos.plusDi ?? null, minusDi: datos.minusDi ?? null }]
  }
  const adxChartData = ensureMinPoints(adxFullData.slice(win.start, win.effEnd))

  const adxVal = Number(datos.adx)
  const hasAdx = Number.isFinite(adxVal) && adxVal > 0
  const plusDiVal = Number(datos.plusDi)
  const minusDiVal = Number(datos.minusDi)

  // Clasificacion estandar de fuerza de tendencia por ADX (Wilder): <20 sin
  // tendencia, 20-25 incipiente, 25-50 en tendencia, >50 fuerte.
  const adxState = !hasAdx
    ? { label: "NO DATA", cls: "bg-slate-500/15 border border-slate-500/40 text-slate-400" }
    : adxVal < 20
      ? { label: "RANGING", cls: "bg-slate-500/15 border border-slate-500/40 text-slate-300" }
      : adxVal < 25
        ? { label: "DEVELOPING TREND", cls: "bg-amber-500/15 border border-amber-500/40 text-amber-400" }
        : adxVal <= 50
          ? { label: "TREND", cls: "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]" }
          : { label: "STRONG TREND", cls: "bg-[#00f5c4]/20 border border-[#00f5c4]/50 text-[#00f5c4]" }

  return (
    <div className="synapse-card p-3.5 flex flex-col justify-between">
      {/* Header con squircle icon */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#142335] text-xs font-mono">
        <div className="flex items-center gap-2 font-bold tracking-wider text-white uppercase text-[11px]">
          <div className="w-6 h-6 rounded-md bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.25)] flex-shrink-0">
            <Gauge className="w-3.5 h-3.5" />
          </div>
          <span>{title || "ADX (14) TREND STRENGTH"}</span>
        </div>
        <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${adxState.cls}`}>
          {hasAdx ? safeToFixed(adxVal, 2) : "\u2014"} {adxState.label}
        </div>
      </div>

      {/* Chart: ADX + DI / -DI */}
      <div {...chartInteraction} className={`h-[120px] w-full my-1 ${chartCursor}`}>
        {adxChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={adxChartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#132235" vertical={false} />
              <YAxis domain={[0, "auto"]} hide={true} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: "#ffffff" }}
                itemStyle={{ color: "#ffffff" }}
                formatter={(value, name) => [
                  <span style={{ color: "#ffffff" }}>{safeToFixed(value, 2)}</span>,
                  <span style={{ color: "#ffffff" }}>{name}</span>,
                ]}
              />
              <ReferenceLine y={25} stroke="#fbbf24" strokeDasharray="3 3" strokeOpacity={0.3} />
              <Line type="monotone" dataKey="adx" stroke="#fbbf24" strokeWidth={2} dot={false} connectNulls={true} isAnimationActive={false} />
              <Line type="monotone" dataKey="plusDi" stroke="#00f5c4" strokeWidth={1.5} dot={false} connectNulls={true} isAnimationActive={false} />
              <Line type="monotone" dataKey="minusDi" stroke="#ff3b69" strokeWidth={1.5} dot={false} connectNulls={true} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 font-mono text-xs">
            No historical ADX data
          </div>
        )}
      </div>

      {renderNavControls()}

      {/* Footer: ADX y direccionales (verde +DI alcista, rojo -DI bajista) */}
      <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-white">
        <span>
          ADX: <span className="text-amber-400 font-medium">{hasAdx ? safeToFixed(adxVal, 2) : "\u2014"}</span>
        </span>
        <span className="flex items-center gap-3">
          <span>
            +DI: <span className="text-[#00f5c4] font-medium">{Number.isFinite(plusDiVal) ? safeToFixed(plusDiVal, 2) : "\u2014"}</span>
          </span>
          <span>
            -DI: <span className="text-[#ff3b69] font-medium">{Number.isFinite(minusDiVal) ? safeToFixed(minusDiVal, 2) : "\u2014"}</span>
          </span>
        </span>
      </div>
    </div>
  )
}

export default React.memo(AdxChart)
