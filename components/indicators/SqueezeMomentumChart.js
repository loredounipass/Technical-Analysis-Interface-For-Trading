"use client"

import React from "react"
import { ResponsiveContainer, ComposedChart, Bar, Cell, Scatter, CartesianGrid, Tooltip, ReferenceLine, YAxis } from "recharts"
import { Waves } from "lucide-react"
import useChartCardNav from "@/components/indicators/useChartCardNav"
import { TOOLTIP_STYLE, safeToFixed, ensureMinPoints } from "@/components/indicators/chartCardUtils"

// Paleta del histograma igual que el Squeeze Momentum [LazyBear] de los
// exchanges: se pinta segun el signo del momentum Y su direccion (creciente /
// decreciente) respecto a la barra anterior. Convencion del proyecto: alcista
// verde, bajista rojo.
const BAR_LIME = "#00f5c4"  // momentum > 0 y creciente
const BAR_GREEN = "#12a877" // momentum > 0 y decreciente (frena)
const BAR_RED = "#ff3b69"   // momentum < 0 y decreciente (baja con fuerza)
const BAR_MAROON = "#8f2240" // momentum < 0 y creciente (rebota)

// Puntos de la linea cero: estado de compresion (Bollinger dentro/fuera de
// Keltner). 'on' = comprimido (energia almacenada), 'off' = liberado, 'no' =
// parcialmente solapado.
const DOT_ON = "#fbbf24"
const DOT_OFF = "#64748b"
const DOT_NO = "#38bdf8"

const squeezeBarColor = (val, prev) => {
  if (val == null) return "#334155"
  if (val >= 0) return prev == null || val >= prev ? BAR_LIME : BAR_GREEN
  return prev != null && val < prev ? BAR_RED : BAR_MAROON
}

// Forma del punto de squeeze sobre la linea cero. Recharts pasa el payload de
// la fila; se colorea segun sqz y se omite si no hay estado.
const SqueezeDot = (props) => {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload || payload.sqz == null) return null
  const fill = payload.sqz === "on" ? DOT_ON : payload.sqz === "off" ? DOT_OFF : DOT_NO
  return <circle cx={cx} cy={cy} r={2.4} fill={fill} stroke="#08111a" strokeWidth={0.5} />
}

// Squeeze Momentum (20, 2, 1.5): histograma de momentum con puntos de
// compresion. Datos SOLO del backend (history.squeezeMomentum /
// history.squeezeState; el valor vivo se pisa con datos.squeezeMomentum /
// datos.squeezeState).
const SqueezeMomentumChart = ({ title, datos = {} }) => {
  const { win, chartInteraction, chartCursor, renderNavControls } = useChartCardNav(datos)

  let sqzFullData = []
  if (datos.history && Array.isArray(datos.history.squeezeMomentum) && datos.history.squeezeMomentum.length > 0) {
    sqzFullData = datos.history.squeezeMomentum.map((m, i) => ({
      name: `${i}`,
      momentum: m,
      sqz: datos.history.squeezeState?.[i] ?? null,
      sqzDot: datos.history.squeezeState?.[i] != null ? 0 : null,
    }))
    if (sqzFullData.length > 0) {
      const last = sqzFullData.length - 1
      if (datos.squeezeMomentum !== null && datos.squeezeMomentum !== undefined) sqzFullData[last].momentum = datos.squeezeMomentum
      if (datos.squeezeState != null) {
        sqzFullData[last].sqz = datos.squeezeState
        sqzFullData[last].sqzDot = 0
      }
    }
  }
  const winSlice = sqzFullData.slice(win.start, win.effEnd)
  // Color de cada barra necesita la barra ANTERIOR real (aunque quede fuera de
  // la ventana): se toma de la serie completa por indice global, no del slice.
  const sqzChartData = ensureMinPoints(
    winSlice.map((row, idx) => {
      const globalIdx = win.start + idx
      const prev = globalIdx > 0 ? sqzFullData[globalIdx - 1]?.momentum : null
      return { ...row, color: squeezeBarColor(row.momentum, prev) }
    })
  )

  const momVal = Number(datos.squeezeMomentum)
  const hasMom = Number.isFinite(momVal)
  const histBarSize = Math.min(Math.max((win.plotWidth / win.effCount) * 0.5, 1), 10)

  const sqzState = datos.squeezeState
  const stateMeta =
    sqzState === "on"
      ? { label: "SQUEEZE ON", cls: "bg-amber-500/15 border border-amber-500/40 text-amber-400" }
      : sqzState === "off"
        ? { label: "RELEASED", cls: "bg-slate-500/15 border border-slate-500/40 text-slate-300" }
        : sqzState === "no"
          ? { label: "NEUTRAL", cls: "bg-sky-500/15 border border-sky-500/40 text-sky-400" }
          : { label: "NO DATA", cls: "bg-slate-500/15 border border-slate-500/40 text-slate-400" }

  // Direccion del momentum (para el footer): ultima vs penultima barra real.
  let rising = null
  if (sqzFullData.length >= 2) {
    const cur = sqzFullData[sqzFullData.length - 1].momentum
    const prv = sqzFullData[sqzFullData.length - 2].momentum
    if (cur != null && prv != null) rising = cur >= prv
  }

  return (
    <div className="synapse-card p-3.5 flex flex-col justify-between">
      {/* Header con squircle icon */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#142335] text-xs font-mono">
        <div className="flex items-center gap-2 font-bold tracking-wider text-white uppercase text-[11px]">
          <div className="w-6 h-6 rounded-md bg-[#00f5c4]/10 border border-[#00f5c4]/30 flex items-center justify-center text-[#00f5c4] shadow-[0_0_8px_rgba(0,245,196,0.25)] flex-shrink-0">
            <Waves className="w-3.5 h-3.5" />
          </div>
          <span>{title || "SQUEEZE MOMENTUM (20, 2, 1.5)"}</span>
        </div>
        <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider border ${stateMeta.cls}`}>
          {stateMeta.label}
        </div>
      </div>

      {/* Chart: histograma momentum + puntos de squeeze en la linea cero */}
      <div {...chartInteraction} className={`h-[120px] w-full my-1 ${chartCursor}`}>
        {sqzChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={sqzChartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#132235" vertical={false} />
              <YAxis domain={["auto", "auto"]} hide={true} />
              <ReferenceLine y={0} stroke="#1f3752" />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: "#ffffff" }}
                itemStyle={{ color: "#ffffff" }}
                formatter={(value, name) => {
                  if (name === "sqzDot") return null
                  if (name === "momentum") {
                    return [
                      <span style={{ color: "#ffffff" }}>{safeToFixed(value, 4)}</span>,
                      <span style={{ color: "#ffffff" }}>Momentum</span>,
                    ]
                  }
                  return [value, name]
                }}
              />
              <Bar dataKey="momentum" barSize={histBarSize} isAnimationActive={false}>
                {sqzChartData.map((entry, index) => (
                  <Cell key={`sqz-${index}`} fill={entry.color} fillOpacity={0.85} />
                ))}
              </Bar>
              <Scatter dataKey="sqzDot" shape={<SqueezeDot />} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 font-mono text-xs">
            No historical squeeze data
          </div>
        )}
      </div>

      {renderNavControls()}

      {/* Footer: momentum con signo/direccion + estado de compresion */}
      <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-white">
        <span>
          Momentum:{" "}
          <span className={`font-medium ${hasMom ? (momVal >= 0 ? "text-[#00f5c4]" : "text-[#ff3b69]") : "text-slate-400"}`}>
            {hasMom ? safeToFixed(momVal, 4) : "\u2014"}
            {hasMom && rising != null ? (rising ? " \u25B2" : " \u25BC") : ""}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-slate-400">Squeeze:</span>
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: DOT_ON }} />
          <span className="text-slate-400 text-[9px]">on</span>
          <span className="inline-block w-2 h-2 rounded-full ml-1" style={{ backgroundColor: DOT_OFF }} />
          <span className="text-slate-400 text-[9px]">off</span>
        </span>
      </div>
    </div>
  )
}

export default React.memo(SqueezeMomentumChart)
