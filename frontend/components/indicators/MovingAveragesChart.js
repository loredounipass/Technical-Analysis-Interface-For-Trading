"use client"

import React from "react"
import { ResponsiveContainer, ComposedChart, XAxis, Bar, Line, YAxis, CartesianGrid, Tooltip } from "recharts"
import { GitCompare } from "lucide-react"
import useChartCardNav from "@/components/indicators/useChartCardNav"
import { TOOLTIP_STYLE, safeToFixed, ensureMinPoints } from "@/components/indicators/chartCardUtils"

// Moving Averages (EMA 50 / 100 / 200): igual que en los exchanges, las medias
// moviles se montan SOBRE un grafico de velas. Las velas salen del OHLC real del
// backend (history.opens/highs/lows/closes) y las MAs de las series canonicas
// (history.ema50/100/200). No se recalcula nada: mismo contrato que CandleChart.
const MovingAveragesChart = ({ title, datos = {} }) => {
  const { win, chartInteraction, chartCursor, renderNavControls } = useChartCardNav(datos)

  let maFullData = []
  if (datos.history && Array.isArray(datos.history.closes) && datos.history.closes.length > 0) {
    const h = datos.history
    maFullData = h.closes.map((c, i) => {
      const open = Number(h.opens?.[i])
      const high = Number(h.highs?.[i])
      const low = Number(h.lows?.[i])
      const close = Number(c)
      return {
        name: `${i}`,
        open: Number.isFinite(open) ? open : null,
        high: Number.isFinite(high) ? high : null,
        low: Number.isFinite(low) ? low : null,
        close: Number.isFinite(close) ? close : null,
        // Rango [low, high] que ancla la Bar; el shape dibuja mecha + cuerpo.
        wickRange: Number.isFinite(low) && Number.isFinite(high) ? [low, high] : null,
        ema50: h.ema50?.[i] ?? null,
        ema100: h.ema100?.[i] ?? null,
        ema200: h.ema200?.[i] ?? null,
      }
    })
    // Ultimo punto: refrescar las MAs con el escalar vivo del backend (mismo
    // valor que muestra el footer), preservando el OHLC real de la vela.
    if (maFullData.length > 0) {
      const last = maFullData.length - 1
      maFullData[last] = {
        ...maFullData[last],
        ema50: datos.ema50 ?? maFullData[last].ema50,
        ema100: datos.ema100 ?? maFullData[last].ema100,
        ema200: datos.ema200 ?? maFullData[last].ema200,
      }
    }
  }
  const maChartData = ensureMinPoints(maFullData.slice(win.start, win.effEnd))

  // Dominio Y sobre velas (high/low) Y MAs: en tendencias las medias quedan por
  // encima/debajo del precio, asi que ambas capas deben entrar en la escala.
  const maValues = maChartData
    .flatMap((d) => [d.high, d.low, d.ema50, d.ema100, d.ema200])
    .filter((v) => Number.isFinite(v))
  const minMa = maValues.length > 0 ? Math.min(...maValues) : 0
  const maxMa = maValues.length > 0 ? Math.max(...maValues) : 100
  const padMa = Math.max((maxMa - minMa) * 0.1, Math.abs(maxMa) * 0.001, 1e-12)
  const maDomain = [Math.max(0, minMa - padMa), maxMa + padMa]

  // Tamano de vela escalado a la ventana visible (mismo calculo que CandleChart,
  // acotado al tamano reducido de la tarjeta).
  const plotW = Math.max(50, (win.width || 300) - 20)
  const bodySize = Math.min(Math.max((plotW / win.effCount) * 0.6, 1.5), 20)
  const wickSize = Math.max(1, bodySize * 0.18)

  const isBullTrend = datos.precio > datos.ema50 && datos.ema50 > datos.ema200

  // Shape de vela: una sola Bar con rango [low, high]; mecha centrada (low->high)
  // y cuerpo (open->close) en la misma X. Copia fiel del render de CandleChart.
  const CandleShape = (props) => {
    const { x, y, width, height, payload: d } = props
    if (
      !d ||
      !Number.isFinite(d.open) ||
      !Number.isFinite(d.close) ||
      !Number.isFinite(d.high) ||
      !Number.isFinite(d.low)
    ) {
      return <g />
    }
    const range = d.high - d.low
    if (range <= 0 || !Number.isFinite(height) || height <= 0) {
      return <g />
    }
    const isBull = d.close >= d.open
    const color = isBull ? "#00f5c4" : "#ff3b69"
    const priceToPixel = (p) => y + ((d.high - p) / range) * height
    const cx = x + width / 2
    const bodyTop = priceToPixel(Math.max(d.open, d.close))
    const bodyBottom = priceToPixel(Math.min(d.open, d.close))
    const bodyH = Math.max(1, bodyBottom - bodyTop)
    return (
      <g>
        <rect x={cx - wickSize / 2} y={y} width={wickSize} height={height} fill={color} fillOpacity={0.75} />
        <rect x={cx - bodySize / 2} y={bodyTop} width={bodySize} height={bodyH} fill={color} />
      </g>
    )
  }

  // Tooltip OHLC + MAs (todo dato real de la vela bajo el cursor).
  const MaTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null
    const d = payload[0].payload
    if (!d || !Number.isFinite(d.close)) return null
    const money = (v) => (Number.isFinite(Number(v)) ? `$${safeToFixed(v, datos.decimales)}` : "\u2014")
    const row = (label, value, color) => (
      <div className="flex items-center justify-between gap-5">
        <span style={{ color: color || "#94a3b8" }}>{label}</span>
        <span style={{ color: "#ffffff" }}>{value}</span>
      </div>
    )
    return (
      <div style={{ ...TOOLTIP_STYLE, padding: "8px 10px", lineHeight: 1.6 }}>
        <div className="flex items-center justify-between gap-5 mb-1 pb-1 border-b border-[#16283d]" style={{ color: "#ffffff" }}>
          <span>Vela {Number(d.name) + 1}</span>
          <span style={{ color: d.close >= d.open ? "#00f5c4" : "#ff3b69" }}>{d.close >= d.open ? "BULLISH" : "BEARISH"}</span>
        </div>
        {row("Open", money(d.open))}
        {row("High", money(d.high))}
        {row("Low", money(d.low))}
        {row("Close", money(d.close))}
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
        {maChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={maChartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <XAxis dataKey="name" hide />
              <CartesianGrid strokeDasharray="2 2" stroke="#132235" vertical={false} />
              <YAxis domain={maDomain} hide={true} />
              <Tooltip
                content={<MaTooltip />}
                cursor={{ stroke: "#244163", strokeDasharray: "3 3" }}
              />
              {/* Velas: capa base OHLC real del backend */}
              <Bar
                dataKey="wickRange"
                barSize={bodySize}
                isAnimationActive={false}
                shape={CandleShape}
              />
              {/* EMA 50 (Amber) - serie canonica del backend */}
              <Line
                type="monotone"
                dataKey="ema50"
                stroke="#f59e0b"
                strokeWidth={1.5}
                dot={false}
                connectNulls={true}
                isAnimationActive={false}
              />
              {/* EMA 100 (Sky) */}
              <Line
                type="monotone"
                dataKey="ema100"
                stroke="#38bdf8"
                strokeWidth={1.4}
                dot={false}
                connectNulls={true}
                isAnimationActive={false}
              />
              {/* EMA 200 (Purple) */}
              <Line
                type="monotone"
                dataKey="ema200"
                stroke="#a855f7"
                strokeWidth={1.4}
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
