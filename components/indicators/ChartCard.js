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

const ChartCard = ({ title, icon, type, datos = {} }) => {
  // Dark Tooltip Style matching Synapse Terminal
  const TOOLTIP_STYLE = {
    backgroundColor: "rgba(8, 18, 28, 0.95)",
    border: "1px solid #16283d",
    borderRadius: "6px",
    color: "#f1f5f9",
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

  const getLastValidValues = (arr, n) => {
    if (!Array.isArray(arr) || arr.length === 0) return []
    const validIndices = []
    for (let i = arr.length - 1; i >= 0 && validIndices.length < n; i--) {
      if (arr[i] !== null && arr[i] !== undefined && !isNaN(arr[i])) {
        validIndices.push(i)
      }
    }
    return validIndices.reverse()
  }

  const ensureMinPoints = (dataArray) => {
    if (!Array.isArray(dataArray)) return dataArray
    if (dataArray.length === 1) {
      const first = { ...dataArray[0], name: `${dataArray[0].name}_dup` }
      dataArray.unshift(first)
    }
    return dataArray
  }

  // 1. RSI OSCILLATOR
  if (type === "rsi") {
    let rsiChartData = []
    if (datos.history && Array.isArray(datos.history.rsi) && datos.history.rsi.length > 0) {
      const validIndices = getLastValidValues(datos.history.rsi, 40)
      if (validIndices.length > 0) {
        rsiChartData = validIndices.map((idx, i) => ({
          name: `${i}`,
          rsi: datos.history.rsi[idx],
          rsiSignal: datos.history.rsiStoch?.[idx] ?? null,
        }))
        if (datos.rsi !== null && datos.rsi !== undefined && rsiChartData.length > 0) {
          rsiChartData[rsiChartData.length - 1].rsi = datos.rsi
        }
        if (datos.rsiStoch !== null && datos.rsiStoch !== undefined && rsiChartData.length > 0) {
          rsiChartData[rsiChartData.length - 1].rsiSignal = datos.rsiStoch
        }
      }
    }
    if (rsiChartData.length === 0 && datos.rsi !== null && datos.rsi !== undefined) {
      rsiChartData = [{ name: "0", rsi: datos.rsi, rsiSignal: datos.rsiStoch || 50 }]
    }
    rsiChartData = ensureMinPoints(rsiChartData)

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
        {/* Header */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#142335] text-xs font-mono">
          <div className="flex items-center gap-1.5 font-bold tracking-wider text-slate-300 uppercase text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00f5c4] shadow-[0_0_8px_#00f5c4]" />
            <span>{title || "RSI OSCILLATOR (14)"}</span>
          </div>
          <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${badgeColor}`}>
            {safeToFixed(rsiVal, 2)} {statusText}
          </div>
        </div>

        {/* Chart */}
        <div className="h-[120px] w-full my-1">
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
            <div className="h-full flex items-center justify-center text-slate-500 font-mono text-xs">
              No historical RSI data
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-slate-400">
          <span>Oversold: <span className="text-slate-300">30</span></span>
          <span>Overbought: <span className="text-slate-300">70</span></span>
        </div>
      </div>
    )
  }

  // 2. MACD INDICATOR
  if (type === "macd") {
    let macdChartData = []
    if (datos.history && Array.isArray(datos.history.macd) && datos.history.macd.length > 0) {
      const validIndices = getLastValidValues(datos.history.macd, 40)
      if (validIndices.length > 0) {
        macdChartData = validIndices.map((idx, i) => {
          const m = datos.history.macd[idx]
          const s = datos.history.macd_signal?.[idx] ?? null
          const h = m !== null && s !== null ? m - s : 0
          return { name: `${i}`, macd: m, signal: s, hist: h }
        })
        if (datos.macdValue !== null && datos.macdValue !== undefined && macdChartData.length > 0) {
          const last = macdChartData.length - 1
          macdChartData[last].macd = datos.macdValue
          macdChartData[last].signal = datos.macdSignal
          macdChartData[last].hist = datos.macdValue - (datos.macdSignal || 0)
        }
      }
    }
    if (macdChartData.length === 0 && datos.macdValue !== null && datos.macdValue !== undefined) {
      macdChartData = [
        {
          name: "0",
          macd: datos.macdValue,
          signal: datos.macdSignal,
          hist: datos.macdValue - (datos.macdSignal || 0),
        },
      ]
    }
    macdChartData = ensureMinPoints(macdChartData)

    const macdVal = Number(datos.macdValue) || 0
    const histVal = Number(datos.macdHistogram ?? (datos.macdValue - (datos.macdSignal || 0))) || 0
    const isBull = macdVal > 0
    const badgeColor = isBull
      ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]"
      : "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69]"

    return (
      <div className="synapse-card p-3.5 flex flex-col justify-between">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#142335] text-xs font-mono">
          <div className="flex items-center gap-1.5 font-bold tracking-wider text-slate-300 uppercase text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00f5c4] shadow-[0_0_8px_#00f5c4]" />
            <span>{title || "MACD (12, 26, 9)"}</span>
          </div>
          <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${badgeColor}`}>
            {safeToFixed(macdVal, 2)} {isBull ? "Bullish" : "Bearish"}
          </div>
        </div>

        {/* Chart with Histogram Bars + MACD & Signal curves */}
        <div className="h-[120px] w-full my-1">
          {macdChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={macdChartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#132235" vertical={false} />
                <ReferenceLine y={0} stroke="#1f3752" />
                <Tooltip contentStyle={TOOLTIP_STYLE} />

                {/* Histogram Bars */}
                <Bar dataKey="hist" barSize={3} isAnimationActive={false}>
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
            <div className="h-full flex items-center justify-center text-slate-500 font-mono text-xs">
              No historical MACD data
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-slate-400">
          <span>
            Histogram:{" "}
            <span className={histVal >= 0 ? "text-[#00f5c4]" : "text-[#ff3b69]"}>
              {safeToFixed(histVal, 2)}
            </span>
          </span>
          <span>
            Signal:{" "}
            <span className="text-cyan-400">
              {Math.abs(histVal) < 0.05 ? "Convergence" : "Divergence"}
            </span>
          </span>
        </div>
      </div>
    )
  }

  // 3. BOLLINGER BANDS (20, 2σ) - With dynamic auto Y-Axis scaling to show real wave action
  if (type === "bollinger") {
    let bbChartData = []
    if (datos.history && Array.isArray(datos.history.closes) && datos.history.closes.length > 0) {
      const validIndices = getLastValidValues(datos.history.closes, 40)
      if (validIndices.length > 0) {
        bbChartData = validIndices.map((idx, i) => ({
          name: `${i}`,
          upper: datos.history.bb_upper?.[idx] ?? null,
          middle: datos.history.bb_middle?.[idx] ?? null,
          lower: datos.history.bb_lower?.[idx] ?? null,
          price: datos.history.closes[idx],
        }))
        if (datos.precio !== null && datos.precio !== undefined && bbChartData.length > 0) {
          const last = bbChartData.length - 1
          bbChartData[last] = {
            name: `${last}`,
            upper: datos.bbUpper ?? bbChartData[last].upper,
            middle: datos.bbMiddle ?? bbChartData[last].middle,
            lower: datos.bbLower ?? bbChartData[last].lower,
            price: datos.precio,
          }
        }
      }
    }
    bbChartData = ensureMinPoints(bbChartData)

    // Compute dynamic Y-axis domain so Bollinger Bands use full vertical resolution
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
          <div className="flex items-center gap-1.5 font-bold tracking-wider text-slate-300 uppercase text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
            <span>{title || "BOLLINGER BANDS (20, 2σ)"}</span>
          </div>
          <div
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
              isAbove
                ? "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69]"
                : isBelow
                ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]"
                : "bg-slate-800 text-slate-300 border border-slate-700"
            }`}
          >
            {isAbove ? "Upper Break" : isBelow ? "Lower Break" : "In Band"}
          </div>
        </div>

        <div className="h-[120px] w-full my-1">
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
                {/* Upper Band: Coral red */}
                <Line
                  type="monotone"
                  dataKey="upper"
                  stroke="#ff3b69"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={true}
                  isAnimationActive={false}
                />
                {/* Middle Band: Amber dashed */}
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
                {/* Lower Band: Neon Cyan */}
                <Line
                  type="monotone"
                  dataKey="lower"
                  stroke="#00f5c4"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={true}
                  isAnimationActive={false}
                />
                {/* Actual Price Path: White subtle curve */}
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#f1f5f9"
                  strokeWidth={1}
                  strokeOpacity={0.6}
                  dot={false}
                  connectNulls={true}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 font-mono text-xs">
              No Bollinger Bands data
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-slate-400">
          <span>U: <span className="text-[#ff3b69] font-medium">${safeToFixed(datos.bbUpper, datos.decimales)}</span></span>
          <span>M: <span className="text-amber-400 font-medium">${safeToFixed(datos.bbMiddle, datos.decimales)}</span></span>
          <span>L: <span className="text-[#00f5c4] font-medium">${safeToFixed(datos.bbLower, datos.decimales)}</span></span>
        </div>
      </div>
    )
  }

  // 4. MOVING AVERAGES (EMA 50 / 100 / 200) - With dynamic auto Y-Axis scaling
  if (type === "ema") {
    let emaChartData = []
    if (datos.history && Array.isArray(datos.history.closes) && datos.history.closes.length > 0) {
      const validIndices = getLastValidValues(datos.history.closes, 40)
      if (validIndices.length > 0) {
        emaChartData = validIndices.map((idx, i) => ({
          name: `${i}`,
          ema50: datos.history.ema50?.[idx] ?? null,
          ema100: datos.history.ema100?.[idx] ?? null,
          ema200: datos.history.ema200?.[idx] ?? null,
          price: datos.history.closes[idx],
        }))
        if (datos.precio !== null && datos.precio !== undefined && emaChartData.length > 0) {
          const last = emaChartData.length - 1
          emaChartData[last] = {
            name: `${last}`,
            ema50: datos.ema50 ?? emaChartData[last].ema50,
            ema100: datos.ema100 ?? emaChartData[last].ema100,
            ema200: datos.ema200 ?? emaChartData[last].ema200,
            price: datos.precio,
          }
        }
      }
    }
    emaChartData = ensureMinPoints(emaChartData)

    // Compute dynamic Y-axis domain so the 3 EMAs are clearly differentiated vertically
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
          <div className="flex items-center gap-1.5 font-bold tracking-wider text-slate-300 uppercase text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00f5c4] shadow-[0_0_8px_#00f5c4]" />
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

        <div className="h-[120px] w-full my-1">
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
                {/* EMA 50: Neon Cyan */}
                <Line
                  type="monotone"
                  dataKey="ema50"
                  stroke="#00f5c4"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={true}
                  isAnimationActive={false}
                />
                {/* EMA 100: Electric Sky Blue */}
                <Line
                  type="monotone"
                  dataKey="ema100"
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={true}
                  isAnimationActive={false}
                />
                {/* EMA 200: Coral Pink */}
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
            <div className="h-full flex items-center justify-center text-slate-500 font-mono text-xs">
              No EMA data
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-slate-400">
          <span>EMA50: <span className="text-[#00f5c4] font-medium">${safeToFixed(datos.ema50, datos.decimales)}</span></span>
          <span>EMA100: <span className="text-[#38bdf8] font-medium">${safeToFixed(datos.ema100, datos.decimales)}</span></span>
          <span>EMA200: <span className="text-[#ff3b69] font-medium">${safeToFixed(datos.ema200, datos.decimales)}</span></span>
        </div>
      </div>
    )
  }

  return null
}

export default React.memo(ChartCard)
