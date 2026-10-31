"use client"

import React, { useMemo } from "react"
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
import useChartWindow from "@/components/indicators/useChartWindow"
import ChartNavControls from "@/components/indicators/ChartNavControls"
import { CandlestickChart, Activity } from "lucide-react"

export default function CandleChart({
  data = [],
  decimales = 2,
  timeframe = "15m",
  spread = "0.02",
}) {
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

  // Ventana visible con espacio a la derecha y pan más allá del último precio.
  const total = chartDataWithEma.length
  const win = useChartWindow(total, {
    defaultCount: 60,
    minCount: 10,
    rightMargin: 12,
    allowRightPan: true,
  })
  const visibleData = Array.from({ length: win.effCount }, (_, index) => (
    chartDataWithEma[win.start + index] || {
      timeLabel: "",
      open: null,
      high: null,
      low: null,
      close: null,
      wickRange: null,
      bodyRange: null,
      ema20: null,
      ema50: null,
      isPlaceholder: true,
    }
  ))
  const visibleRealEnd = Math.min(win.effEnd, total)
  const visibleRealCount = Math.max(0, visibleRealEnd - win.start)
  const visibleRange = visibleRealCount > 0 ? `${win.start + 1}–${visibleRealEnd}` : "0–0"
  const isLive = win.isLive

  const bodySize = Math.min(Math.max((win.plotWidth / win.effCount) * 0.6, 1.5), 40)
  const wickSize = Math.max(1, bodySize * 0.18)

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
      if (!d || d.isPlaceholder) return null
      const isBull = d.close >= d.open
      return (
        <div className="bg-[#08121c]/95 border border-[#16283d] p-2.5 rounded-lg shadow-2xl font-mono text-xs backdrop-blur-md">
          <div className="text-slate-300 text-[10px] mb-1.5 border-b border-[#16283d] pb-1 flex justify-between gap-4">
            <span className="text-white font-medium">{d.time}</span>
            <span className={isBull ? "text-[#00f5c4] font-bold" : "text-[#ff3b69] font-bold"}>
              {isBull ? "BULLISH" : "BEARISH"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            <span className="text-slate-300">Open:</span>
            <span className="text-white text-right font-medium">${fmt(d.open)}</span>
            <span className="text-slate-300">High:</span>
            <span className="text-white text-right font-medium">${fmt(d.high)}</span>
            <span className="text-slate-300">Low:</span>
            <span className="text-white text-right font-medium">${fmt(d.low)}</span>
            <span className="text-slate-300">Close:</span>
            <span
              className={`text-right font-bold ${isBull ? "text-[#00f5c4]" : "text-[#ff3b69]"
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
      <div className="h-[280px] flex items-center justify-center text-slate-400 font-mono text-xs">
        Awaiting real-time candlestick data...
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Chart Top Sub-header matching the reference design */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 pb-3 mb-2 border-b border-[#142335] text-xs font-mono">
        {/* Left: LIVE MARKET PRICE ACTION + OHLC */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2 text-[#00f5c4] font-bold text-xs tracking-wider">
            <div className="w-6 h-6 rounded-md bg-[#00f5c4]/10 border border-[#00f5c4]/30 flex items-center justify-center text-[#00f5c4] shadow-[0_0_8px_rgba(0,245,196,0.25)]">
              <CandlestickChart className="w-3.5 h-3.5" />
            </div>
            <span className="text-white">LIVE MARKET PRICE ACTION</span>
          </div>

          {/* OHLC Badges en blanco y cyan */}
          {latestCandle.open && (
            <div className="flex items-center gap-2 text-[11px] bg-[#09111b] px-2.5 py-0.5 rounded-md border border-[#16283d]">
              <span className="text-slate-300">
                O: <span className="text-white font-medium">{fmt(latestCandle.open)}</span>
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-300">
                H: <span className="text-white font-medium">{fmt(latestCandle.high)}</span>
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-300">
                L: <span className="text-white font-medium">{fmt(latestCandle.low)}</span>
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-300">
                C:{" "}
                <span
                  className={`font-bold ${isLatestBullish ? "text-[#00f5c4]" : "text-[#ff3b69]"
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
          <span className="text-slate-300 hidden xl:inline">
            Spread: <span className="text-[#00f5c4] font-bold">{spread} USDT</span>
          </span>

          <span className="px-2 py-0.5 rounded bg-[#09111b] border border-[#16283d] text-white font-medium uppercase hidden sm:inline">
            CANDLES {timeframe}
          </span>

          <span className="px-2 py-0.5 rounded bg-[#00f5c4]/10 border border-[#00f5c4]/30 text-[#00f5c4] font-semibold text-[10px] hidden md:inline">
            EMA 20/50/200
          </span>

          {/* Controles de navegación del gráfico (llevar hasta atrás / zoom / live) */}
          <ChartNavControls
            onGoStart={win.goStart}
            onPanLeftBig={() => win.panBy(-50)}
            onPanLeft={() => win.panBy(-Math.max(1, Math.round(win.effCount / 4)))}
            onPanRight={() => win.panBy(Math.max(1, Math.round(win.effCount / 4)))}
            onPanRightBig={() => win.panBy(50)}
            onZoomIn={() => win.zoomBy(-100, 0.5)}
            onZoomOut={() => win.zoomBy(100, 0.5)}
            isLive={isLive}
            onGoLive={win.goLive}
          />
        </div>
      </div>

      {/* Main Chart Canvas: arrastrar = pan, rueda = zoom */}
      <div
        ref={win.containerRef}
        className="h-[300px] w-full relative select-none cursor-grab active:cursor-grabbing"
        style={{ touchAction: "pan-y" }}
        {...win.pointerHandlers}
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
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              minTickGap={45}
              axisLine={{ stroke: "#142335" }}
              tickLine={false}
            />

            <YAxis
              domain={domain}
              orientation="right"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              axisLine={{ stroke: "#142335" }}
              tickLine={false}
              tickFormatter={(v) => (v > 1 ? v.toFixed(2) : v.toFixed(4))}
            />

            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#244163", strokeDasharray: "3 3" }} />

            {/* Current Price Reference Line */}
            {currentPrice > 0 && (
              <ReferenceLine
                y={currentPrice}
                ifOverflow="hidden"
                stroke="#00f5c4"
                strokeDasharray="2 2"
                strokeOpacity={0.6}
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

      </div>

      {/* Hint de navegación + rango visible con texto en blanco */}
      <div className="flex items-center justify-between pt-2 text-[10px] font-mono text-slate-400">
        <span className="flex items-center gap-1.5 text-slate-300">
          <Activity className="w-3 h-3 text-[#00f5c4]" />
          <span>DRAG: DESPLAZAR · RUEDA: ZOOM · &lt;&lt; LLEVAR HASTA ATRÁS</span>
        </span>
        <span className="text-white font-medium">
          {visibleRange} de {total} velas
          {!isLive && win.effEnd <= total && (
            <span className="text-amber-400 ml-2 font-bold tracking-wider">· HISTORIAL</span>
          )}
        </span>
      </div>
    </div>
  )
}
