"use client"

import React from "react"
import { Layers, ArrowDownUp } from "lucide-react"
import IndicatorCard from "@/components/indicators/IndicatorCard"
import {
  formatZoneTime,
  formatLevel,
  formatMetric,
} from "@/components/indicators/indicatorFormatters"

// Fila de Price Action: Order Blocks (candidatos) + Fair Value Gaps (FVG),
// derivados de los datos OHLC del endpoint.
const PriceActionZonesPanel = ({ datos = {}, dec = 2 }) => {
  const hasOrderBlockData = Array.isArray(datos.orderBlocks)
  const hasFvgData = Array.isArray(datos.fairValueGaps)
  const orderBlocks = hasOrderBlockData ? datos.orderBlocks : []
  const fairValueGaps = hasFvgData ? datos.fairValueGaps : []
  const activeOrderBlocks = orderBlocks.filter((zone) => zone.status !== "invalidated")
  const activeFvgs = fairValueGaps.filter((gap) => gap.status !== "filled")

  return (
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
  )
}

export default React.memo(PriceActionZonesPanel)
