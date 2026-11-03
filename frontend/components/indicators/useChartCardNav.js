"use client"

import React from "react"
import useChartWindow from "@/components/indicators/useChartWindow"
import ChartNavControls from "@/components/indicators/ChartNavControls"

// Navegación pan/zoom idéntica para todos los gráficos de ChartCard: expone la
// ventana (`win`), los handlers de interacción y el render de los controles.
export default function useChartCardNav(datos) {
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

  return { win, historyLen, chartInteraction, chartCursor, renderNavControls }
}
