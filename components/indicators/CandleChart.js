"use client"

import React, { useMemo, useState, useRef, useEffect } from "react"
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Bar,
  Cell,
  Line,
  ReferenceLine,
} from "recharts"
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Radio } from "lucide-react"

const DEFAULT_COUNT = 60
const MIN_COUNT = 12
// Margen aproximado del eje Y derecho (para calcular el ancho util del plot)
const AXIS_MARGIN = 90

const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

export default function CandleChart({
  data = [],
  decimales = 2,
  timeframe = "15m",
  spread = "0.02",
}) {
  // ── Navegación: count = velas visibles (zoom); end = índice final de la
  // ventana (null = siguiendo el precio en vivo) ──
  const [count, setCount] = useState(DEFAULT_COUNT)
  const [end, setEnd] = useState(null)
  const [width, setWidth] = useState(0)
  const chartRef = useRef(null)
  const dragRef = useRef(null)
  const wheelHandlerRef = useRef(() => {})
  const hasData = data.length > 0

  // Format helper
  const fmt = (n) => {
    return Number(n).toLocaleString("en-US", {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    })
  }

  // Compute EMAs for overlay (EMA 20 & EMA 50)
  const chartDataWithEma = useMemo(() => {
    const closes = data.map((d) => d.close)
    const computeEMA = (period) => {
      const k = 2 / (period + 1)
      let ema = null
      return closes.map((c) => {
        if (c === null || c === undefined || isNaN(c)) return null
        if (ema === null) ema = c
        else ema = c * k + ema * (1 - k)
        return ema
      })
    }

    const ema20 = computeEMA(12)
    const ema50 = computeEMA(26)

    return data.map((d, i) => {
      const isLast = i === data.length - 1
      return {
        ...d,
        timeLabel: isLast ? `${d.time} (NOW)` : d.time,
        ema20: ema20[i],
        ema50: ema50[i],
      }
    })
  }, [data])

  // ── Ventana visible según pan/zoom ──
  const total = chartDataWithEma.length
  const effCount = Math.max(1, Math.min(count, total))
  const effEnd = end === null ? total : clamp(end, effCount, total)
  const start = Math.max(0, effEnd - effCount)
  const visibleData = chartDataWithEma.slice(start, effEnd)
  const isLive = effEnd >= total

  // Ancho del contenedor para escalar el tamaño de vela con el zoom
  useEffect(() => {
    const el = chartRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasData])

  const plotWidth = Math.max(50, width - AXIS_MARGIN)
  const bodySize = clamp((plotWidth / effCount) * 0.6, 1.5, 40)
  const wickSize = Math.max(1, bodySize * 0.18)

  // ── Zoom (rueda del mouse anclado al cursor / botones centrados) ──
  const zoomBy = (deltaY, ratio) => {
    if (total === 0) return
    const next = clamp(
      Math.round(deltaY > 0 ? effCount * 1.2 : effCount / 1.2),
      MIN_COUNT,
      total
    )
    if (next === effCount) return
    // Mantener fija la vela bajo el cursor mientras se hace zoom
    const anchorIdx = start + ratio * effCount
    const newEnd = clamp(Math.round(anchorIdx + (1 - ratio) * next), next, total)
    setCount(next)
    setEnd(newEnd >= total ? null : newEnd)
  }

  wheelHandlerRef.current = (e) => {
    e.preventDefault()
    const rect = chartRef.current?.getBoundingClientRect()
    const ratio = rect ? clamp((e.clientX - rect.left) / rect.width, 0, 1) : 0.5
    zoomBy(e.deltaY, ratio)
  }

  useEffect(() => {
    const el = chartRef.current
    if (!el) return
    const fn = (e) => wheelHandlerRef.current(e)
    el.addEventListener("wheel", fn, { passive: false })
    return () => el.removeEventListener("wheel", fn)
  }, [hasData])

  // ── Pan arrastrando (mouse y touch), estilo exchange ──
  const onPointerDown = (e) => {
    dragRef.current = { x: e.clientX, end: effEnd }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const barWidth = plotWidth / effCount
    const deltaCandles = Math.round((e.clientX - d.x) / barWidth)
    if (deltaCandles === 0) return
    const newEnd = clamp(d.end - deltaCandles, effCount, total)
    setEnd(newEnd >= total ? null : newEnd)
  }
  const onPointerUp = () => {
    dragRef.current = null
  }

  // ── Botones de navegación ──
  const panBy = (candles) => {
    const newEnd = clamp(effEnd + candles, effCount, total)
    setEnd(newEnd >= total ? null : newEnd)
  }
  const goLive = () => setEnd(null)

  // Latest candle values for header stats
  const latestCandle = chartDataWithEma[chartDataWithEma.length - 1] || {}
  const currentPrice = latestCandle.close || 0
  const isLatestBullish = (latestCandle.close || 0) >= (latestCandle.open || 0)

  // Y-axis domain: solo velas VISIBLES (auto-escala al navegar/hacer zoom)
  const allValues = visibleData.flatMap((d) => [d.high, d.low]).filter((v) => Number.isFinite(v))
  const minVal = allValues.length ? Math.min(...allValues) : 0
  const maxVal = allValues.length ? Math.max(...allValues) : 100
  const pad = Math.max((maxVal - minVal) * 0.08, 0.001)
  const domain = [minVal - pad, maxVal + pad]

  // Custom high-tech Tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload
      const isBull = d.close >= d.open
      return (
        <div className="bg-[#08121c]/95 border border-[#16283d] p-2.5 rounded-lg shadow-2xl font-mono text-xs backdrop-blur-md">
          <div className="text-slate-400 text-[10px] mb-1.5 border-b border-[#16283d] pb-1 flex justify-between gap-4">
            <span>{d.time}</span>
            <span className={isBull ? "text-[#00f5c4]" : "text-[#ff3b69]"}>
              {isBull ? "BULLISH" : "BEARISH"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            <span className="text-slate-400">Open:</span>
            <span className="text-white text-right font-medium">${fmt(d.open)}</span>
            <span className="text-slate-400">High:</span>
            <span className="text-white text-right font-medium">${fmt(d.high)}</span>
            <span className="text-slate-400">Low:</span>
            <span className="text-white text-right font-medium">${fmt(d.low)}</span>
            <span className="text-slate-400">Close:</span>
            <span
              className={`text-right font-bold ${
                isBull ? "text-[#00f5c4]" : "text-[#ff3b69]"
              }`}
            >
              ${fmt(d.close)}
            </span>
          </div>
        </div>
      )
    }
    return null
  }

  if (!hasData) {
    return (
      <div className="h-[280px] flex items-center justify-center text-slate-500 font-mono text-xs">
        Awaiting real-time candlestick data...
      </div>
    )
  }

  const navBtnClass =
    "p-1 rounded-md text-slate-400 hover:text-[#00f5c4] hover:bg-[#00f5c4]/10 border border-transparent hover:border-[#00f5c4]/30 transition-colors"

  return (
    <div className="w-full">
      {/* Chart Top Sub-header matching the reference design */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 pb-3 mb-2 border-b border-[#142335] text-xs font-mono">
        {/* Left: LIVE MARKET PRICE ACTION + OHLC */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1.5 text-[#00f5c4] font-bold text-xs tracking-wider">
            <span>📈</span>
            <span>LIVE MARKET PRICE ACTION</span>
          </div>

          {/* OHLC Badges */}
          {latestCandle.open && (
            <div className="flex items-center gap-2 text-[11px] bg-[#09111b] px-2.5 py-0.5 rounded-md border border-[#16283d]">
              <span className="text-slate-400">
                O: <span className="text-slate-200 font-medium">{fmt(latestCandle.open)}</span>
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">
                H: <span className="text-slate-200 font-medium">{fmt(latestCandle.high)}</span>
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">
                L: <span className="text-slate-200 font-medium">{fmt(latestCandle.low)}</span>
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">
                C:{" "}
                <span
                  className={`font-bold ${
                    isLatestBullish ? "text-[#00f5c4]" : "text-[#ff3b69]"
                  }`}
                >
                  {fmt(latestCandle.close)}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Right stats: Spread + Candles + EMA + Controles de navegación */}
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-400 hidden xl:inline">
            Spread: <span className="text-[#00f5c4] font-bold">{spread} USDT</span>
          </span>

          <span className="px-2 py-0.5 rounded bg-[#09111b] border border-[#16283d] text-slate-300 font-medium uppercase hidden sm:inline">
            CANDLES {timeframe}
          </span>

          <span className="px-2 py-0.5 rounded bg-[#00f5c4]/10 border border-[#00f5c4]/30 text-[#00f5c4] font-semibold text-[10px] hidden md:inline">
            EMA 20/50/200
          </span>

          {/* Controles de navegación del gráfico */}
          <div className="flex items-center gap-0.5 bg-[#09111b] border border-[#16283d] rounded-lg px-1 py-0.5">
            <button
              onClick={() => panBy(-Math.max(1, Math.round(effCount / 4)))}
              className={navBtnClass}
              title="Ir atrás en el tiempo"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => panBy(Math.max(1, Math.round(effCount / 4)))}
              className={navBtnClass}
              title="Ir adelante en el tiempo"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <span className="w-px h-3.5 bg-[#16283d] mx-0.5" />
            <button onClick={() => zoomBy(-100, 0.5)} className={navBtnClass} title="Acercar (zoom in)">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => zoomBy(100, 0.5)} className={navBtnClass} title="Alejar (zoom out)">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            {!isLive && (
              <>
                <span className="w-px h-3.5 bg-[#16283d] mx-0.5" />
                <button
                  onClick={goLive}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[#00f5c4] hover:bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[9px] font-bold tracking-wider transition-colors"
                  title="Volver al precio en vivo"
                >
                  <Radio className="w-3 h-3" />
                  LIVE
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Chart Canvas: arrastrar = pan, rueda = zoom */}
      <div
        ref={chartRef}
        className="h-[300px] w-full relative select-none cursor-grab active:cursor-grabbing"
        style={{ touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={visibleData}
            margin={{ top: 12, right: 75, left: 0, bottom: 5 }}
          >
            <defs>
              <filter id="neonGlowCyan" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#00f5c4" floodOpacity="0.6" />
              </filter>
              <filter id="neonGlowPink" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#ff3b69" floodOpacity="0.6" />
              </filter>
            </defs>

            <CartesianGrid
              strokeDasharray="2 2"
              stroke="#132235"
              horizontal={true}
              vertical={true}
            />

            <XAxis
              dataKey="timeLabel"
              tick={{ fill: "#64748b", fontSize: 10 }}
              minTickGap={45}
              axisLine={{ stroke: "#142335" }}
              tickLine={false}
            />

            <YAxis
              domain={domain}
              orientation="right"
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={{ stroke: "#142335" }}
              tickLine={false}
              tickFormatter={(v) => (v > 1 ? v.toFixed(2) : v.toFixed(4))}
            />

            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#244163", strokeDasharray: "3 3" }} />

            {/* Current Price Reference Line & Badge (oculta si queda fuera de la vista) */}
            {currentPrice > 0 && (
              <ReferenceLine
                y={currentPrice}
                ifOverflow="hidden"
                stroke="#00f5c4"
                strokeDasharray="2 2"
                strokeOpacity={0.6}
                label={{
                  value: `$${fmt(currentPrice)}`,
                  position: "right",
                  fill: "#070c14",
                  fontSize: 10,
                  fontWeight: "bold",
                  className: "current-price-badge",
                  style: {
                    backgroundColor: "#00f5c4",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  },
                }}
              />
            )}

            {/* Wick Bar (thin centered line from low to high) */}
            <Bar dataKey="wickRange" barSize={wickSize} isAnimationActive={false}>
              {visibleData.map((entry, index) => {
                const isBull = entry.close >= entry.open
                return (
                  <Cell
                    key={`wick-${index}`}
                    fill={isBull ? "#00f5c4" : "#ff3b69"}
                    fillOpacity={0.8}
                  />
                )
              })}
            </Bar>

            {/* Body Bar (wide rectangle from open to close) */}
            <Bar dataKey="bodyRange" barSize={bodySize} isAnimationActive={false}>
              {visibleData.map((entry, index) => {
                const isBull = entry.close >= entry.open
                return (
                  <Cell
                    key={`body-${index}`}
                    fill={isBull ? "#00f5c4" : "#ff3b69"}
                    filter={isBull ? "url(#neonGlowCyan)" : "url(#neonGlowPink)"}
                  />
                )
              })}
            </Bar>

            {/* EMA 20 (Cyan dashed line) */}
            <Line
              type="monotone"
              dataKey="ema20"
              stroke="#00f5c4"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              dot={false}
              isAnimationActive={false}
            />

            {/* EMA 50 (Orange / Amber solid line) */}
            <Line
              type="monotone"
              dataKey="ema50"
              stroke="#f59e0b"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Floating Current Price Pill on the Right Axis */}
        {currentPrice > 0 && isLive && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 hidden sm:block">
            <div className="px-2 py-0.5 rounded bg-[#00f5c4] text-[#070c14] font-mono font-bold text-[10px] shadow-[0_0_12px_rgba(0,245,196,0.5)]">
              ${fmt(currentPrice)}
            </div>
          </div>
        )}
      </div>

      {/* Hint de navegación + rango visible */}
      <div className="flex items-center justify-between pt-2 text-[10px] font-mono text-slate-600">
        <span>DRAG: PAN · SCROLL: ZOOM</span>
        <span>
          {start + 1}–{effEnd} de {total} velas
          {!isLive && <span className="text-amber-500/80 ml-2">· HISTORIAL</span>}
        </span>
      </div>
    </div>
  )
}
