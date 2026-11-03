"use client"

import React from "react"
import { Activity, Zap } from "lucide-react"
import IndicatorCard from "@/components/indicators/IndicatorCard"
import {
  formatVolume,
  formatZoneTime,
  formatLevel,
} from "@/components/indicators/indicatorFormatters"

// Fila de microestructura: Order Flow (trades ejecutados) + Liquidity Swings
// (niveles 2L/2R con clusters de stops potenciales).
const OrderFlowSwingsPanel = ({ datos = {}, dec = 2 }) => {
  // Order Flow data
  const orderFlow = datos.orderFlow || null

  // Dominancia basada en el delta de volumen (convención estándar de order
  // flow), no en el conteo de trades: unas pocas compras grandes pueden
  // dominar el volumen aunque haya más ventas que compras. Bandas simétricas
  // de ±10% respecto al delta para evitar señales ruidosas cerca del equilibrio.
  const deltaPct = orderFlow ? Number(orderFlow.deltaPercent) || 0 : 0
  const dominance = !orderFlow
    ? "NONE"
    : deltaPct > 10
      ? "BUY"
      : deltaPct < -10
        ? "SELL"
        : "BALANCED"

  // Liquidity Swings data
  const hasLiquiditySwings = Array.isArray(datos.liquiditySwings)
  const liquiditySwings = hasLiquiditySwings ? datos.liquiditySwings : []
  const activeSwings = liquiditySwings.filter((s) => s.status === "active")
  const sweptSwings = liquiditySwings.filter((s) => s.status === "swept")

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Order Flow Card */}
      <IndicatorCard
        title="ORDER FLOW (TRADES)"
        icon={<Activity className="w-3.5 h-3.5 text-[#00f5c4]" />}
        badge={
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${
              dominance === "BUY"
                ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]"
                : dominance === "SELL"
                  ? "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69]"
                  : dominance === "BALANCED"
                    ? "bg-amber-500/15 border border-amber-500/40 text-amber-400"
                    : "bg-slate-500/15 border border-slate-500/40 text-slate-400"
            }`}
          >
            {dominance === "BUY"
              ? "BUY DOMINANT"
              : dominance === "SELL"
                ? "SELL DOMINANT"
                : dominance === "BALANCED"
                  ? "BALANCED"
                  : "NO DATA"}
          </span>
        }
        footerLeft={<span>{orderFlow ? `${orderFlow.tradeCount} trades` : "—"}</span>}
        footerRight={<span>{orderFlow ? orderFlow.sideClassification?.replace(/_/g, " ") : "—"}</span>}
      >
        <div className="h-[340px] overflow-y-auto overscroll-contain space-y-2 pr-1 font-mono scrollbar-hidden">
          {!orderFlow ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-xs text-center">
              Waiting for order flow data...
            </div>
          ) : (
            <>
              {orderFlow.source === "candle_volume_direction_proxy" && (
                <div className="px-2 py-1.5 rounded-md bg-cyan-500/5 border border-cyan-500/20 text-[9px] text-cyan-300">
                  PROXY: directional volume from candle bodies (no tick tape available for stocks)
                </div>
              )}
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
                    SELL {orderFlow.sellPercent}% ({formatVolume(orderFlow.sellVolume)})
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

              {/* Recent Trade Tape / Candle Events */}
              {orderFlow.recentTrades && orderFlow.recentTrades.length > 0 && (
                <div className="space-y-0.5">
                  <div className="text-[9px] text-slate-400 uppercase tracking-wider px-1">
                    {/* Se nombra el exchange del tape: el usuario ve que la cinta
                        viene del proveedor elegido, no de ambos mezclados. */}
                    {orderFlow.source === "candle_volume_direction_proxy"
                      ? "Volume Events (Candles)"
                      : `${orderFlow.provider ? `${String(orderFlow.provider).toUpperCase()} \u00b7 ` : ""}Live Trade Tape`}
                  </div>
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
        <div className="h-[340px] overflow-y-auto overscroll-contain space-y-2 pr-1 font-mono scrollbar-hidden">
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
              // Color del nivel por lado: BUY-SIDE en verde, SELL-SIDE en rojo.
              const sideTextColor = isBuySide ? "text-[#00f5c4]" : "text-[#ff3b69]"
              const sideBarColor = isBuySide ? "bg-[#00f5c4]/60" : "bg-[#ff3b69]/60"
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
                        className={`text-[10px] font-bold ${sideTextColor}`}
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
                          className={`text-[10px] tabular-nums ${sideTextColor}`}
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
                          className={`h-full transition-all duration-300 ${sideBarColor} ${
                            Math.abs(Number(distPct)) < 0.5
                              ? (isBuySide ? "shadow-[0_0_6px_#00f5c4]" : "shadow-[0_0_6px_#ff3b69]")
                              : ""
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
  )
}

export default React.memo(OrderFlowSwingsPanel)
