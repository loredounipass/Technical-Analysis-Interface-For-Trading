"use client"

import React from "react"
import IndicatorCard from "@/components/indicators/IndicatorCard"
import ChartCard from "@/components/indicators/ChartCard"
import CandleChart from "@/components/indicators/CandleChart"
import LiquidityBubbleMap from "@/components/indicators/LiquidityBubbleMap"
import useChartWindow from "@/components/indicators/useChartWindow"
import ChartNavControls from "@/components/indicators/ChartNavControls"
import {
  Shield,
  Target,
  Gauge,
  Crosshair,
  Percent,
  Waves,
  GitCompare,
  Compass,
  Sparkles,
  CircleDollarSign,
  Layers,
  ArrowDownUp,
  Activity,
  Zap,
} from "lucide-react"
import { ResponsiveContainer, BarChart, Bar, Cell, Tooltip } from "recharts"

// Formats USDT volume compactly: 1.25B / 350.00M / 45.00K
function formatVolume(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return "0.00"
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B"
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M"
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K"
  return n.toFixed(2)
}

function formatLevel(v, decimales = 2) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—"
  return `$${Number(v).toFixed(decimales)}`
}

function levelDistance(a, b) {
  const na = Number(a)
  const nb = Number(b)
  if (!Number.isFinite(na) || !Number.isFinite(nb) || nb === 0) return "0.00"
  return (((na - nb) / nb) * 100).toFixed(2)
}

function fmt(v, d = 2) {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(d) : (0).toFixed(d)
}

function formatZoneTime(timestamp) {
  const time = Number(timestamp)
  if (!Number.isFinite(time) || time <= 0) return "—"
  return new Date(time).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function formatMetric(value, suffix = "", decimals = 2) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? `${numeric.toFixed(decimals)}${suffix}` : "—"
}

const IndicatorGrid = ({ datos = {} }) => {
  const dec = datos.decimales ?? 2

  // Prepare candle data — hasta 500 velas para navegación profunda
  const candleData = []
  const volumeChartData = []

  if (datos.history && Array.isArray(datos.history.opens)) {
    const len = datos.history.closes.length
    const startIdx = Math.max(0, len - 500)

    for (let i = startIdx; i < len; i++) {
      const o = Number(datos.history.opens[i])
      const h = Number(datos.history.highs[i])
      const l = Number(datos.history.lows[i])
      const c = Number(datos.history.closes[i])
      const vol = datos.history.volumes ? Number(datos.history.volumes[i]) : Math.abs(c - o) * 100
      const isBull = c >= o

      const t = new Date(datos.history.times[i]).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Chicago",
      })

      candleData.push({
        time: t,
        open: o,
        high: h,
        low: l,
        close: c,
        wickRange: [l, h],
        bodyRange: [o, c],
      })

      volumeChartData.push({
        time: t,
        volume: vol || 10,
        isBull,
      })
    }
  }

  // Barras de volumen: ventana navegable (pan/zoom) sobre las 500 velas
  const volWin = useChartWindow(volumeChartData.length, { defaultCount: 36, minCount: 10 })
  const recentVolumeData = volumeChartData.slice(volWin.start, volWin.effEnd)
  const volBarSize = Math.min(Math.max((volWin.plotWidth / volWin.effCount) * 0.55, 1), 12)

  // Calculate Buyer Ratio
  const totalSignals = (datos.buySignals || 0) + (datos.sellSignals || 0)
  const buyerRatio =
    totalSignals > 0
      ? (((datos.buySignals || 0) / totalSignals) * 100).toFixed(1)
      : "—"

  const adxVal = Number(datos.adx) || 0
  const hasOrderBlockData = Array.isArray(datos.orderBlocks)
  const hasFvgData = Array.isArray(datos.fairValueGaps)
  const orderBlocks = hasOrderBlockData ? datos.orderBlocks : []
  const fairValueGaps = hasFvgData ? datos.fairValueGaps : []
  const activeOrderBlocks = orderBlocks.filter((zone) => zone.status !== "invalidated")
  const activeFvgs = fairValueGaps.filter((gap) => gap.status !== "filled")

  // Order Flow data
  const orderFlow = datos.orderFlow || null

  // Liquidity Swings data
  const hasLiquiditySwings = Array.isArray(datos.liquiditySwings)
  const liquiditySwings = hasLiquiditySwings ? datos.liquiditySwings : []
  const activeSwings = liquiditySwings.filter((s) => s.status === "active")
  const sweptSwings = liquiditySwings.filter((s) => s.status === "swept")

  return (
    <div className="space-y-4">
      {/* 1. Main Middle Card: Candlestick Chart */}
      <div className="synapse-card p-4">
        <CandleChart
          key={`${datos.symbol}-${datos.timeframe}`}
          data={candleData}
          decimales={dec}
          timeframe={datos.timeframe || "15m"}
          spread="0.02"
        />
      </div>

      {/* 2. Primary Indicator Row (3 Cards matching user design) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: RSI Oscillator */}
        <ChartCard
          title="RSI OSCILLATOR (14)"
          icon={<Gauge className="h-4 w-4 mr-1 text-[#00f5c4]" />}
          type="rsi"
          datos={datos}
        />

        {/* Card 2: MACD Indicator */}
        <ChartCard
          title="MACD (12, 26, 9)"
          icon={<Crosshair className="h-4 w-4 mr-1 text-[#00f5c4]" />}
          type="macd"
          datos={datos}
        />

        {/* Card 3: 24H Volume & ADX */}
        <div className="synapse-card p-3.5 flex flex-col justify-between">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#142335] text-xs font-mono">
            <div className="flex items-center gap-2 font-bold tracking-wider text-white uppercase text-[11px]">
              <div className="w-6 h-6 rounded-md bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.25)] flex-shrink-0">
                <Gauge className="w-3.5 h-3.5" />
              </div>
              <span>24H VOLUME & ADX</span>
            </div>
            <div className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider bg-amber-500/15 border border-amber-500/40 text-amber-400">
              ADX: {adxVal > 0 ? fmt(adxVal) : "—"} Trend
            </div>
          </div>

          {/* Volume Bars */}
          <div
            ref={volWin.containerRef}
            {...volWin.pointerHandlers}
            className="h-[120px] w-full my-1 select-none cursor-grab active:cursor-grabbing"
            style={{ touchAction: "pan-y" }}
          >
            {recentVolumeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={recentVolumeData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(8, 18, 28, 0.95)",
                      border: "1px solid #16283d",
                      borderRadius: "6px",
                      color: "#f1f5f9",
                      fontSize: "11px",
                      fontFamily: "ui-monospace, monospace",
                    }}
                    formatter={(v) => [
                      <span style={{ color: "#ffffff" }}>{formatVolume(v)}</span>,
                      <span style={{ color: "#ffffff" }}>Volume</span>,
                    ]}
                    labelStyle={{ color: "#ffffff" }}
                    itemStyle={{ color: "#ffffff" }}
                  />
                  <Bar dataKey="volume" barSize={volBarSize} isAnimationActive={false}>
                    {recentVolumeData.map((entry, index) => (
                      <Cell
                        key={`vol-${index}`}
                        fill={entry.isBull ? "#00f5c4" : "#ff3b69"}
                        fillOpacity={0.8}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 font-mono text-xs">
                No volume bars available
              </div>
            )}
          </div>

          {/* Controles de navegacion del volumen */}
          <div className="flex items-center justify-between gap-2 text-[9px] font-mono text-slate-300 pb-1">
            <span>{volWin.start + 1}–{volWin.effEnd} de {volumeChartData.length}</span>
            <ChartNavControls
              onPanLeft={() => volWin.panBy(-Math.max(1, Math.round(volWin.effCount / 4)))}
              onPanRight={() => volWin.panBy(Math.max(1, Math.round(volWin.effCount / 4)))}
              onZoomIn={() => volWin.zoomBy(-100, 0.5)}
              onZoomOut={() => volWin.zoomBy(100, 0.5)}
              isLive={volWin.isLive}
              onGoLive={volWin.goLive}
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-white">
            <span>
              Raw Vol:{" "}
              <span className="text-white font-medium">
                ${formatVolume(datos.volumen)}
              </span>
            </span>
            <span>
              Buyer Ratio:{" "}
              <span className="text-[#00f5c4] font-medium">{buyerRatio}%</span>
            </span>
          </div>
        </div>
      </div>

      {/* 3. Secondary Indicators Row (Bollinger Bands & Moving Averages with dynamic Y-axis scaling) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard
          title="BOLLINGER BANDS (20, 2σ)"
          icon={<Waves className="h-4 w-4 mr-1 text-cyan-400" />}
          type="bollinger"
          datos={datos}
        />
        <ChartCard
          title="MOVING AVERAGES (50/100/200)"
          icon={<GitCompare className="h-4 w-4 mr-1 text-[#00f5c4]" />}
          type="ema"
          datos={datos}
        />
      </div>

      {/* 4. Oscillators: Stochastic Oscillator (ChartCard) + Stochastic RSI (ChartCard) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard
          title="STOCHASTIC OSCILLATOR (14, 3, 3)"
          type="stoch"
          datos={datos}
        />
        <ChartCard
          title="STOCHASTIC RSI (14, 3, 3)"
          type="stochRsi"
          datos={datos}
        />
      </div>

      {/* 5. Price Action: Order Blocks & Fair Value Gaps from endpoint OHLC data */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <IndicatorCard
          title="ORDER BLOCKS (CANDIDATES)"
          icon={<Layers className="w-3.5 h-3.5 text-[#00f5c4]" />}
          badge={
            <span className="text-[#00f5c4]">
              {hasOrderBlockData ? `${activeOrderBlocks.length} ACTIVE` : "NO DATA"}
            </span>
          }
          footerLeft={<span>1.2× ATR displacement</span>}
          footerRight={<span>Close-based invalidation</span>}
        >
          <div className="h-[220px] overflow-y-auto overscroll-contain space-y-2 pr-1 font-mono scrollbar-hidden">
            {!hasOrderBlockData ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs text-center">
                Waiting for Order Block endpoint data...
              </div>
            ) : activeOrderBlocks.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs text-center">
                No active candidates in the latest 200 candles
              </div>
            ) : (
              activeOrderBlocks.map((zone) => {
                const isBullish = zone.side === "bullish"
                return (
                  <div
                    key={zone.id}
                    className={`p-2.5 rounded-md border ${
                      isBullish
                        ? "bg-[#00f5c4]/5 border-[#00f5c4]/20"
                        : "bg-[#ff3b69]/5 border-[#ff3b69]/20"
                    }`}
                    title="Candidate price-action zone; not confirmation of institutional orders"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold ${isBullish ? "text-[#00f5c4]" : "text-[#ff3b69]"}`}>
                          {isBullish ? "BULLISH DEMAND" : "BEARISH SUPPLY"}
                        </span>
                        <span className="text-[9px] text-slate-300 uppercase">
                          {zone.status === "tested" ? "RETESTED" : "UNTESTED"}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-400 whitespace-nowrap">
                        {formatZoneTime(zone.confirmationTime)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <span className="text-white text-xs font-medium tabular-nums">
                        {formatLevel(zone.bottom, dec)} — {formatLevel(zone.top, dec)}
                      </span>
                      <span className="text-[10px] text-cyan-300 whitespace-nowrap">
                        {formatMetric(zone.impulseAtr, "× ATR")}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </IndicatorCard>

        <IndicatorCard
          title="FAIR VALUE GAPS (FVG)"
          icon={<ArrowDownUp className="w-3.5 h-3.5 text-cyan-400" />}
          badge={
            <span className="text-cyan-400">
              {hasFvgData ? `${activeFvgs.length} UNFILLED` : "NO DATA"}
            </span>
          }
          footerLeft={<span>3-candle imbalance</span>}
          footerRight={<span>Real-time mitigation</span>}
        >
          <div className="h-[220px] overflow-y-auto overscroll-contain space-y-2 pr-1 font-mono scrollbar-hidden">
            {!hasFvgData ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs text-center">
                Waiting for FVG endpoint data...
              </div>
            ) : activeFvgs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs text-center">
                No open or partial FVGs in the latest 200 candles
              </div>
            ) : (
              activeFvgs.map((gap) => {
                const isBullish = gap.side === "bullish"
                const fillPercent = Math.min(100, Math.max(0, Number(gap.fillPercent) || 0))
                return (
                  <div
                    key={gap.id}
                    className={`p-2.5 rounded-md border ${
                      isBullish
                        ? "bg-[#00f5c4]/5 border-[#00f5c4]/20"
                        : "bg-[#ff3b69]/5 border-[#ff3b69]/20"
                    }`}
                    title="Measured three-candle imbalance; filling is not guaranteed"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold ${isBullish ? "text-[#00f5c4]" : "text-[#ff3b69]"}`}>
                          {isBullish ? "BULLISH FVG" : "BEARISH FVG"}
                        </span>
                        <span className="text-[9px] text-slate-300 uppercase">
                          {gap.status === "partial" ? "PARTIAL" : "OPEN"}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-400 whitespace-nowrap">
                        {formatZoneTime(gap.formedAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <span className="text-white text-xs font-medium tabular-nums">
                        {formatLevel(gap.bottom, dec)} — {formatLevel(gap.top, dec)}
                      </span>
                      <span className="text-[10px] text-slate-300 whitespace-nowrap">
                        50%: {formatLevel(gap.midpoint, dec)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="h-1 flex-1 rounded-full bg-[#08111a] overflow-hidden">
                        <div
                          className={`h-full ${isBullish ? "bg-[#00f5c4]" : "bg-[#ff3b69]"}`}
                          style={{ width: `${fillPercent}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-white tabular-nums w-[54px] text-right">
                        {fillPercent.toFixed(1)}% fill
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </IndicatorCard>
      </div>

      {/* 6. CCI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CCI Indicator */}
        <IndicatorCard
          title="CCI (20)"
          icon={<Compass className="w-3.5 h-3.5 text-amber-400" />}
          badge={
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${datos.cci > 100
                  ? "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69]"
                  : datos.cci < -100
                    ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]"
                    : "bg-amber-500/15 border border-amber-500/40 text-amber-400"
                }`}
            >
              {datos.cci > 100 ? "OB (+100)" : datos.cci < -100 ? "OS (-100)" : "Range"}
            </span>
          }
        >
          <div className="space-y-2.5 font-mono">
            <div className="flex justify-between items-center bg-[#09111b] p-2.5 rounded-md border border-[#16283d]">
              <span className="text-[10px] text-slate-300 uppercase tracking-wider">Commodity Channel Index</span>
              <span
                className={`text-lg font-bold tabular-nums ${datos.cci > 100
                    ? "text-[#ff3b69]"
                    : datos.cci < -100
                      ? "text-[#00f5c4]"
                      : "text-amber-400"
                  }`}
              >
                {fmt(datos.cci)}
              </span>
            </div>
            <div className="w-full bg-[#08111a] rounded-full h-1.5 relative overflow-hidden flex items-center">
              <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-slate-500 z-10" />
              <div
                className={`h-full transition-all duration-300 ${datos.cci > 100
                    ? "bg-[#ff3b69] shadow-[0_0_8px_#ff3b69]"
                    : datos.cci < -100
                      ? "bg-[#00f5c4] shadow-[0_0_8px_#00f5c4]"
                      : "bg-amber-400"
                  }`}
                style={{
                  width: `${Math.min((Math.abs(datos.cci || 0) / 200) * 50, 50)}%`,
                  marginLeft:
                    (datos.cci || 0) < 0
                      ? `${Math.max(50 - Math.min((Math.abs(datos.cci || 0) / 200) * 50, 50), 0)}%`
                      : "50%",
                }}
              />
            </div>
          </div>
        </IndicatorCard>

        {/* MFI (14) Money Flow Index Indicator */}
        <IndicatorCard
          title="MFI (14) MONEY FLOW"
          icon={<CircleDollarSign className="w-3.5 h-3.5 text-[#00f5c4]" />}
          badge={
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${(datos.mfi ?? 50) > 80
                  ? "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69]"
                  : (datos.mfi ?? 50) < 20
                    ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]"
                    : (datos.mfi ?? 50) >= 50
                      ? "bg-[#00f5c4]/10 border border-[#00f5c4]/30 text-[#00f5c4]"
                      : "bg-amber-500/15 border border-amber-500/40 text-amber-400"
                }`}
            >
              {(datos.mfi ?? 50) > 80
                ? "Distribution (OB)"
                : (datos.mfi ?? 50) < 20
                  ? "Accumulation (OS)"
                  : (datos.mfi ?? 50) >= 50
                    ? "Net Inflow"
                    : "Net Outflow"}
            </span>
          }
        >
          <div className="space-y-2.5 font-mono">
            <div className="flex justify-between items-center bg-[#09111b] p-2.5 rounded-md border border-[#16283d]">
              <span className="text-[10px] text-slate-300 uppercase tracking-wider">Institutional Flow Index</span>
              <span
                className={`text-lg font-bold tabular-nums ${(datos.mfi ?? 50) > 80
                    ? "text-[#ff3b69]"
                    : (datos.mfi ?? 50) < 20
                      ? "text-[#00f5c4]"
                      : (datos.mfi ?? 50) >= 50
                        ? "text-[#00f5c4]"
                        : "text-amber-400"
                  }`}
              >
                {fmt(datos.mfi ?? 50.0)}
              </span>
            </div>
            <div className="w-full bg-[#08111a] rounded-full h-1.5 relative overflow-hidden flex items-center">
              {/* Reference markers at 20% and 80% */}
              <div className="absolute left-[20%] top-0 bottom-0 w-[1px] bg-slate-600 z-10" />
              <div className="absolute left-[80%] top-0 bottom-0 w-[1px] bg-slate-600 z-10" />
              <div
                className={`h-full transition-all duration-300 ${(datos.mfi ?? 50) > 80
                    ? "bg-[#ff3b69] shadow-[0_0_8px_#ff3b69]"
                    : (datos.mfi ?? 50) < 20
                      ? "bg-[#00f5c4] shadow-[0_0_8px_#00f5c4]"
                      : (datos.mfi ?? 50) >= 50
                        ? "bg-[#00f5c4] shadow-[0_0_8px_#00f5c4]"
                        : "bg-amber-400"
                  }`}
                style={{
                  width: `${Math.min(100, Math.max(0, datos.mfi ?? 50))}%`,
                }}
              />
            </div>
          </div>
        </IndicatorCard>
      </div>

      {/* 7. Order Flow (Executed Trades) & Liquidity Swings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Order Flow Card */}
        <IndicatorCard
          title="ORDER FLOW (TRADES)"
          icon={<Activity className="w-3.5 h-3.5 text-[#00f5c4]" />}
          badge={
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${
                orderFlow
                  ? orderFlow.buyPercent > 55
                    ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]"
                    : orderFlow.buyPercent < 45
                      ? "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69]"
                      : "bg-amber-500/15 border border-amber-500/40 text-amber-400"
                  : "bg-slate-500/15 border border-slate-500/40 text-slate-400"
              }`}
            >
              {orderFlow
                ? orderFlow.buyPercent > 55
                  ? "BUY DOMINANT"
                  : orderFlow.buyPercent < 45
                    ? "SELL DOMINANT"
                    : "BALANCED"
                : "NO DATA"}
            </span>
          }
          footerLeft={<span>{orderFlow ? `${orderFlow.tradeCount} trades` : "—"}</span>}
          footerRight={<span>{orderFlow ? orderFlow.sideClassification?.replace(/_/g, " ") : "—"}</span>}
        >
          <div className="h-[220px] overflow-y-auto overscroll-contain space-y-2 pr-1 font-mono scrollbar-hidden">
            {!orderFlow ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs text-center">
                Waiting for executed trade data (crypto only)...
              </div>
            ) : (
              <>
                {/* Delta Bar */}
                <div className="bg-[#09111b] p-2.5 rounded-md border border-[#16283d]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-300 uppercase tracking-wider">Volume Delta</span>
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        orderFlow.delta > 0 ? "text-[#00f5c4]" : orderFlow.delta < 0 ? "text-[#ff3b69]" : "text-amber-400"
                      }`}
                    >
                      {orderFlow.delta > 0 ? "+" : ""}
                      {formatVolume(orderFlow.delta)}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#08111a] rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-[#00f5c4] transition-all duration-300"
                      style={{ width: `${Math.max(2, orderFlow.buyPercent || 0)}%` }}
                    />
                    <div
                      className="h-full bg-[#ff3b69] transition-all duration-300"
                      style={{ width: `${Math.max(2, 100 - (orderFlow.buyPercent || 0))}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5 text-[9px]">
                    <span className="text-[#00f5c4] tabular-nums">
                      BUY {orderFlow.buyPercent}% ({formatVolume(orderFlow.buyVolume)})
                    </span>
                    <span className="text-[#ff3b69] tabular-nums">
                      SELL {(100 - orderFlow.buyPercent).toFixed(1)}% ({formatVolume(orderFlow.sellVolume)})
                    </span>
                  </div>
                </div>

                {/* Trade Counts */}
                <div className="flex gap-2">
                  <div className="flex-1 bg-[#00f5c4]/5 border border-[#00f5c4]/15 rounded-md p-2 text-center">
                    <div className="text-[9px] text-slate-400 uppercase">Buy Trades</div>
                    <div className="text-[#00f5c4] font-bold text-sm tabular-nums">{orderFlow.buyTradeCount}</div>
                  </div>
                  <div className="flex-1 bg-[#ff3b69]/5 border border-[#ff3b69]/15 rounded-md p-2 text-center">
                    <div className="text-[9px] text-slate-400 uppercase">Sell Trades</div>
                    <div className="text-[#ff3b69] font-bold text-sm tabular-nums">{orderFlow.sellTradeCount}</div>
                  </div>
                  <div className="flex-1 bg-amber-500/5 border border-amber-500/15 rounded-md p-2 text-center">
                    <div className="text-[9px] text-slate-400 uppercase">Delta %</div>
                    <div
                      className={`font-bold text-sm tabular-nums ${
                        orderFlow.deltaPercent > 0 ? "text-[#00f5c4]" : orderFlow.deltaPercent < 0 ? "text-[#ff3b69]" : "text-amber-400"
                      }`}
                    >
                      {orderFlow.deltaPercent > 0 ? "+" : ""}
                      {orderFlow.deltaPercent}%
                    </div>
                  </div>
                </div>

                {/* Recent Trade Tape */}
                {orderFlow.recentTrades && orderFlow.recentTrades.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="text-[9px] text-slate-400 uppercase tracking-wider px-1">Live Trade Tape</div>
                    {orderFlow.recentTrades.slice(0, 8).map((trade, idx) => {
                      const isBuy = trade.side === "buy"
                      return (
                        <div
                          key={trade.id || idx}
                          className={`flex items-center justify-between px-2 py-1 rounded text-[10px] tabular-nums ${
                            isBuy
                              ? "bg-[#00f5c4]/5 border-l-2 border-[#00f5c4]/50"
                              : "bg-[#ff3b69]/5 border-l-2 border-[#ff3b69]/50"
                          }`}
                        >
                          <span className={`font-bold w-8 ${isBuy ? "text-[#00f5c4]" : "text-[#ff3b69]"}`}>
                            {isBuy ? "BUY" : "SELL"}
                          </span>
                          <span className="text-white">${Number(trade.price).toFixed(dec)}</span>
                          <span className="text-slate-300">{Number(trade.size).toFixed(dec > 4 ? 2 : 4)}</span>
                          <span className="text-slate-500 text-[9px]">
                            {new Date(trade.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </IndicatorCard>

        {/* Liquidity Swings Card */}
        <IndicatorCard
          title="LIQUIDITY SWINGS"
          icon={<Zap className="w-3.5 h-3.5 text-amber-400" />}
          badge={
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${
                hasLiquiditySwings
                  ? activeSwings.length > 0
                    ? "bg-amber-500/15 border border-amber-500/40 text-amber-400"
                    : "bg-slate-500/15 border border-slate-500/40 text-slate-400"
                  : "bg-slate-500/15 border border-slate-500/40 text-slate-400"
              }`}
            >
              {hasLiquiditySwings
                ? `${activeSwings.length} ACTIVE${sweptSwings.length > 0 ? ` · ${sweptSwings.length} SWEPT` : ""}`
                : "NO DATA"}
            </span>
          }
          footerLeft={<span>2L/2R swing confirmation</span>}
          footerRight={<span>Potential stop clusters</span>}
        >
          <div className="h-[220px] overflow-y-auto overscroll-contain space-y-2 pr-1 font-mono scrollbar-hidden">
            {!hasLiquiditySwings ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs text-center">
                Waiting for Liquidity Swing data...
              </div>
            ) : liquiditySwings.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs text-center">
                No swing levels detected in the latest 200 candles
              </div>
            ) : (
              liquiditySwings.map((swing) => {
                const isBuySide = swing.side === "buy_side"
                const isActive = swing.status === "active"
                const isSwept = swing.status === "swept"
                const distPct =
                  datos.precio && swing.price
                    ? (((swing.price - datos.precio) / datos.precio) * 100).toFixed(2)
                    : null

                let statusColor = "text-amber-400"
                let statusBg = "bg-amber-500/10 border-amber-500/20"
                let statusLabel = "ACTIVE"
                if (isSwept) {
                  statusColor = "text-purple-400"
                  statusBg = "bg-purple-500/10 border-purple-500/20"
                  statusLabel = "SWEPT"
                } else if (swing.status === "broken") {
                  statusColor = "text-slate-500"
                  statusBg = "bg-slate-500/10 border-slate-500/20"
                  statusLabel = "BROKEN"
                }

                return (
                  <div
                    key={swing.id}
                    className={`p-2.5 rounded-md border ${statusBg}`}
                    title="Confirmed swing level — potential stop liquidity cluster"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold ${
                            isBuySide ? "text-[#ff3b69]" : "text-[#00f5c4]"
                          }`}
                        >
                          {isBuySide ? "▲ BUY-SIDE" : "▼ SELL-SIDE"}
                        </span>
                        <span className={`text-[9px] uppercase font-bold ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-400 whitespace-nowrap">
                        {formatZoneTime(swing.formedAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <span className="text-white text-xs font-medium tabular-nums">
                        {formatLevel(swing.price, dec)}
                      </span>
                      <div className="flex items-center gap-2">
                        {distPct !== null && (
                          <span
                            className={`text-[10px] tabular-nums ${
                              Number(distPct) > 0 ? "text-[#ff3b69]" : "text-[#00f5c4]"
                            }`}
                          >
                            {Number(distPct) > 0 ? "+" : ""}
                            {distPct}%
                          </span>
                        )}
                        {isSwept && swing.sweepSizePercent != null && (
                          <span className="text-[9px] text-purple-300 tabular-nums">
                            sweep: {Number(swing.sweepSizePercent).toFixed(3)}%
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Visual proximity bar */}
                    {isActive && distPct !== null && (
                      <div className="mt-1.5">
                        <div className="w-full h-1 bg-[#08111a] rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              Math.abs(Number(distPct)) < 0.5
                                ? "bg-amber-400 shadow-[0_0_6px_#fbbf24]"
                                : isBuySide
                                  ? "bg-[#ff3b69]/60"
                                  : "bg-[#00f5c4]/60"
                            }`}
                            style={{ width: `${Math.max(5, Math.min(100, 100 - Math.abs(Number(distPct)) * 10))}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </IndicatorCard>
      </div>

      {/* 8. Liquidity Bubble Map (Order Book Depth) */}
      <div className="grid grid-cols-1 gap-4">
        <LiquidityBubbleMap
          depthRaw={datos.depthRaw}
          precio={datos.precio}
          decimales={dec}
        />
      </div>

      {/* 8. Support and Resistance Levels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Support */}
        <IndicatorCard
          title="SUPPORT LEVELS"
          icon={<Shield className="w-3.5 h-3.5 text-[#00f5c4]" />}
        >
          <div className="space-y-1.5 font-mono">
            {[
              { level: "S1", value: datos.s1, strength: "STR", distance: levelDistance(datos.precio, datos.s1) },
              { level: "S2", value: datos.s2, strength: "MED", distance: levelDistance(datos.precio, datos.s2) },
              { level: "S3", value: datos.s3, strength: "WK", distance: levelDistance(datos.precio, datos.s3) },
            ].map((support) => (
              <div
                key={support.level}
                className="flex items-center justify-between bg-[#00f5c4]/5 hover:bg-[#00f5c4]/10 transition-colors p-2 rounded-md border border-[#00f5c4]/15"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[#00f5c4] font-bold text-xs">{support.level}</span>
                  <span className="text-[9px] text-slate-300 uppercase">[{support.strength}]</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-white font-medium text-xs tabular-nums">
                    {formatLevel(support.value, dec)}
                  </span>
                  <span className="text-[10px] text-[#00f5c4] tabular-nums">
                    -{support.distance}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </IndicatorCard>

        {/* Resistance */}
        <IndicatorCard
          title="RESISTANCE LEVELS"
          icon={<Target className="w-3.5 h-3.5 text-[#ff3b69]" />}
        >
          <div className="space-y-1.5 font-mono">
            {[
              { level: "R1", value: datos.r1, strength: "STR", distance: levelDistance(datos.r1, datos.precio) },
              { level: "R2", value: datos.r2, strength: "MED", distance: levelDistance(datos.r2, datos.precio) },
              { level: "R3", value: datos.r3, strength: "WK", distance: levelDistance(datos.r3, datos.precio) },
            ].map((resistance) => (
              <div
                key={resistance.level}
                className="flex items-center justify-between bg-[#ff3b69]/5 hover:bg-[#ff3b69]/10 transition-colors p-2 rounded-md border border-[#ff3b69]/15"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[#ff3b69] font-bold text-xs">{resistance.level}</span>
                  <span className="text-[9px] text-slate-300 uppercase">[{resistance.strength}]</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-white font-medium text-xs tabular-nums">
                    {formatLevel(resistance.value, dec)}
                  </span>
                  <span className="text-[10px] text-[#ff3b69] tabular-nums">
                    +{resistance.distance}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </IndicatorCard>
      </div>
    </div>
  )
}

export default React.memo(IndicatorGrid, (prev, next) => {
  const p = prev.datos || {}
  const n = next.datos || {}
  if (p.precio !== n.precio) return false
  if (p.symbol !== n.symbol || p.timeframe !== n.timeframe) return false
  if (p.orderBlocks !== n.orderBlocks || p.fairValueGaps !== n.fairValueGaps) return false
  if (p.orderFlow !== n.orderFlow || p.liquiditySwings !== n.liquiditySwings) return false
  const pTime = p.history?.times?.[p.history.times.length - 1]
  const nTime = n.history?.times?.[n.history.times.length - 1]
  if (pTime !== nTime) return false
  return true
})
