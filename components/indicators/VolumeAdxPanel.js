"use client"

import React from "react"
import { Gauge } from "lucide-react"
import { ResponsiveContainer, BarChart, Bar, Cell, Tooltip } from "recharts"
import useChartWindow from "@/components/indicators/useChartWindow"
import ChartNavControls from "@/components/indicators/ChartNavControls"
import { formatVolume } from "@/components/indicators/indicatorFormatters"

// Numero FIJO de velas mas recientes que reporta el "Window Vol". Es estable
// frente al pan/zoom del grafico (las barras navegables siguen siendo libres).
const VOL_WINDOW = 24

// Formatea volumen en MONEDA BASE (ETH, BTC, acciones). Es el dato crudo del
// exchange, sin conversion a USDT, asi que se muestra tal cual (no con K/M de
// dolares). Miles o mas -> separador de miles; por debajo -> 2 decimales.
const formatBase = (v) => {
  if (!Number.isFinite(v) || v <= 0) return "\u2014"
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B"
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M"
  if (v >= 1000) return Math.round(v).toLocaleString("en-US")
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

// Tarjeta VOLUME {tf}: barras de volumen navegables (pan/zoom) + ratio
// comprador. El ADX vive ahora en su propia tarjeta (AdxChart). Recibe la serie
// de volumen ya construida desde el orquestador.
const VolumeAdxPanel = ({ datos = {}, volumeChartData = [] }) => {
  const volWin = useChartWindow(volumeChartData.length, { defaultCount: VOL_WINDOW, minCount: 10 })
  const recentVolumeData = volumeChartData.slice(volWin.start, volWin.effEnd)
  const volBarSize = Math.min(Math.max((volWin.plotWidth / volWin.effCount) * 0.55, 1), 12)

  // Volumen de la ULTIMA VELA del timeframe activo: es el numero entendible y
  // auto-adaptable (en 1D = volumen del dia, en 15m = volumen de ese bloque),
  // igual que el indicador VOL por vela de Binance y el "Current Candle Volume"
  // que lee el agente. Se prefiere datos.volCandle (fuente unica del backend, la
  // misma que ve el chat) y se cae a la ultima barra del grafico si aun no llega.
  // (Antes se mostraba la suma de 24 velas: "Window Vol (24 1D)" eran 24 DIAS,
  // ~$4.88B, que no representaba ninguna medida concreta y confundia.)
  const tfLabel = (datos.timeframe || "").toUpperCase()
  const lastBar = volumeChartData.length
    ? volumeChartData[volumeChartData.length - 1]
    : null
  const candleVolume =
    Number(datos.volCandle) || (lastBar ? Number(lastBar.volume) || 0 : 0)
  // Volumen base EXACTO de la ultima vela (crudo del exchange, sin conversion).
  // Es la cifra fiable; el $ (candleVolume) es una estimacion base x cierre.
  const baseVolume = Number(datos.volCandleBase) || 0
  const baseAsset = datos.baseAsset || ""

  // Buyer Vol = % del VOLUMEN EJECUTADO correspondiente a compras agresoras
  // (order flow real de la cinta de trades). Es volumen negociado, NO votos
  // de indicadores. Fallback stocks: dominancia compradora del proxy de
  // volumen de velas (buyerPercent). Si no hay dato real, se muestra vacío.
  const orderFlow = datos.orderFlow
  const buyerVolRaw =
    orderFlow && orderFlow.buyPercent != null
      ? Number(orderFlow.buyPercent)
      : datos.buyerPercent != null
        ? Number(datos.buyerPercent)
        : null
  const buyerRatio = buyerVolRaw != null && Number.isFinite(buyerVolRaw)
    ? buyerVolRaw.toFixed(1)
    : "\u2014"

  return (
    <div className="synapse-card p-3.5 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#142335] text-xs font-mono">
        <div className="flex items-center gap-2 font-bold tracking-wider text-white uppercase text-[11px]">
          <div className="w-6 h-6 rounded-md bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.25)] flex-shrink-0">
            <Gauge className="w-3.5 h-3.5" />
          </div>
          <span>{`VOLUME${tfLabel ? ` ${tfLabel}` : ""}`}</span>
        </div>
        <div className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider border bg-slate-500/15 border-slate-500/40 text-slate-300">
          {tfLabel ? `${tfLabel} SPOT` : "SPOT VOLUME"}
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
          Last{tfLabel ? ` ${tfLabel}` : ""} Vol:{" "}
          {baseVolume > 0 ? (
            <span className="text-white font-medium">
              {formatBase(baseVolume)}
              {baseAsset ? ` ${baseAsset}` : ""}
              <span className="text-slate-400"> (${formatVolume(candleVolume)})</span>
            </span>
          ) : (
            <span className="text-white font-medium">
              ${formatVolume(candleVolume)}
            </span>
          )}
        </span>
        <span>
          Buyer Vol:{" "}
          <span
            className={`font-medium ${
              buyerRatio === "\u2014"
                ? "text-slate-400"
                : Number(buyerRatio) >= 50
                  ? "text-[#00f5c4]"
                  : "text-[#ff3b69]"
            }`}
          >
            {buyerRatio === "\u2014" ? "\u2014" : `${buyerRatio}%`}
          </span>
        </span>
      </div>
    </div>
  )
}

export default React.memo(VolumeAdxPanel)
