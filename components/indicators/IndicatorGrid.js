"use client"

import React from "react"
import ChartCard from "@/components/indicators/ChartCard"
import CandleChart from "@/components/indicators/CandleChart"
import LiquidityBubbleMap from "@/components/indicators/LiquidityBubbleMap"
import VolumeAdxPanel from "@/components/indicators/VolumeAdxPanel"
import PriceActionZonesPanel from "@/components/indicators/PriceActionZonesPanel"
import MomentumOscillatorsPanel from "@/components/indicators/MomentumOscillatorsPanel"
import OrderFlowSwingsPanel from "@/components/indicators/OrderFlowSwingsPanel"
import SupportResistancePanel from "@/components/indicators/SupportResistancePanel"
import { buildCandleAndVolumeSeries } from "@/components/indicators/indicatorSeries"
import { Gauge, Crosshair, Waves, GitCompare } from "lucide-react"

// Orquestador del grid de indicadores: prepara las series compartidas y
// compone cada bloque de análisis en su panel dedicado (sub-archivos).
const IndicatorGrid = ({ datos = {} }) => {
  const dec = datos.decimales ?? 2

  // Series compartidas: velas para el gráfico principal y volumen para la
  // tarjeta 24H Volume & ADX.
  const { candleData, volumeChartData } = buildCandleAndVolumeSeries(datos)

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
        <VolumeAdxPanel datos={datos} volumeChartData={volumeChartData} />
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
      <PriceActionZonesPanel datos={datos} dec={dec} />

      {/* 6. Momentum osciladores: CCI + MFI */}
      <MomentumOscillatorsPanel datos={datos} />

      {/* 7. Order Flow (Executed Trades) & Liquidity Swings */}
      <OrderFlowSwingsPanel datos={datos} dec={dec} />

      {/* 8. Liquidity Bubble Map (Order Book Depth) */}
      <div className="grid grid-cols-1 gap-4">
        <LiquidityBubbleMap
          depthRaw={datos.depthRaw}
          precio={datos.precio}
          decimales={dec}
        />
      </div>

      {/* 9. Support and Resistance Levels */}
      <SupportResistancePanel datos={datos} dec={dec} />
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
