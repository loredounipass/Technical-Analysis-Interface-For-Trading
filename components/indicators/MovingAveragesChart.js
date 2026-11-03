"use client"

import React from "react"
import { ResponsiveContainer, ComposedChart, XAxis, Line, YAxis, CartesianGrid, Tooltip } from "recharts"
import { GitCompare } from "lucide-react"
import useChartCardNav from "@/components/indicators/useChartCardNav"
import { TOOLTIP_STYLE, safeToFixed, ensureMinPoints } from "@/components/indicators/chartCardUtils"

// Moving Averages (EMA 50 / 100 / 200): solo las lineas de medias, con dominio
// Y dinamico y tooltip de cierre + MAs.
const MovingAveragesChart = ({ title, datos = {} }) => {
  const { win, chartInteraction, chartCursor, renderNavControls } = useChartCardNav(datos)

  let emaFullData = []
  if (datos.history && Array.isArray(datos.history.closes) && datos.history.closes.length > 0) {
    emaFullData = datos.history.closes.map((c, i) => {
      const t = datos.history.times?.[i]
      return {
        name: `${i}`,
        time: t
          ? new Date(t).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC",
          })
          : `Vela ${i + 1}`,
        ema50: datos.history.ema50?.[i] ?? null,
        ema100: datos.history.ema100?.[i] ?? null,
        ema200: datos.history.ema200?.[i] ?? null,
        price: Number(c),
      }
    })
    if (datos.precio !== null && datos.precio !== undefined && emaFullData.length > 0) {
      const last = emaFullData.length - 1
      const prev = emaFullData[last]
      emaFullData[last] = {
        ...prev,
        ema50: datos.ema50 ?? prev.ema50,
        ema100: datos.ema100 ?? prev.ema100,
        ema200: datos.ema200 ?? prev.ema200,
        price: Number(datos.precio),
      }
    }
  }
  let emaChartData = ensureMinPoints(emaFullData.slice(win.start, win.effEnd))

  // Dominio calculado sobre MAs y precios de cierre de la ventana
  const emaValues = emaChartData
    .flatMap((d) => [d.ema50, d.ema100, d.ema200, d.price])
    .filter((v) => Number.isFinite(v))
  const minEma = emaValues.length > 0 ? Math.min(...emaValues) : 0
  const maxEma = emaValues.length > 0 ? Math.max(...emaValues) : 100
  const padEma = Math.max((maxEma - minEma) * 0.15, Math.abs(maxEma) * 0.001, 1e-12)
  const emaDomain = [Math.max(0, minEma - padEma), maxEma + padEma]

  const isBullTrend = datos.precio > datos.ema50 && datos.ema50 > datos.ema200

  // Tooltip MAs + precio de cierre
  const EmaTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null
    const d = payload[0].payload
    if (!d) return null
    const money = (v) => (Number.isFinite(Number(v)) ? `$${safeToFixed(v, datos.decimales)}` : "—")
    const row = (label, value, color) => (
      <div className="flex items-center justify-between gap-5">
        <span style={{ color: color || "#94a3b8" }}>{label}</span>
        <span style={{ color: "#ffffff" }}>{value}</span>
      </div>
    )
    return (
      <div
        style={{
          ...TOOLTIP_STYLE,
          padding: "8px 10px",
          lineHeight: 1.6,
        }}
      >
        <div style={{ color: "#ffffff" }} className="flex items-center justify-between gap-5 mb-1 pb-1 border-b border-[#16283d]">
          <span>{d.time}</span>
        </div>
        {row("Close", money(d.price))}
        {row("EMA 50", money(d.ema50), "#f59e0b")}
        {row("EMA 100", money(d.ema100), "#38bdf8")}
        {row("EMA 200", money(d.ema200), "#a855f7")}
      </div>
    )
  }

  return (
    <div className="synapse-card p-3.5 flex flex-col justify-between">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#142335] text-xs font-mono">
        <div className="flex items-center gap-2 font-bold tracking-wider text-white uppercase text-[11px]">
          <div className="w-6 h-6 rounded-md bg-[#00f5c4]/10 border border-[#00f5c4]/30 flex items-center justify-center text-[#00f5c4] shadow-[0_0_8px_rgba(0,245,196,0.25)] flex-shrink-0">
            <GitCompare className="w-3.5 h-3.5" />
          </div>
          <span>{title || "MOVING AVERAGES (50/100/200)"}</span>
        </div>
        <div
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
            isBullTrend
              ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]"
              : "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69]"
          }`}
        >
          {isBullTrend ? "Bullish Trend" : "Bearish / Range"}
        </div>
      </div>

      <div {...chartInteraction} className={`h-[120px] w-full my-1 ${chartCursor}`}>
        {emaChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={emaChartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <XAxis dataKey="name" hide />
              <CartesianGrid strokeDasharray="2 2" stroke="#132235" vertical={false} />
              <YAxis domain={emaDomain} hide={true} />
              <Tooltip
                content={<EmaTooltip />}
                cursor={{ stroke: "#244163", strokeDasharray: "3 3" }}
              />
              <Line
                type="monotone"
                dataKey="ema50"
                stroke="#f59e0b"
                strokeWidth={1.8}
                dot={false}
                connectNulls={true}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="ema100"
                stroke="#38bdf8"
                strokeWidth={1.6}
                dot={false}
                connectNulls={true}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="ema200"
                stroke="#a855f7"
                strokeWidth={1.6}
                dot={false}
                connectNulls={true}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 font-mono text-xs">
            No EMA data
          </div>
        )}
      </div>

      {renderNavControls()}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-slate-300">
        {[
          { label: "EMA 50", color: "#f59e0b", value: datos.ema50 },
          { label: "EMA 100", color: "#38bdf8", value: datos.ema100 },
          { label: "EMA 200", color: "#a855f7", value: datos.ema200 },
        ].map((ma) => (
          <span key={ma.label} className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: ma.color }}
            />
            <span style={{ color: ma.color }}>{ma.label}</span>
            <span className="text-white font-medium">
              ${safeToFixed(ma.value, datos.decimales)}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

export default React.memo(MovingAveragesChart)
