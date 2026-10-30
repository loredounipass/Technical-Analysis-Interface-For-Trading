"use client"

import React from "react"
import IndicatorCard from "@/components/indicators/IndicatorCard"
import ChartCard from "@/components/indicators/ChartCard"
import CandleChart from "@/components/indicators/CandleChart"
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

const IndicatorGrid = ({ datos = {} }) => {
  const dec = datos.decimales ?? 2

  // Prepare candle data
  const candleData = []
  const volumeChartData = []

  if (datos.history && Array.isArray(datos.history.opens)) {
    const len = datos.history.closes.length
    // Hasta 300 velas para que el grafico principal pueda navegarse (pan/zoom)
    const startIdx = Math.max(0, len - 300)

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

  // Barras de volumen: ventana navegable (pan/zoom) sobre las 300 velas
  const volWin = useChartWindow(volumeChartData.length, { defaultCount: 36, minCount: 10 })
  const recentVolumeData = volumeChartData.slice(volWin.start, volWin.effEnd)
  const volBarSize = Math.min(Math.max((volWin.plotWidth / volWin.effCount) * 0.55, 1), 12)

  // Calculate Buyer Ratio
  const totalSignals = (datos.buySignals || 0) + (datos.sellSignals || 0)
  const buyerRatio =
    totalSignals > 0
      ? (((datos.buySignals || 0) / totalSignals) * 100).toFixed(1)
      : "52.8"

  const adxVal = Number(datos.adx) || 39.23

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
            <div className="flex items-center gap-1.5 font-bold tracking-wider text-slate-300 uppercase text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
              <span>24H VOLUME & ADX</span>
            </div>
            <div className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider bg-amber-500/15 border border-amber-500/40 text-amber-400">
              ADX: {fmt(adxVal)} Trend
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
                    formatter={(v) => [formatVolume(v), "Volume"]}
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
              <div className="h-full flex items-center justify-center text-slate-500 font-mono text-xs">
                No volume bars available
              </div>
            )}
          </div>

          {/* Controles de navegacion del volumen */}
          <div className="flex items-center justify-between gap-2 text-[9px] font-mono text-slate-600 pb-1">
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
          <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-slate-400">
            <span>
              Raw Vol:{" "}
              <span className="text-slate-300 font-medium">
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

      {/* 4. Oscillators & ADX Strength */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Stochastic Oscillator */}
        <IndicatorCard
          title="STOCHASTIC OSCILLATOR (14, 3, 3)"
          icon={<Percent className="w-3.5 h-3.5 text-[#00f5c4]" />}
          badge={
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${
                datos.stochK > 80
                  ? "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69]"
                  : datos.stochK < 20
                  ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]"
                  : "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400"
              }`}
            >
              {datos.stochK > 80 ? "Overbought" : datos.stochK < 20 ? "Oversold" : "Neutral"}
            </span>
          }
        >
          <div className="space-y-2.5 font-mono">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#09111b] p-2.5 rounded-md border border-[#16283d]">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">%K Line</div>
                <div className="text-base font-bold text-cyan-400 tabular-nums">
                  {fmt(datos.stochK)}
                </div>
              </div>
              <div className="bg-[#09111b] p-2.5 rounded-md border border-[#16283d]">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider">%D Line</div>
                <div className="text-base font-bold text-[#00f5c4] tabular-nums">
                  {fmt(datos.stochD)}
                </div>
              </div>
            </div>
            {/* Progress gauge */}
            <div className="w-full bg-[#08111a] rounded-full h-1.5 overflow-hidden flex">
              <div
                className="bg-[#00f5c4] h-full transition-all duration-300 shadow-[0_0_8px_#00f5c4]"
                style={{ width: `${Math.min(100, Math.max(0, datos.stochK || 50))}%` }}
              />
            </div>
          </div>
        </IndicatorCard>

        {/* CCI Indicator */}
        <IndicatorCard
          title="CCI (20)"
          icon={<Compass className="w-3.5 h-3.5 text-amber-400" />}
          badge={
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${
                datos.cci > 100
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
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Commodity Channel Index</span>
              <span
                className={`text-lg font-bold tabular-nums ${
                  datos.cci > 100
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
              <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-slate-600 z-10" />
              <div
                className={`h-full transition-all duration-300 ${
                  datos.cci > 100
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
      </div>

      {/* 5. Support and Resistance Levels */}
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
              { level: "S3", value: datos.s3, strength: "WK",  distance: levelDistance(datos.precio, datos.s3) },
            ].map((support) => (
              <div
                key={support.level}
                className="flex items-center justify-between bg-[#00f5c4]/5 hover:bg-[#00f5c4]/10 transition-colors p-2 rounded-md border border-[#00f5c4]/15"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[#00f5c4] font-bold text-xs">{support.level}</span>
                  <span className="text-[9px] text-slate-400 uppercase">[{support.strength}]</span>
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
              { level: "R3", value: datos.r3, strength: "WK",  distance: levelDistance(datos.r3, datos.precio) },
            ].map((resistance) => (
              <div
                key={resistance.level}
                className="flex items-center justify-between bg-[#ff3b69]/5 hover:bg-[#ff3b69]/10 transition-colors p-2 rounded-md border border-[#ff3b69]/15"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[#ff3b69] font-bold text-xs">{resistance.level}</span>
                  <span className="text-[9px] text-slate-400 uppercase">[{resistance.strength}]</span>
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
  const pTime = p.history?.times?.[p.history.times.length - 1]
  const nTime = n.history?.times?.[n.history.times.length - 1]
  if (pTime !== nTime) return false
  return true
})
