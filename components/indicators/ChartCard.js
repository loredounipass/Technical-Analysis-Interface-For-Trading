"use client"

import React from "react"
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  Bar,
  Cell,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts"
import useChartWindow from "@/components/indicators/useChartWindow"
import ChartNavControls from "@/components/indicators/ChartNavControls"
import { Gauge, Crosshair, Waves, GitCompare, Percent, Sparkles } from "lucide-react"

const ChartCard = ({ title, icon, type, datos = {} }) => {
  // Navegación pan/zoom compartida
  const historyLen = datos?.history?.closes?.length || 0
  const win = useChartWindow(historyLen, { defaultCount: 40, minCount: 10 })

  const chartInteraction = {
    ref: win.containerRef,
    ...win.pointerHandlers,
    style: { touchAction: "pan-y" },
  }
  const chartCursor = "select-none cursor-grab active:cursor-grabbing"

  const renderNavControls = () => (
    <div className="flex items-center justify-between gap-2 text-[9px] font-mono text-slate-300 pb-1">
      <span>{win.start + 1}–{win.effEnd} de {historyLen}</span>
      <ChartNavControls
        onPanLeftBig={() => win.panBy(-50)}
        onPanLeft={() => win.panBy(-Math.max(1, Math.round(win.effCount / 4)))}
        onPanRight={() => win.panBy(Math.max(1, Math.round(win.effCount / 4)))}
        onPanRightBig={() => win.panBy(50)}
        onZoomIn={() => win.zoomBy(-100, 0.5)}
        onZoomOut={() => win.zoomBy(100, 0.5)}
        isLive={win.isLive}
        onGoLive={win.goLive}
      />
    </div>
  )

  // Dark Tooltip Style matching Synapse Terminal (todo texto en blanco/cyan)
  const TOOLTIP_STYLE = {
    backgroundColor: "rgba(8, 18, 28, 0.95)",
    border: "1px solid #16283d",
    borderRadius: "6px",
    color: "#ffffff",
    backdropFilter: "blur(6px)",
    fontSize: "11px",
    fontFamily: "ui-monospace, monospace",
    boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
  }

  const safeToFixed = (v, d = 2) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return (0).toFixed(d)
    return n.toFixed(d)
  }

  const ensureMinPoints = (dataArray) => {
    if (!Array.isArray(dataArray)) return dataArray
    if (dataArray.length === 1) {
      const first = { ...dataArray[0], name: `${dataArray[0].name}_dup` }
      dataArray.unshift(first)
    }
    return dataArray
  }

  // 1. RSI OSCILLATOR (14)
  if (type === "rsi") {
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
      ? "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69]"
      : isOS
        ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]"
        : "bg-[#00f5c4]/10 border border-[#00f5c4]/30 text-[#00f5c4]"

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
                <ReferenceLine y={70} stroke="#ff3b69" strokeDasharray="3 3" strokeOpacity={0.3} />
                <ReferenceLine y={30} stroke="#00f5c4" strokeDasharray="3 3" strokeOpacity={0.3} />
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

        {/* Footer con letras blancas */}
        <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-slate-300">
          <span>Oversold: <span className="text-white font-medium">30</span></span>
          <span>Overbought: <span className="text-white font-medium">70</span></span>
        </div>
      </div>
    )
  }

  // 2. MACD INDICATOR (12, 26, 9)
  if (type === "macd") {
    let macdFullData = []
    if (datos.history && Array.isArray(datos.history.macd) && datos.history.macd.length > 0) {
      macdFullData = datos.history.macd.map((m, i) => {
        const s = datos.history.macd_signal?.[i] ?? null
        const h = m !== null && s !== null ? m - s : 0
        return { name: `${i}`, macd: m, signal: s, hist: h }
      })
      if (datos.macdValue !== null && datos.macdValue !== undefined && macdFullData.length > 0) {
        const last = macdFullData.length - 1
        macdFullData[last].macd = datos.macdValue
        macdFullData[last].signal = datos.macdSignal
        macdFullData[last].hist = datos.macdValue - (datos.macdSignal || 0)
      }
    }
    if (macdFullData.length === 0 && datos.macdValue !== null && datos.macdValue !== undefined) {
      macdFullData = [
        {
          name: "0",
          macd: datos.macdValue,
          signal: datos.macdSignal,
          hist: datos.macdValue - (datos.macdSignal || 0),
        },
      ]
    }
    let macdChartData = ensureMinPoints(macdFullData.slice(win.start, win.effEnd))
    const histBarSize = Math.min(Math.max((win.plotWidth / win.effCount) * 0.5, 1), 10)

    const macdVal = Number(datos.macdValue) || 0
    const histVal = Number(datos.macdHistogram ?? (datos.macdValue - (datos.macdSignal || 0))) || 0
    const isBull = macdVal > 0
    const badgeColor = isBull
      ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]"
      : "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69]"

    return (
      <div className="synapse-card p-3.5 flex flex-col justify-between">
        {/* Header con squircle icon */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#142335] text-xs font-mono">
          <div className="flex items-center gap-2 font-bold tracking-wider text-white uppercase text-[11px]">
            <div className="w-6 h-6 rounded-md bg-[#00f5c4]/10 border border-[#00f5c4]/30 flex items-center justify-center text-[#00f5c4] shadow-[0_0_8px_rgba(0,245,196,0.25)] flex-shrink-0">
              <Crosshair className="w-3.5 h-3.5" />
            </div>
            <span>{title || "MACD (12, 26, 9)"}</span>
          </div>
          <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${badgeColor}`}>
            {safeToFixed(macdVal, 2)} {isBull ? "Bullish" : "Bearish"}
          </div>
        </div>

        {/* Chart with Histogram Bars + MACD & Signal curves */}
        <div {...chartInteraction} className={`h-[120px] w-full my-1 ${chartCursor}`}>
          {macdChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={macdChartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#132235" vertical={false} />
                <ReferenceLine y={0} stroke="#1f3752" />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: "#ffffff" }}
                  itemStyle={{ color: "#ffffff" }}
                  formatter={(value, name) => {
                    const formattedValue = safeToFixed(value, 2)
                    if (name === "hist") {
                      return [
                        <span style={{ color: "#ffffff" }}>{formattedValue}</span>,
                        <span style={{ color: "#ffffff" }}>hist</span>,
                      ]
                    }
                    return [formattedValue, name]
                  }}
                />

                {/* Histogram Bars */}
                <Bar dataKey="hist" barSize={histBarSize} isAnimationActive={false}>
                  {macdChartData.map((entry, index) => (
                    <Cell
                      key={`hist-${index}`}
                      fill={(entry.hist || 0) >= 0 ? "#00f5c4" : "#ff3b69"}
                      fillOpacity={0.7}
                    />
                  ))}
                </Bar>

                {/* MACD Line (Cyan) */}
                <Line
                  type="monotone"
                  dataKey="macd"
                  stroke="#00f5c4"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={true}
                  isAnimationActive={false}
                />

                {/* Signal Line (Pink/Coral) */}
                <Line
                  type="monotone"
                  dataKey="signal"
                  stroke="#ff3b69"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={true}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 font-mono text-xs">
              No historical MACD data
            </div>
          )}
        </div>

        {renderNavControls()}

        {/* Footer con letras blancas */}
        <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-white">
          <span>
            Histogram:{" "}
            <span className={histVal >= 0 ? "text-[#00f5c4] font-medium" : "text-[#ff3b69] font-medium"}>
              {safeToFixed(histVal, 2)}
            </span>
          </span>
          <span>
            Signal:{" "}
            <span className="text-white font-medium">
              {Math.abs(histVal) < 0.05 ? "Convergence" : "Divergence"}
            </span>
          </span>
        </div>
      </div>
    )
  }

  // 3. BOLLINGER BANDS (20, 2σ)
  if (type === "bollinger") {
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
          <span>U: <span className="text-[#ff3b69] font-medium">${safeToFixed(datos.bbUpper, datos.decimales)}</span></span>
          <span>M: <span className="text-amber-400 font-medium">${safeToFixed(datos.bbMiddle, datos.decimales)}</span></span>
          <span>L: <span className="text-[#00f5c4] font-medium">${safeToFixed(datos.bbLower, datos.decimales)}</span></span>
        </div>
      </div>
    )
  }

  // 4. MOVING AVERAGES (EMA 50 / 100 / 200)
  if (type === "ema") {
    let emaFullData = []
    if (datos.history && Array.isArray(datos.history.closes) && datos.history.closes.length > 0) {
      emaFullData = datos.history.closes.map((c, i) => ({
        name: `${i}`,
        ema50: datos.history.ema50?.[i] ?? null,
        ema100: datos.history.ema100?.[i] ?? null,
        ema200: datos.history.ema200?.[i] ?? null,
        price: c,
      }))
      if (datos.precio !== null && datos.precio !== undefined && emaFullData.length > 0) {
        const last = emaFullData.length - 1
        emaFullData[last] = {
          name: `${last}`,
          ema50: datos.ema50 ?? emaFullData[last].ema50,
          ema100: datos.ema100 ?? emaFullData[last].ema100,
          ema200: datos.ema200 ?? emaFullData[last].ema200,
          price: datos.precio,
        }
      }
    }
    let emaChartData = ensureMinPoints(emaFullData.slice(win.start, win.effEnd))

    const emaValues = emaChartData
      .flatMap((d) => [d.ema50, d.ema100, d.ema200, d.price])
      .filter((v) => Number.isFinite(v))
    const minEma = emaValues.length > 0 ? Math.min(...emaValues) : 0
    const maxEma = emaValues.length > 0 ? Math.max(...emaValues) : 100
    const padEma = Math.max((maxEma - minEma) * 0.15, 0.001)
    const emaDomain = [minEma - padEma, maxEma + padEma]

    const isBullTrend = datos.precio > datos.ema50 && datos.ema50 > datos.ema200

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
              <LineChart data={emaChartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#132235" vertical={false} />
                <YAxis domain={emaDomain} hide={true} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value, name) => {
                    const val = `$${safeToFixed(value, datos.decimales)}`
                    if (name === "ema50") return [val, "EMA 50 (Fast)"]
                    if (name === "ema100") return [val, "EMA 100 (Mid)"]
                    if (name === "ema200") return [val, "EMA 200 (Slow)"]
                    if (name === "price") return [val, "Price"]
                    return [val, name]
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="ema50"
                  stroke="#00f5c4"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={true}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="ema100"
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={true}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="ema200"
                  stroke="#ff3b69"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={true}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 font-mono text-xs">
              No EMA data
            </div>
          )}
        </div>

        {renderNavControls()}

        <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-slate-300">
          <span>EMA50: <span className="text-[#00f5c4] font-medium">${safeToFixed(datos.ema50, datos.decimales)}</span></span>
          <span>EMA100: <span className="text-[#38bdf8] font-medium">${safeToFixed(datos.ema100, datos.decimales)}</span></span>
          <span>EMA200: <span className="text-[#ff3b69] font-medium">${safeToFixed(datos.ema200, datos.decimales)}</span></span>
        </div>
      </div>
    )
  }

  // 5. STOCHASTIC OSCILLATOR (14, 3, 3) - %K & %D Curves
  if (type === "stoch") {
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
          <span>%K: <span className="text-[#00f5c4] font-medium">{safeToFixed(kVal, 2)}</span></span>
          <span>%D: <span className="text-[#ff3b69] font-medium">{safeToFixed(dVal, 2)}</span></span>
          <span>Zone: <span className="text-white font-medium">20 / 80</span></span>
        </div>
      </div>
    )
  }

  // 6. STOCHASTIC RSI (14, 3, 3)
  if (type === "stochRsi") {
    let stochRsiFullData = []
    if (datos.history && Array.isArray(datos.history.rsiStoch) && datos.history.rsiStoch.length > 0) {
      stochRsiFullData = datos.history.rsiStoch.map((v, i) => ({
        name: `${i}`,
        stochRsi: v,
      }))
      if (datos.rsiStoch !== null && datos.rsiStoch !== undefined && stochRsiFullData.length > 0) {
        stochRsiFullData[stochRsiFullData.length - 1].stochRsi = datos.rsiStoch
      }
    }
    if (stochRsiFullData.length === 0 && datos.rsiStoch !== null && datos.rsiStoch !== undefined) {
      stochRsiFullData = [
        { name: "0", stochRsi: datos.rsiStoch },
        { name: "1", stochRsi: datos.rsiStoch },
      ]
    }
    let stochRsiChartData = ensureMinPoints(stochRsiFullData.slice(win.start, win.effEnd))

    const rsiStochVal = Number(datos.rsiStoch) || 50
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
                  formatter={(value) => [`${safeToFixed(value, 2)}`, "Stoch RSI"]}
                />
                <ReferenceLine y={80} stroke="#ff3b69" strokeDasharray="3 3" strokeOpacity={0.35} />
                <ReferenceLine y={20} stroke="#00f5c4" strokeDasharray="3 3" strokeOpacity={0.35} />
                <Line
                  type="monotone"
                  dataKey="stochRsi"
                  stroke="#38bdf8"
                  strokeWidth={2}
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

        {/* Footer con letras blancas */}
        <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-slate-300">
          <span>Oversold: <span className="text-[#00f5c4] font-medium">20</span></span>
          <span>Current: <span className="text-white font-medium">{safeToFixed(rsiStochVal, 2)}</span></span>
          <span>Overbought: <span className="text-[#ff3b69] font-medium">80</span></span>
        </div>
      </div>
    )
  }

  return null
}

export default React.memo(ChartCard)
