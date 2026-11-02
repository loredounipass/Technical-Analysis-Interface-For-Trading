"use client"

import React from "react"
import { Gauge } from "lucide-react"
import { ResponsiveContainer, BarChart, Bar, Cell, Tooltip } from "recharts"
import useChartWindow from "@/components/indicators/useChartWindow"
import ChartNavControls from "@/components/indicators/ChartNavControls"
import { formatVolume, fmt } from "@/components/indicators/indicatorFormatters"

// Tarjeta 24H VOLUME & ADX: barras de volumen navegables (pan/zoom) + ratio
// comprador. Recibe la serie de volumen ya construida desde el orquestador.
const VolumeAdxPanel = ({ datos = {}, volumeChartData = [] }) => {
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

  return (
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
          Raw Volume:{" "}
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
  )
}

export default React.memo(VolumeAdxPanel)
